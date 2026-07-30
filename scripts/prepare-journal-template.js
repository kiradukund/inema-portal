/**
 * One-time sanitizer for Devotha's journal Excel file, producing
 * public/journal_template.xlsx.
 *
 * This file loads into ExcelJS fine as-is (unlike the BNR template, it
 * doesn't use non-standard comment paths or absolute relationship targets),
 * but it does contain Excel Tables, which don't survive an ExcelJS
 * load+writeBuffer round-trip intact — see scripts/lib/xlsx-sanitize.js for
 * the confirmed root cause (totalsRowShown flips to "1" with no real totals
 * row, dxf style references get dropped, producing an internally
 * inconsistent Table that real Excel rejects even though the zip itself is
 * well-formed). The journal export route only fills the "Journal" sheet as a
 * plain cell range and doesn't depend on Table-level styling anywhere, so we
 * remove the Table definitions here rather than risk it at request time.
 *
 * ExcelJS also can't model pivot tables/calcChain/print settings and drops
 * them silently on write — confirmed harmless (no dangling references left
 * behind) but worth doing here once rather than on every request.
 *
 * Run once whenever the source journal file changes:
 *   node scripts/prepare-journal-template.js <source.xlsx> [public/journal_template.xlsx]
 */
const JSZip = require('jszip')
const fs = require('fs')
const path = require('path')
const { normalizeRelativeTargets, stripExcelTables } = require('./lib/xlsx-sanitize')

const SRC = process.argv[2]
const OUT = process.argv[3] || path.join(__dirname, '..', 'public', 'journal_template.xlsx')

if (!SRC) {
  console.error('Usage: node scripts/prepare-journal-template.js <source.xlsx> [output.xlsx]')
  process.exit(1)
}

async function main() {
  const buf = fs.readFileSync(SRC)
  const zip = await JSZip.loadAsync(buf)

  await stripExcelTables(zip)
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
