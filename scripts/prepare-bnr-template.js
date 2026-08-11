/**
 * One-time sanitizer for the official BNR reporting template.
 *
 * The template as issued by BNR/the preparer has a few non-standard OOXML
 * patterns that don't survive ExcelJS (this project's xlsx library):
 *
 *   1. Cell comments live at xl/comments/comment1.xml and comment2.xml.
 *      ExcelJS only recognizes xl/commentsN.xml (no subfolder), so these
 *      parts are never indexed and it crashes dereferencing an empty
 *      lookup. The comments are prep notes, not data, so we just drop the
 *      comment + vmlDrawing relationships (and their <legacyDrawing> refs)
 *      for the two affected sheets.
 *   2. Every relationship file in the workbook uses absolute
 *      Target="/xl/..." paths. This is legal OPC but ExcelJS expects paths
 *      relative to the owning part's directory, so worksheet/table
 *      relationships silently fail to resolve.
 *   3. The workbook's Excel Tables don't survive an ExcelJS load+save
 *      round-trip intact (totalsRowShown flips to "1" with no real totals
 *      row, dxf style references get dropped) — an internally inconsistent
 *      Table definition that real Excel's strict validator rejects even
 *      though the zip itself is well-formed. None of our fill code depends
 *      on Table-level styling, so we remove the Table definitions and keep
 *      the sheets as plain cell ranges.
 *   4. Threaded comments (xl/threadedComments/*.xml + xl/persons/person.xml)
 *      are a different part path/relationship type than the legacy comments
 *      in fix 1 — not caught by that fix, stripped the same way.
 *   5. Real filed reports contain formulas referencing other workbooks
 *      (Excel's '[1]SheetName'!A1 syntax, e.g. a shared master workbook that
 *      isn't part of this file). ExcelJS doesn't round-trip these reliably
 *      and real Excel warns on the dangling link regardless, so each such
 *      formula is replaced with its own last-computed cached value and the
 *      external link parts are removed.
 *
 * Run once whenever BNR issues a new template, or whenever a real filed
 * report becomes the new base file for the next quarter's generation:
 *   node scripts/prepare-bnr-template.js <source.xlsx> [public/bnr_template.xlsx]
 */
const JSZip = require('jszip')
const fs = require('fs')
const path = require('path')
const { normalizeRelativeTargets, stripExcelTables, resolveExternalLinks, stripThreadedComments } = require('./lib/xlsx-sanitize')

const SRC = process.argv[2]
const OUT = process.argv[3] || path.join(__dirname, '..', 'public', 'bnr_template.xlsx')

if (!SRC) {
  console.error('Usage: node scripts/prepare-bnr-template.js <source.xlsx> [output.xlsx]')
  process.exit(1)
}

async function main() {
  const buf = fs.readFileSync(SRC)
  const zip = await JSZip.loadAsync(buf)

  // 1. Strip unresolvable comment/vmlDrawing relationships + legacyDrawing refs.
  const sheetRelFiles = Object.keys(zip.files).filter(f => /xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(f))
  for (const relPath of sheetRelFiles) {
    const xml = await zip.file(relPath).async('string')
    if (!/\/(comments|vmlDrawing)"/.test(xml)) continue
    const stripped = xml.replace(/<Relationship[^>]*Type="[^"]*\/(comments|vmlDrawing)"[^>]*\/>/g, '')
    zip.file(relPath, stripped)

    const sheetPath = relPath.replace('/_rels/', '/').replace('.rels', '')
    const sheetXml = await zip.file(sheetPath).async('string')
    zip.file(sheetPath, sheetXml.replace(/<legacyDrawing[^>]*\/>/g, ''))
  }

  // Remove the now-orphaned comment/vml parts so the package stays clean.
  for (const p of Object.keys(zip.files)) {
    if (/^xl\/comments\/comment\d+\.xml$/.test(p) || /^xl\/drawings\/commentsDrawing\d+\.vml$/.test(p)) {
      zip.remove(p)
    }
  }

  // [Content_Types].xml still declares content types for the parts just
  // removed above (dangling <Override PartName="..."/> entries).
  const contentTypesPath = '[Content_Types].xml'
  if (zip.file(contentTypesPath)) {
    let ct = await zip.file(contentTypesPath).async('string')
    ct = ct.replace(/<Override PartName="\/xl\/comments\/comment\d+\.xml"[^>]*\/>/g, '')
    zip.file(contentTypesPath, ct)
  }

  // 2. Remove Excel Tables — see file header comment for why.
  await stripExcelTables(zip)

  // 3. Remove threaded comments (newer Excel feature, different part path
  //    than the legacy comments handled in step 1 above).
  await stripThreadedComments(zip)

  // 4. Resolve/remove cross-workbook external link formulas.
  await resolveExternalLinks(zip)

  // 5. Normalize every absolute relationship Target to a path relative to
  //    that .rels file's owning directory.
  await normalizeRelativeTargets(zip)

  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, outBuf)
  console.log(`Sanitized template written to ${OUT} (${outBuf.length} bytes)`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
