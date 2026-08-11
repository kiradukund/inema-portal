/**
 * Shared OOXML sanitizing helpers for preparing xlsx templates that were
 * authored/exported by tools other than real Excel, for use with ExcelJS.
 *
 * Confirmed root cause of "valid zip but Excel calls it corrupt": ExcelJS
 * does not fully round-trip Excel Table (ListObject) definitions. Diffing a
 * table before/after an ExcelJS load+writeBuffer with zero edits showed:
 *   - totalsRowShown flips from "0" to "1" with no actual totals row present
 *   - headerRowDxfId/dataDxfId/etc. attributes are dropped
 *   - the workbook's whole <dxfs> differential-formatting collection is
 *     emptied to count="0", even though the table's other attributes still
 *     imply richer formatting
 * That's an internally inconsistent Table definition, which is exactly the
 * class of defect real Excel's strict OOXML validator rejects while lenient
 * readers (ExcelJS itself, LibreOffice) tolerate. Since none of our fill code
 * relies on Table-level styling (every cell's style is set explicitly), the
 * safe fix is to remove the Table definitions entirely and keep the sheets
 * as plain cell ranges.
 */
const path = require('path')

function ownerDir(relsPath) {
  return path.posix.dirname(path.posix.dirname(relsPath))
}

// Rewrite every absolute Target="/xl/..." in every .rels file to a path
// relative to that .rels file's owning directory. Some non-Excel writers use
// OPC-legal absolute targets that ExcelJS's relationship resolver can't
// follow, so worksheet/table relationships silently fail to resolve.
async function normalizeRelativeTargets(zip) {
  const relsFiles = Object.keys(zip.files).filter(f => f.endsWith('.rels'))
  for (const relPath of relsFiles) {
    const file = zip.file(relPath)
    if (!file) continue
    const dir = ownerDir(relPath)
    const xml = await file.async('string')
    const rewritten = xml.replace(/Target="(\/[^"]+)"/g, (_m, target) => {
      const abs = target.replace(/^\//, '')
      const rel = path.posix.relative(dir, abs)
      return `Target="${rel}"`
    })
    zip.file(relPath, rewritten)
  }
}

