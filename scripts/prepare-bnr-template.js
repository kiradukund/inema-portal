/**
 * One-time sanitizer for the official BNR reporting template.
 *
 * The template as issued by BNR/the preparer uses two non-standard OOXML
 * patterns that make ExcelJS (this project's xlsx library) refuse to load
 * it:
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
 *      relationships silently fail to resolve. We rewrite every such
 *      Target to a proper relative path.
 *
 * Run once whenever BNR issues a new template:
 *   node scripts/prepare-bnr-template.js <source.xlsx> [public/bnr_template.xlsx]
 */
const JSZip = require('jszip')
const fs = require('fs')
const path = require('path')

const SRC = process.argv[2]
const OUT = process.argv[3] || path.join(__dirname, '..', 'public', 'bnr_template.xlsx')

if (!SRC) {
  console.error('Usage: node scripts/prepare-bnr-template.js <source.xlsx> [output.xlsx]')
  process.exit(1)
}

function ownerDir(relsPath) {
  // e.g. xl/worksheets/_rels/sheet1.xml.rels -> xl/worksheets
  return path.posix.dirname(path.posix.dirname(relsPath))
}

async function main() {
  const buf = fs.readFileSync(SRC)
  const zip = await JSZip.loadAsync(buf)

  // 1. Strip unresolvable comment/vmlDrawing relationships + legacyDrawing refs.
  //    (Only sheet1/sheet2 have comments in the current template, but this
  //    loop is safe to run against any sheetN.xml.rels that has them.)
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
  // removed above (dangling <Override PartName="..."/> entries). ExcelJS's
  // own writer already regenerates this file cleanly on save, so it never
  // reaches end users through the app — but the sanitized file on disk
  // should be well-formed OOXML on its own, since real Excel is much
  // stricter about this than ExcelJS/LibreOffice.
  const contentTypesPath = '[Content_Types].xml'
  if (zip.file(contentTypesPath)) {
    let ct = await zip.file(contentTypesPath).async('string')
    ct = ct.replace(/<Override PartName="\/xl\/comments\/comment\d+\.xml"[^>]*\/>/g, '')
    zip.file(contentTypesPath, ct)
  }

  // 2. Normalize every absolute relationship Target to a path relative to
  //    that .rels file's owning directory.
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

  const outBuf = await zip.generateAsync({ type: 'nodebuffer' })
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, outBuf)
  console.log(`Sanitized template written to ${OUT} (${outBuf.length} bytes)`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
