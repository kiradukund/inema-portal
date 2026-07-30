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

module.exports = { normalizeRelativeTargets, stripExcelTables }