// Remove all Excel Table (ListObject) definitions: the xl/tables/*.xml parts,
// the <tableParts> block in each worksheet that references them, the
// sheet->table relationships, and the matching [Content_Types].xml overrides.
async function stripExcelTables(zip) {
  const tableParts = Object.keys(zip.files).filter(f => /^xl\/tables\/table\d+\.xml$/.test(f))
  if (tableParts.length === 0) return

  const sheetRelFiles = Object.keys(zip.files).filter(f => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(f))
  for (const relPath of sheetRelFiles) {
    const xml = await zip.file(relPath).async('string')
    if (!/\/table"/.test(xml)) continue
    const stripped = xml.replace(/<Relationship[^>]*Type="[^"]*\/table"[^>]*\/>/g, '')
    zip.file(relPath, stripped)

    const sheetPath = relPath.replace('/_rels/', '/').replace('.rels', '')
    const sheetFile = zip.file(sheetPath)
    if (!sheetFile) continue
    const sheetXml = await sheetFile.async('string')
    const withoutTableParts = sheetXml
      .replace(/<tableParts[^>]*>[\s\S]*?<\/tableParts>/g, '')
      .replace(/<tableParts[^>]*\/>/g, '')
    zip.file(sheetPath, withoutTableParts)
  }

  for (const p of tableParts) zip.remove(p)

  const contentTypesPath = '[Content_Types].xml'
  if (zip.file(contentTypesPath)) {
    let ct = await zip.file(contentTypesPath).async('string')
    ct = ct.replace(/<Override PartName="\/xl\/tables\/table\d+\.xml"[^>]*\/>/g, '')
    zip.file(contentTypesPath, ct)
  }
}

// Remove every formula that references another workbook (Excel's
// '[1]SheetName'!A1 / [2]Sheet10!$O$7 syntax — the bracketed number indexes
// into <externalReferences> in xl/workbook.xml). Confirmed present in the
// real BNR filings: 31 cells across 9 of 10 sheets, almost all boilerplate
// header cells pointing at a shared master workbook that isn't part of this
// file. ExcelJS doesn't round-trip external references reliably, and real
// Excel warns/repairs on a dangling external link regardless — since every
// such cell already carries Excel's own last-computed value in <v>, the fix
// is to drop the <f>...</f> element and keep the cached <v>, turning the
// cell from a live external formula into a plain static value with the
// exact number/text it already displayed.
async function resolveExternalLinks(zip) {
  const sheetFiles = Object.keys(zip.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
  let resolvedCount = 0
  for (const sheetPath of sheetFiles) {
    const xml = await zip.file(sheetPath).async('string')
    // Excludes self-closing <f t="shared" si="N"/> tags (shared-formula
    // references with no formula text of their own, and no closing </f>)
    // -- without this exclusion the regex, finding no </f> immediately
    // after a self-closing tag, kept scanning forward for the *next* </f>
    // anywhere in the sheet and could delete everything in between,
    // including unrelated cells and whole rows. Confirmed against the real
    // June 2026 file, which has exactly this shared-formula pattern
    // immediately before an external-link cell.
    const stripped = xml.replace(/<f(?![^>]*\/>)[^>]*>((?:(?!<\/f>)[\s\S])*\[\d+\][\s\S]*?)<\/f>/g, () => {
      resolvedCount++
      return ''
    })
    if (stripped !== xml) zip.file(sheetPath, stripped)
  }
  if (resolvedCount === 0) return

  // Remove the now-unreferenced xl/externalLinks/* parts (both the link
  // definitions and their own _rels) …
  for (const p of Object.keys(zip.files)) {
    if (/^xl\/externalLinks\//.test(p)) zip.remove(p)
  }

  // … the <externalReference r:id="..."/> entries in xl/workbook.xml …
  const wbPath = 'xl/workbook.xml'
  if (zip.file(wbPath)) {
    let wbXml = await zip.file(wbPath).async('string')
    wbXml = wbXml.replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, '')
    zip.file(wbPath, wbXml)
  }

  // … the matching relationships in xl/_rels/workbook.xml.rels …
  const wbRelsPath = 'xl/_rels/workbook.xml.rels'
  if (zip.file(wbRelsPath)) {
    let relsXml = await zip.file(wbRelsPath).async('string')
    relsXml = relsXml.replace(/<Relationship[^>]*Type="[^"]*\/externalLink"[^>]*\/>/g, '')
    zip.file(wbRelsPath, relsXml)
  }

  // … and the dangling [Content_Types].xml overrides.
  const contentTypesPath = '[Content_Types].xml'
  if (zip.file(contentTypesPath)) {
    let ct = await zip.file(contentTypesPath).async('string')
    ct = ct.replace(/<Override PartName="\/xl\/externalLinks\/externalLink\d+\.xml"[^>]*\/>/g, '')
    zip.file(contentTypesPath, ct)
  }
}

// Remove Excel's newer "threaded comments" (xl/threadedComments/*.xml +
// xl/persons/person.xml), which the legacy comment/vmlDrawing stripping
// above doesn't touch — a different relationship type
// (.../2017/10/relationships/threadedComment) and a different part path.
// Confirmed present in the real BNR filings (2 threadedComment parts,
// referenced from sheet1/sheet2's own .rels). Same rationale as the legacy
// comment strip: these are prep notes, not data.
async function stripThreadedComments(zip) {
  const threadedParts = Object.keys(zip.files).filter(
    f => /^xl\/threadedComments\/threadedComment\d+\.xml$/.test(f) || f === 'xl/persons/person.xml'
  )
  if (threadedParts.length === 0) return

  const sheetRelFiles = Object.keys(zip.files).filter(f => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(f))
  for (const relPath of sheetRelFiles) {
    const xml = await zip.file(relPath).async('string')
    if (!/relationships\/threadedComment"/.test(xml)) continue
    const stripped = xml.replace(/<Relationship[^>]*Type="[^"]*relationships\/threadedComment"[^>]*\/>/g, '')
    zip.file(relPath, stripped)
  }

  for (const p of threadedParts) zip.remove(p)

  const contentTypesPath = '[Content_Types].xml'
  if (zip.file(contentTypesPath)) {
    let ct = await zip.file(contentTypesPath).async('string')
    ct = ct.replace(/<Override PartName="\/xl\/threadedComments\/threadedComment\d+\.xml"[^>]*\/>/g, '')
    ct = ct.replace(/<Override PartName="\/xl\/persons\/person\.xml"[^>]*\/>/g, '')
    zip.file(contentTypesPath, ct)
  }
}

module.exports = { normalizeRelativeTargets, stripExcelTables, resolveExternalLinks, stripThreadedComments }
