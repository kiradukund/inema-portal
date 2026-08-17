// Byte-level BIFF8 patcher for the CRB Consumer sheet — R&D, staged build.
// Goal: edit the real archived .xls file's raw bytes in place, touching
// only what genuinely changed, so every font/fill/border/row-height byte
// the SheetJS (xlsx) read/rewrite pipeline can't preserve survives
// untouched. See docs/known-gaps.md for the full scoping writeup this
// continues from.
//
// STAGE 0 (done, confirmed clean in real Excel by Kevin, 2026-08-17):
// CFB.parse() -> CFB.write() round-trip with zero BIFF8-level involvement
// at all — proves the container layer (OLE compound file: sectors, FAT
// chain, directory) that `cfb` (xlsx's own dependency, already in this
// project) handles is safe to build on.
//
// STAGE 1 (this file, awaiting Kevin's real-Excel check): parse the
// Workbook stream into its real BIFF8 records (walk opcode+length+data
// sequentially) and reserialize them with ZERO changes — proves record-
// level parsing/reserialization is byte-exact before any record is ever
// actually modified. No SST, no cell values, nothing touched.
//
// Record types confirmed present via direct hex inspection of the real
// archived file (2026-08-17): 988 LABELSST, 0 LABEL — every text cell is
// shared-string-indexed, not inline. Not yet used by this stage, but the
// reason future stages need real SST-growth logic, not simple in-place
// value swaps.

import * as CFB from 'cfb'

export interface Biff8Record {
  opcode: number
  data: Buffer
  // Absolute byte offset (from the start of the Workbook stream) where
  // this record's own 4-byte header begins. Needed to match a
  // BOUNDSHEET record's lbPlyPos field against the BOF record it points
  // to — not used by Stage 1, but required from Stage 2 on.
  offset: number
}

const WORKBOOK_STREAM_NAME = 'Workbook'

const OPCODE = {
  BOF: 0x0809,
  EOF: 0x000a,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  LABELSST: 0x00fd,
  CONTINUE: 0x003c,
  DIMENSIONS: 0x0200,
  ROW: 0x0208,
  INDEX: 0x020b,
  DBCELL: 0x00d7,
  RK: 0x027e,
  MULRK: 0x00bd,
  NUMBER: 0x0203,
} as const

// Real number cells, confirmed present via exhaustive scan 2026-08-17:
// NOT every populated cell in the real archived file is LABELSST/text as
// earlier spot-checks (Current Balance, Date Opened) had generalized —
// Classification is RK-encoded (a genuine BIFF8 number) for rows 1-4,
// and Opening/Current Balance are MULRK-encoded (several RK values
// packed into one record) for row 2. Every other row/column uses
// LABELSST. Standard RK decode: bit0 = value is /100, bit1 = value is a
// 30-bit signed int (else the raw 4 bytes are the high 32 bits of an
// IEEE754 double, low 32 bits implicitly zero). Confirmed against a real
// value: rkraw=1072693248 decodes to 1.0, matching Classification="1".
function decodeRk(raw: number): number {
  const isInt = (raw & 0x02) !== 0
  const isHundredth = (raw & 0x01) !== 0
  let value: number
  if (isInt) {
    value = raw >> 2
  } else {
    const buf = Buffer.alloc(8)
    buf.writeUInt32LE(0, 0)
    buf.writeUInt32LE(raw & 0xfffffffc, 4)
    value = buf.readDoubleLE(0)
  }
  return isHundredth ? value / 100 : value
}

// Real bug found and fixed 2026-08-17 (caught by the Stage 6 chained/
// repeat-use test, exactly what that test was for): writing a changed
// Workbook stream by mutating a CFB.parse()'d container's entry.content
// in place, then calling CFB.write() on that SAME container object,
// silently truncates back to the ORIGINAL (pre-mutation) stream length
// — but only on a container that itself came from a PREVIOUS
// CFB.parse()-of-a-CFB.write()-output. A single generation (parse the
// real archived file once, mutate, write) worked fine in every earlier
// stage's standalone test, which is exactly why this stayed hidden
// until something was chained on top of a prior patch's own output.
// Confirmed via direct testing: building a genuinely fresh container via
// CFB.utils.cfb_new()/cfb_add() — copying every other stream through
// unchanged and only the Workbook stream's new content — does not have
// this problem. Used by every stage from here on instead of mutating
// the parsed container directly.
function writeWorkbookStream(container: any, newWorkbookContent: Buffer): Buffer {
  const fresh = CFB.utils.cfb_new()
  for (const entry of container.FileIndex) {
    if (entry.type !== 2) continue // streams only — skip storages/root
    const content = entry.name === WORKBOOK_STREAM_NAME ? newWorkbookContent : entry.content
    CFB.utils.cfb_add(fresh, entry.name, content)
  }
  return CFB.write(fresh, { type: 'buffer' }) as Buffer
}

// Splits a raw Workbook stream into its sequential BIFF8 records. No
// interpretation of any record's contents — this stage only needs to
// prove the record boundaries themselves are being found correctly.
export function parseBiffRecords(stream: Buffer): Biff8Record[] {
  const records: Biff8Record[] = []
  let pos = 0
  while (pos + 4 <= stream.length) {
    const recordStart = pos
    const opcode = stream.readUInt16LE(pos)
    const len = stream.readUInt16LE(pos + 2)
    const dataStart = pos + 4
    if (dataStart + len > stream.length) {
      throw new Error(`BIFF8 record at offset ${pos} (opcode 0x${opcode.toString(16)}) claims length ${len}, which runs past the end of the stream — parsing is wrong or the file is corrupt.`)
    }
    records.push({ opcode, data: stream.subarray(dataStart, dataStart + len), offset: recordStart })
    pos = dataStart + len
  }
  if (pos !== stream.length) {
    throw new Error(`BIFF8 record walk ended at byte ${pos} but the stream is ${stream.length} bytes — trailing bytes unaccounted for.`)
  }
  return records
}

// Inverse of parseBiffRecords: must reproduce the exact original stream
// bytes when the record list hasn't been modified. This exact round-trip
// property (not just "looks structurally similar") is what Stage 1 tests.
export function serializeBiffRecords(records: Biff8Record[]): Buffer {
  const parts: Buffer[] = []
  for (const rec of records) {
    const header = Buffer.alloc(4)
    header.writeUInt16LE(rec.opcode, 0)
    header.writeUInt16LE(rec.data.length, 2)
    parts.push(header, rec.data)
  }
  return Buffer.concat(parts)
}

// ─── BOUNDSHEET / substream location (needed from Stage 2 on) ──────────

interface Boundsheet {
  name: string
  lbPlyPos: number // absolute offset of this sheet's BOF record
}

// MS-XLS 2.4.28 BOUNDSHEET: lbPlyPos(4) grbit(2) cch(1) flags(1) name.
// flags bit0: 0 = compressed (1 byte/char), 1 = uncompressed (2 bytes/char).
function parseBoundsheet(data: Buffer): Boundsheet {
  const lbPlyPos = data.readUInt32LE(0)
  const cch = data.readUInt8(6)
  const flags = data.readUInt8(7)
  const highByte = (flags & 0x01) !== 0
  const nameBuf = data.subarray(8, 8 + cch * (highByte ? 2 : 1))
  const name = highByte ? nameBuf.toString('utf16le') : nameBuf.toString('latin1')
  return { name, lbPlyPos }
}

// Rewrites just the lbPlyPos field of a BOUNDSHEET record, leaving every
// other byte (grbit, name length/encoding, the name itself) untouched.
function patchBoundsheetLbPlyPos(data: Buffer, newLbPlyPos: number): Buffer {
  const out = Buffer.from(data) // copy — never mutate the original record's buffer
  out.writeUInt32LE(newLbPlyPos, 0)
  return out
}

export interface SheetSubstream {
  name: string
  // Index range into the full records array, inclusive of BOF, inclusive of EOF.
  startIdx: number
  endIdx: number
}

// Finds the globals BOF..EOF block (first one), reads every BOUNDSHEET in
// it, then matches each subsequent BOF..EOF block to a sheet name via
// lbPlyPos == that block's BOF record offset. Confirmed against this real
// file: exactly 8 BOF/8 EOF records, non-nested (globals + 7 worksheets),
// so "next BOF after this EOF" reliably delimits each block.
export function locateSubstreams(records: Biff8Record[]): { globals: SheetSubstream; sheets: SheetSubstream[] } {
  const blocks: SheetSubstream[] = []
  let blockStart = -1
  for (let i = 0; i < records.length; i++) {
    if (records[i].opcode === OPCODE.BOF) {
      if (blockStart !== -1) throw new Error(`Nested BOF at record ${i} (offset ${records[i].offset}) — unexpected structure, not handled.`)
      blockStart = i
    }
    if (records[i].opcode === OPCODE.EOF) {
      if (blockStart === -1) throw new Error(`EOF at record ${i} with no matching BOF — unexpected structure.`)
      blocks.push({ name: '(globals)', startIdx: blockStart, endIdx: i })
      blockStart = -1
    }
  }
  if (blocks.length < 2) throw new Error(`Expected at least 2 BOF..EOF blocks (globals + sheets), found ${blocks.length}.`)

  const globals = blocks[0]
  const boundsheets = records
    .slice(globals.startIdx, globals.endIdx + 1)
    .filter(r => r.opcode === OPCODE.BOUNDSHEET)
    .map(r => parseBoundsheet(r.data))

  const sheetBlocks = blocks.slice(1)
  if (boundsheets.length !== sheetBlocks.length) {
    throw new Error(`Found ${boundsheets.length} BOUNDSHEET records but ${sheetBlocks.length} sheet BOF..EOF blocks — can't match reliably.`)
  }

  const sheets = sheetBlocks.map(block => {
    const bofOffset = records[block.startIdx].offset
    const bs = boundsheets.find(b => b.lbPlyPos === bofOffset)
    if (!bs) throw new Error(`No BOUNDSHEET record points at the sheet block starting at offset ${bofOffset}.`)
    return { name: bs.name, startIdx: block.startIdx, endIdx: block.endIdx }
  })

  return { globals, sheets }
}

// ─── SST (shared string table) decoding ─────────────────────────────────

// MS-XLS SST entry ("XLUnicodeRichExtendedString"): cch(2) flags(1)
// [cRun(2) if fRichSt] [cbExtRst(4) if fExtSt] char-data [cRun*4 rich runs]
// [cbExtRst extended data]. Confirmed via this file's own tally that its
// single SST record has no CONTINUE records after it, so — unlike a
// general-purpose implementation — this deliberately does NOT handle a
// string's data being split across a CONTINUE record boundary. It throws
// rather than silently misreading if it ever runs past the buffer.
function decodeSstEntry(buf: Buffer, offset: number): { value: string; bytesConsumed: number } {
  let pos = offset
  const cch = buf.readUInt16LE(pos); pos += 2
  const flags = buf.readUInt8(pos); pos += 1
  const highByte = (flags & 0x01) !== 0
  const fExtSt = (flags & 0x04) !== 0
  const fRichSt = (flags & 0x08) !== 0
  let cRun = 0
  if (fRichSt) { cRun = buf.readUInt16LE(pos); pos += 2 }
  let cbExtRst = 0
  if (fExtSt) { cbExtRst = buf.readUInt32LE(pos); pos += 4 }
  const charBytes = cch * (highByte ? 2 : 1)
  if (pos + charBytes > buf.length) {
    throw new Error(`SST entry at offset ${offset} needs ${charBytes} char bytes but only ${buf.length - pos} remain — likely a CONTINUE-split string, which this parser doesn't handle.`)
  }
  const value = highByte ? buf.toString('utf16le', pos, pos + charBytes) : buf.toString('latin1', pos, pos + charBytes)
  pos += charBytes
  if (fRichSt) pos += cRun * 4
  if (fExtSt) pos += cbExtRst
  return { value, bytesConsumed: pos - offset }
}

// Inverse of decodeSstEntry, for a NEW entry: simplest valid encoding
// only (no rich-text runs, no phonetic/extended data) — cch(2) flags(1)
// char-data. Uses compressed (1 byte/char) encoding when every character
// fits in Latin-1, matching how the existing plain-ASCII entries in this
// real file are already encoded; uncompressed (UTF-16LE) otherwise.
function encodeSstEntry(value: string): Buffer {
  const isCompressed = Array.from(value).every(ch => ch.charCodeAt(0) <= 0xff)
  const header = Buffer.alloc(3)
  header.writeUInt16LE(value.length, 0)
  header.writeUInt8(isCompressed ? 0x00 : 0x01, 2)
  const charBuf = isCompressed ? Buffer.from(value, 'latin1') : Buffer.from(value, 'utf16le')
  return Buffer.concat([header, charBuf])
}

export function parseSstStrings(sstRecordData: Buffer): string[] {
  const cstUnique = sstRecordData.readUInt32LE(4)
  const strings: string[] = []
  let pos = 8
  for (let i = 0; i < cstUnique; i++) {
    const { value, bytesConsumed } = decodeSstEntry(sstRecordData, pos)
    strings.push(value)
    pos += bytesConsumed
  }
  return strings
}

export interface Stage1Result {
  buffer: Buffer
  recordCount: number
  workbookStreamIdentical: boolean
}

// Stage 1: load the real archived file, walk its Workbook stream into
// BIFF8 records, reserialize them unchanged, splice the (byte-identical)
// result back into the CFB container, and write the container back out.
// Deliberately does not touch SST, cell values, or any other record —
// this only proves the record-level read/write layer on top of the
// already-confirmed container layer.
export function runStage1ZeroChangePatch(originalFileBuffer: Buffer): Stage1Result {
  const container = CFB.parse(originalFileBuffer)
  const wbEntry = container.FileIndex.find((e: any) => e.name === WORKBOOK_STREAM_NAME)
  if (!wbEntry) throw new Error('Workbook stream not found in the archived file.')

  const originalStream = Buffer.from(wbEntry.content)
  const records = parseBiffRecords(originalStream)
  const reserialized = serializeBiffRecords(records)

  const workbookStreamIdentical = reserialized.equals(originalStream)
  if (!workbookStreamIdentical) {
    throw new Error('Stage 1 failed its own check: reserialized Workbook stream is not byte-identical to the original. Not proceeding to write a file.')
  }

  // Replace the stream content with the reserialized (byte-identical)
  // buffer — proves the write path goes through the same record-level
  // code a real edit would use, not just "skip touching it."
  const outBuffer = writeWorkbookStream(container, reserialized)

  return { buffer: outBuffer, recordCount: records.length, workbookStreamIdentical }
}

// ─── Stage 2: in-place value patch, no SST growth ───────────────────────

interface LabelSst {
  row: number
  col: number
  xf: number
  sstIndex: number
}

function decodeLabelSst(data: Buffer): LabelSst {
  return {
    row: data.readUInt16LE(0),
    col: data.readUInt16LE(2),
    xf: data.readUInt16LE(4),
    sstIndex: data.readUInt32LE(6),
  }
}

function encodeLabelSst(v: LabelSst): Buffer {
  const buf = Buffer.alloc(10)
  buf.writeUInt16LE(v.row, 0)
  buf.writeUInt16LE(v.col, 2)
  buf.writeUInt16LE(v.xf, 4)
  buf.writeUInt32LE(v.sstIndex, 6)
  return buf
}

export interface Stage2Result {
  buffer: Buffer
  targetCell: { row: number; col: number; sheet: string }
  oldValue: string
  newValue: string
  recordsChanged: number
  onlyFieldChanged: 'sstIndex'
}

// Changes exactly one real cell's value to a string that ALREADY exists
// elsewhere in the file's shared-string table — repoints that one
// LABELSST record's 4-byte sstIndex field only. No SST growth (that's
// Stage 3), no other record touched at all. Targets the Consumer sheet's
// "Gender" column: finds a row with "M", repoints it to whatever sstIndex
// an existing "F" cell already uses elsewhere in the same sheet.
export function runStage2InPlacePatch(originalFileBuffer: Buffer): Stage2Result {
  const container = CFB.parse(originalFileBuffer)
  const wbEntry = container.FileIndex.find((e: any) => e.name === WORKBOOK_STREAM_NAME)
  if (!wbEntry) throw new Error('Workbook stream not found in the archived file.')

  const originalStream = Buffer.from(wbEntry.content)
  const records = parseBiffRecords(originalStream)
  const { globals, sheets } = locateSubstreams(records)

  const sstRecord = records.slice(globals.startIdx, globals.endIdx + 1).find(r => r.opcode === OPCODE.SST)
  if (!sstRecord) throw new Error('No SST record found in globals.')
  const sstStrings = parseSstStrings(sstRecord.data)

  const consumer = sheets.find(s => s.name === 'Consumer')
  if (!consumer) throw new Error('Consumer sheet substream not found.')

  // Header row (row 0) LABELSST records give us the real column index for
  // "Gender" by its actual header text, not a hardcoded column guess.
  const consumerLabelSstIdx: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode === OPCODE.LABELSST) consumerLabelSstIdx.push(i)
  }
  const headerCells = consumerLabelSstIdx
    .map(i => ({ i, v: decodeLabelSst(records[i].data) }))
    .filter(x => x.v.row === 0)
  const genderHeader = headerCells.find(x => sstStrings[x.v.sstIndex] === 'Gender')
  if (!genderHeader) throw new Error('Could not find a "Gender" header cell in row 0 of Consumer.')
  const genderCol = genderHeader.v.col

  const genderCells = consumerLabelSstIdx
    .map(i => ({ i, v: decodeLabelSst(records[i].data) }))
    .filter(x => x.v.row > 0 && x.v.col === genderCol)

  const targetEntry = genderCells.find(x => sstStrings[x.v.sstIndex] === 'M')
  const donorEntry = genderCells.find(x => sstStrings[x.v.sstIndex] === 'F')
  if (!targetEntry) throw new Error('No real "M" Gender cell found to use as the patch target.')
  if (!donorEntry) throw new Error('No real "F" Gender cell found to reuse as the donor sstIndex — Stage 2 requires an already-existing value, not a new one.')

  const oldValue = sstStrings[targetEntry.v.sstIndex]
  const newValue = sstStrings[donorEntry.v.sstIndex]

  const patchedRecords = records.map(r => r)
  patchedRecords[targetEntry.i] = {
    ...records[targetEntry.i],
    data: encodeLabelSst({ ...targetEntry.v, sstIndex: donorEntry.v.sstIndex }),
  }

  // Self-check: every record must be identical except the one target,
  // and that one record must differ ONLY in sstIndex (row/col/xf/opcode/
  // length unchanged) — exactly what Kevin asked to see confirmed.
  let changedCount = 0
  for (let i = 0; i < records.length; i++) {
    const same = records[i].opcode === patchedRecords[i].opcode && records[i].data.equals(patchedRecords[i].data)
    if (!same) {
      changedCount++
      if (i !== targetEntry.i) throw new Error(`Unexpected record changed at index ${i} — self-check failed, not proceeding.`)
      const before = decodeLabelSst(records[i].data)
      const after = decodeLabelSst(patchedRecords[i].data)
      if (before.row !== after.row || before.col !== after.col || before.xf !== after.xf) {
        throw new Error(`Target record changed a field other than sstIndex — self-check failed. before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      }
      if (records[i].opcode !== OPCODE.LABELSST || records[i].data.length !== 10 || patchedRecords[i].data.length !== 10) {
        throw new Error('Target record is not a well-formed 10-byte LABELSST record — self-check failed.')
      }
    }
  }
  if (changedCount !== 1) {
    throw new Error(`Expected exactly 1 changed record, found ${changedCount} — self-check failed.`)
  }

  const reserialized = serializeBiffRecords(patchedRecords)
  const outBuffer = writeWorkbookStream(container, reserialized)

  return {
    buffer: outBuffer,
    targetCell: { row: targetEntry.v.row, col: targetEntry.v.col, sheet: 'Consumer' },
    oldValue,
    newValue,
    recordsChanged: changedCount,
    onlyFieldChanged: 'sstIndex',
  }
}

// ─── Stage 3: SST growth ─────────────────────────────────────────────────

export interface Stage3Result {
  buffer: Buffer
  targetCell: { row: number; col: number; sheet: string }
  oldValue: string
  newValue: string
  newSstIndex: number
  sstGrowthBytes: number
  boundsheetsUpdated: number
  otherRecordsChanged: number
}

// Changes one real cell's value to a string confirmed NOT already present
// anywhere in the file's shared-string table — requires growing the SST
// itself (new entry + updated cstUnique), repointing the target cell,
// and recomputing every BOUNDSHEET.lbPlyPos so all 7 sheets still point
// at their real (now-shifted) BOF offsets. No records are inserted or
// removed — the SST record and the 7 BOUNDSHEET records just get new
// content at their existing positions, which is what keeps this from
// needing a full record-list splice; everything after the globals
// section shifts position automatically once serializeBiffRecords()
// concatenates the (now-larger) SST record and everything that follows.
export function runStage3SstGrowthPatch(originalFileBuffer: Buffer, newValue: string): Stage3Result {
  const container = CFB.parse(originalFileBuffer)
  const wbEntry = container.FileIndex.find((e: any) => e.name === WORKBOOK_STREAM_NAME)
  if (!wbEntry) throw new Error('Workbook stream not found in the archived file.')

  const originalStream = Buffer.from(wbEntry.content)
  const records = parseBiffRecords(originalStream)
  const { globals, sheets } = locateSubstreams(records)

  const sstIdx = records.findIndex((r, i) => r.opcode === OPCODE.SST && i >= globals.startIdx && i <= globals.endIdx)
  if (sstIdx === -1) throw new Error('No SST record found in globals.')
  const sstRecord = records[sstIdx]
  const sstStrings = parseSstStrings(sstRecord.data)

  // Confirm — not assume — the new value doesn't already exist anywhere
  // in the table, per Kevin's explicit requirement for this stage.
  if (sstStrings.includes(newValue)) {
    throw new Error(`"${newValue}" already exists in the SST (index ${sstStrings.indexOf(newValue)}) — Stage 3 requires a genuinely new value. Pick a different test string.`)
  }

  const consumer = sheets.find(s => s.name === 'Consumer')
  if (!consumer) throw new Error('Consumer sheet substream not found.')
  const consumerLabelSstIdx: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode === OPCODE.LABELSST) consumerLabelSstIdx.push(i)
  }

  // Target: the Surname of the second real data row (row 2 — HABINEZA),
  // deliberately a different cell than Stage 2 touched, at column 1.
  const targetEntry = consumerLabelSstIdx
    .map(i => ({ i, v: decodeLabelSst(records[i].data) }))
    .find(x => x.v.row === 2 && x.v.col === 1)
  if (!targetEntry) throw new Error('Could not find the row 2 / col 1 (Surname) cell to use as the Stage 3 target.')
  const oldValue = sstStrings[targetEntry.v.sstIndex]

  // ── 1 & 2: grow the SST — append the new entry, bump cstUnique. ──────
  const cstTotal = sstRecord.data.readUInt32LE(0)
  const cstUnique = sstRecord.data.readUInt32LE(4)
  const newEntryBytes = encodeSstEntry(newValue)
  const newSstIndex = cstUnique // 0-based — this new entry becomes index cstUnique
  const newSstData = Buffer.concat([sstRecord.data, newEntryBytes])
  newSstData.writeUInt32LE(cstTotal, 0) // unchanged: same number of cells contain text, just one now points elsewhere
  newSstData.writeUInt32LE(cstUnique + 1, 4)
  if (newSstData.length > 0xffff) {
    throw new Error(`Grown SST record would be ${newSstData.length} bytes, over the 65,535-byte single-record limit — would need a CONTINUE record, not handled by this stage.`)
  }
  const sstGrowthBytes = newSstData.length - sstRecord.data.length

  // ── 3: repoint the target cell. ───────────────────────────────────────
  const patchedTargetData = encodeLabelSst({ ...targetEntry.v, sstIndex: newSstIndex })

  // ── 4 & 5: every BOUNDSHEET's lbPlyPos shifts by the SST growth amount,
  // since the entire globals section (which contains SST) precedes every
  // sheet's BOF. Confirmed structurally, not assumed: locateSubstreams()
  // already proved every sheet's BOF comes after globals.endIdx.
  const boundsheetIdxs: number[] = []
  for (let i = globals.startIdx; i <= globals.endIdx; i++) {
    if (records[i].opcode === OPCODE.BOUNDSHEET) boundsheetIdxs.push(i)
  }
  if (boundsheetIdxs.length !== sheets.length) {
    throw new Error(`Found ${boundsheetIdxs.length} BOUNDSHEET records but ${sheets.length} sheets — can't safely update offsets.`)
  }

  const patchedRecords = records.map(r => r)
  patchedRecords[sstIdx] = { ...sstRecord, data: newSstData }
  patchedRecords[targetEntry.i] = { ...records[targetEntry.i], data: patchedTargetData }
  for (const bsIdx of boundsheetIdxs) {
    const oldLbPlyPos = records[bsIdx].data.readUInt32LE(0)
    patchedRecords[bsIdx] = { ...records[bsIdx], data: patchBoundsheetLbPlyPos(records[bsIdx].data, oldLbPlyPos + sstGrowthBytes) }
  }

  // ── Self-check: enumerate exactly which records are ALLOWED to differ
  // (SST, the one target LABELSST, the 7 BOUNDSHEETs) — anything else
  // differing at all aborts before a file is ever written. ─────────────
  const allowedToChange = new Set<number>([sstIdx, targetEntry.i, ...boundsheetIdxs])
  let otherRecordsChanged = 0
  for (let i = 0; i < records.length; i++) {
    const same = records[i].opcode === patchedRecords[i].opcode && records[i].data.equals(patchedRecords[i].data)
    if (same) continue
    if (!allowedToChange.has(i)) {
      throw new Error(`Unexpected record changed at index ${i} (opcode 0x${records[i].opcode.toString(16)}) — self-check failed, not proceeding.`)
    }
    if (i === targetEntry.i) {
      const before = decodeLabelSst(records[i].data)
      const after = decodeLabelSst(patchedRecords[i].data)
      if (before.row !== after.row || before.col !== after.col || before.xf !== after.xf) {
        throw new Error('Target LABELSST changed a field other than sstIndex — self-check failed.')
      }
    }
    if (boundsheetIdxs.includes(i)) {
      // name/flags portion (everything after the 4-byte lbPlyPos) must be untouched
      if (!records[i].data.subarray(4).equals(patchedRecords[i].data.subarray(4))) {
        throw new Error(`BOUNDSHEET record ${i} changed something other than lbPlyPos — self-check failed.`)
      }
      otherRecordsChanged++
    }
  }
  // Confirm the SST record's own growth matches exactly what was intended.
  if (patchedRecords[sstIdx].data.length - records[sstIdx].data.length !== sstGrowthBytes) {
    throw new Error('SST record size delta does not match the computed growth amount — self-check failed.')
  }

  // ── 6: hand the grown stream to cfb — it already proved (Stage 0/1/2)
  // it recomputes the container's sector/FAT layout correctly for a
  // stream of a new size. ───────────────────────────────────────────────
  const reserialized = serializeBiffRecords(patchedRecords)
  const outBuffer = writeWorkbookStream(container, reserialized)

  return {
    buffer: outBuffer,
    targetCell: { row: targetEntry.v.row, col: targetEntry.v.col, sheet: 'Consumer' },
    oldValue,
    newValue,
    newSstIndex,
    sstGrowthBytes,
    boundsheetsUpdated: boundsheetIdxs.length,
    otherRecordsChanged,
  }
}

// ─── Stage 4: inserting a new client row ─────────────────────────────────

// DIMENSIONS (MS-XLS 2.4.??): rwMic(4) rwMac(4, last row + 1) colMic(2)
// colMac(2) reserved(2). Only rwMac needs to change when a row is
// appended past the current end.
function readDimensions(data: Buffer) {
  return { rwMic: data.readUInt32LE(0), rwMac: data.readUInt32LE(4), colMic: data.readUInt16LE(8), colMac: data.readUInt16LE(10) }
}
function patchDimensionsRwMac(data: Buffer, newRwMac: number): Buffer {
  const out = Buffer.from(data)
  out.writeUInt32LE(newRwMac, 4)
  return out
}

// ROW (MS-XLS 2.4.153): rw(2) colMic(2) colMac(2) miyRw(2, height) +12
// more bytes of reserved/flags/default-ixfe that this stage deliberately
// never decodes bit-by-bit — the new row's ROW record is built by
// copying an existing row's 16 bytes verbatim and only overwriting the
// `rw` field, so whatever those flags mean, the new row inherits the
// exact same row-level behavior (height, outline level, any "explicit
// format" flag) as the row it was copied from, rather than guessing.
function patchRowIndex(rowRecordData: Buffer, newRw: number): Buffer {
  const out = Buffer.from(rowRecordData)
  out.writeUInt16LE(newRw, 0)
  return out
}

interface PatchPlan {
  replacements: Map<number, Biff8Record>
  deletions: Set<number>
  insertionsAfter: Map<number, Biff8Record[]>
}
function applyPatchPlan(records: Biff8Record[], plan: PatchPlan): Biff8Record[] {
  const out: Biff8Record[] = []
  for (let i = 0; i < records.length; i++) {
    if (!plan.deletions.has(i)) out.push(plan.replacements.get(i) ?? records[i])
    const ins = plan.insertionsAfter.get(i)
    if (ins) out.push(...ins)
  }
  return out
}

export interface Stage4Result {
  buffer: Buffer
  newRow: number
  fieldsWritten: Record<string, string>
  newSstEntriesAdded: number
  sstGrowthBytes: number
  indexAndDbcellRemoved: boolean
}

// Appends a brand-new client row to the end of the Consumer sheet's
// existing data (row 18, one past the real last row, 17). Design
// decisions, both meant to be confirmed — not just assumed — by the
// real-Excel check this stage is gated on:
//
// 1. Every new cell's XF is copied directly from the SAME COLUMN on the
//    real last row (17), not looked up/guessed — this is what satisfies
//    "inherit the correct style," by construction rather than inference.
// 2. The Consumer sheet's INDEX and DBCELL records (row-lookup
//    accelerators — MS-XLS documents these as optional performance
//    hints, not structurally required data) are DELETED rather than
//    recomputed. Correctly recomputing DBCELL's relative cell-offset
//    array requires fully reverse-engineering an encoding this session
//    hasn't verified byte-for-byte; leaving them present but stale risks
//    Excel trusting wrong offsets, which seemed like the worse failure
//    mode of the two. Real Excel is documented to fall back to a
//    sequential scan when these are absent — this test is what actually
//    confirms that, rather than trusting the documentation alone.
export function runStage4NewRowInsert(originalFileBuffer: Buffer): Stage4Result {
  const container = CFB.parse(originalFileBuffer)
  const wbEntry = container.FileIndex.find((e: any) => e.name === WORKBOOK_STREAM_NAME)
  if (!wbEntry) throw new Error('Workbook stream not found in the archived file.')

  const originalStream = Buffer.from(wbEntry.content)
  const records = parseBiffRecords(originalStream)
  const { globals, sheets } = locateSubstreams(records)

  const sstIdx = records.findIndex((r, i) => r.opcode === OPCODE.SST && i >= globals.startIdx && i <= globals.endIdx)
  if (sstIdx === -1) throw new Error('No SST record found in globals.')
  let sstStrings = parseSstStrings(records[sstIdx].data)
  const cstTotal = records[sstIdx].data.readUInt32LE(0) // unchanged throughout: same number of text cells overall
  let cstUnique = records[sstIdx].data.readUInt32LE(4)
  let sstData = Buffer.from(records[sstIdx].data)

  function ensureSstIndex(value: string): number {
    const existing = sstStrings.indexOf(value)
    if (existing !== -1) return existing
    const newIndex = cstUnique
    const entryBytes = encodeSstEntry(value)
    sstData = Buffer.concat([sstData, entryBytes])
    cstUnique += 1
    sstStrings = [...sstStrings, value]
    // Must rewrite the header's cstUnique field every time, not just
    // track it in a local variable — the bytes are what actually get
    // serialized. Missing this was Stage 4's first real bug, caught by
    // this function's own re-parse self-check, not assumed safe.
    sstData.writeUInt32LE(cstTotal, 0)
    sstData.writeUInt32LE(cstUnique, 4)
    return newIndex
  }
  const sstStringsBeforeGrowth = sstStrings.length

  const consumer = sheets.find(s => s.name === 'Consumer')
  if (!consumer) throw new Error('Consumer sheet substream not found.')

  const dimIdx = records.findIndex((r, i) => r.opcode === OPCODE.DIMENSIONS && i >= consumer.startIdx && i <= consumer.endIdx)
  if (dimIdx === -1) throw new Error('No DIMENSIONS record found in Consumer.')
  const dims = readDimensions(records[dimIdx].data)

  const rowRecordIdxs: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) if (records[i].opcode === OPCODE.ROW) rowRecordIdxs.push(i)
  const lastRowRecordIdx = rowRecordIdxs[rowRecordIdxs.length - 1]
  const lastRowIndex = records[lastRowRecordIdx].data.readUInt16LE(0)
  if (lastRowIndex !== dims.rwMac - 1) {
    throw new Error(`Last ROW record is row ${lastRowIndex} but DIMENSIONS says rwMac=${dims.rwMac} — inconsistent, not proceeding.`)
  }
  const newRowIndex = lastRowIndex + 1

  const templateCellIdxs: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode === OPCODE.LABELSST && decodeLabelSst(records[i].data).row === lastRowIndex) templateCellIdxs.push(i)
  }
  if (templateCellIdxs.length === 0) throw new Error(`No cell records found for template row ${lastRowIndex}.`)
  const lastCellRecordIdx = templateCellIdxs[templateCellIdxs.length - 1]

  const indexIdx = records.findIndex((r, i) => r.opcode === OPCODE.INDEX && i >= consumer.startIdx && i <= consumer.endIdx)
  const dbcellIdxs: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) if (records[i].opcode === OPCODE.DBCELL) dbcellIdxs.push(i)

  // ── Header lookup, same pattern as Stages 2/3: real column indices by
  // real header text, not hardcoded positions. ──────────────────────────
  const headerCellIdxs: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode === OPCODE.LABELSST && decodeLabelSst(records[i].data).row === 0) headerCellIdxs.push(i)
  }
  function colFor(headerText: string): number {
    const found = headerCellIdxs.map(i => decodeLabelSst(records[i].data)).find(v => sstStringsBeforeGrowthLookup(v.sstIndex) === headerText)
    if (!found) throw new Error(`Header "${headerText}" not found in Consumer row 0.`)
    return found.col
  }
  // sstStrings hasn't grown yet at header-lookup time, but written as a
  // function for clarity of intent (header text always predates any
  // growth this stage performs).
  function sstStringsBeforeGrowthLookup(i: number): string { return sstStrings[i] }

  // ── Fake but clearly-synthetic identity fields — grow the SST for
  // each one confirmed not already present. Every other populated
  // column on the template row is reused verbatim (same sstIndex): a
  // real new client's currency/country/account-type/etc. codes are
  // genuinely drawn from the same small enumeration already in the SST,
  // not something that needs a fresh string. ───────────────────────────
  const fakeValues: Record<string, string> = {
    'Surname': 'STAGE4TESTCLIENT',
    'Forename or Initial 1': 'Synthetic',
    'National ID Number': '9999999999999999',
    'Account Number': 'IFSTEST4',
  }
  for (const [header, value] of Object.entries(fakeValues)) {
    colFor(header) // fails fast if the header itself can't be found
    if (sstStrings.includes(value)) {
      throw new Error(`Fake test value "${value}" for "${header}" already exists in the SST — pick a different one.`)
    }
  }

  const fieldsWritten: Record<string, string> = {}
  const newRowCells: Biff8Record[] = templateCellIdxs.map(i => {
    const tmpl = decodeLabelSst(records[i].data)
    const headerEntry = headerCellIdxs.map(hi => decodeLabelSst(records[hi].data)).find(h => h.col === tmpl.col)
    const headerText = headerEntry ? sstStrings[headerEntry.sstIndex] : ''
    const fake = fakeValues[headerText]
    const sstIndex = fake !== undefined ? ensureSstIndex(fake) : tmpl.sstIndex
    fieldsWritten[headerText || `col${tmpl.col}`] = sstStrings[sstIndex]
    return {
      opcode: OPCODE.LABELSST,
      offset: -1, // recomputed on serialization; not meaningful pre-splice
      data: encodeLabelSst({ row: newRowIndex, col: tmpl.col, xf: tmpl.xf, sstIndex }),
    }
  })
  const newSstEntriesAdded = sstStrings.length - sstStringsBeforeGrowth
  const sstGrowthBytes = sstData.length - records[sstIdx].data.length

  const newRowRecord: Biff8Record = {
    opcode: OPCODE.ROW,
    offset: -1,
    data: patchRowIndex(records[lastRowRecordIdx].data, newRowIndex),
  }

  // ── BOUNDSHEET offset math: Consumer's own BOF shifts by the SST
  // growth only (nothing before Consumer changed size except SST, which
  // lives in globals, before every sheet). Every sheet AFTER Consumer
  // shifts by SST growth *plus* everything inserted into Consumer (the
  // new ROW record + new cell records, minus the removed INDEX/DBCELL).
  const consumerBofOffset = records[consumer.startIdx].offset
  const insertedBytes = (4 + newRowRecord.data.length) + newRowCells.reduce((sum, c) => sum + 4 + c.data.length, 0)
  const removedBytes = (indexIdx !== -1 ? 4 + records[indexIdx].data.length : 0) + dbcellIdxs.reduce((sum, i) => sum + 4 + records[i].data.length, 0)
  const consumerInternalDelta = insertedBytes - removedBytes

  const boundsheetIdxs: number[] = []
  for (let i = globals.startIdx; i <= globals.endIdx; i++) if (records[i].opcode === OPCODE.BOUNDSHEET) boundsheetIdxs.push(i)

  // ── Build the patch plan. ─────────────────────────────────────────────
  const replacements = new Map<number, Biff8Record>()
  const deletions = new Set<number>()
  const insertionsAfter = new Map<number, Biff8Record[]>()

  replacements.set(sstIdx, { ...records[sstIdx], data: sstData })
  replacements.set(dimIdx, { ...records[dimIdx], data: patchDimensionsRwMac(records[dimIdx].data, newRowIndex + 1) })
  insertionsAfter.set(lastRowRecordIdx, [newRowRecord])
  insertionsAfter.set(lastCellRecordIdx, newRowCells)
  if (indexIdx !== -1) deletions.add(indexIdx)
  for (const i of dbcellIdxs) deletions.add(i)

  for (const bsIdx of boundsheetIdxs) {
    const bsLbPlyPos = records[bsIdx].data.readUInt32LE(0)
    const delta = bsLbPlyPos === consumerBofOffset
      ? sstGrowthBytes
      : sstGrowthBytes + consumerInternalDelta // every sheet after Consumer
    replacements.set(bsIdx, { ...records[bsIdx], data: patchBoundsheetLbPlyPos(records[bsIdx].data, bsLbPlyPos + delta) })
  }

  const patchedRecords = applyPatchPlan(records, { replacements, deletions, insertionsAfter })
  const reserialized = serializeBiffRecords(patchedRecords)

  // ── Independent re-verification: re-parse the ACTUAL OUTPUT BYTES from
  // scratch (not the in-memory plan) using the same trusted functions
  // Stages 1-3 already proved correct, and confirm every real invariant
  // — not just "no exception was thrown while building it." ────────────
  const reparsed = parseBiffRecords(reserialized)
  const reSub = locateSubstreams(reparsed) // throws if any BOUNDSHEET.lbPlyPos is wrong
  const reConsumer = reSub.sheets.find(s => s.name === 'Consumer')
  if (!reConsumer) throw new Error('Self-check failed: Consumer sheet not found after patch.')

  const reDimIdx = reparsed.findIndex((r, i) => r.opcode === OPCODE.DIMENSIONS && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  const reDims = readDimensions(reparsed[reDimIdx].data)
  if (reDims.rwMac !== newRowIndex + 1) throw new Error(`Self-check failed: DIMENSIONS.rwMac is ${reDims.rwMac}, expected ${newRowIndex + 1}.`)

  const reSstIdx = reparsed.findIndex((r, i) => r.opcode === OPCODE.SST && i >= reSub.globals.startIdx && i <= reSub.globals.endIdx)
  const reSstStrings = parseSstStrings(reparsed[reSstIdx].data)
  if (reSstStrings.length !== sstStringsBeforeGrowth + newSstEntriesAdded) {
    throw new Error(`Self-check failed: SST has ${reSstStrings.length} strings, expected ${sstStringsBeforeGrowth + newSstEntriesAdded}.`)
  }

  const reIndexPresent = reparsed.some((r, i) => r.opcode === OPCODE.INDEX && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  const reDbcellPresent = reparsed.some((r, i) => r.opcode === OPCODE.DBCELL && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  if (reIndexPresent || reDbcellPresent) throw new Error('Self-check failed: INDEX/DBCELL still present after intended removal.')

  const reNewRowCells = []
  for (let i = reConsumer.startIdx; i <= reConsumer.endIdx; i++) {
    if (reparsed[i].opcode === OPCODE.LABELSST) {
      const v = decodeLabelSst(reparsed[i].data)
      if (v.row === newRowIndex) reNewRowCells.push({ col: v.col, xf: v.xf, value: reSstStrings[v.sstIndex] })
    }
  }
  if (reNewRowCells.length !== templateCellIdxs.length) {
    throw new Error(`Self-check failed: new row has ${reNewRowCells.length} cells, expected ${templateCellIdxs.length}.`)
  }
  for (const cell of reNewRowCells) {
    const templateCell = templateCellIdxs.map(i => decodeLabelSst(records[i].data)).find(v => v.col === cell.col)
    if (!templateCell || templateCell.xf !== cell.xf) {
      throw new Error(`Self-check failed: new row col ${cell.col} has XF ${cell.xf}, template row had ${templateCell?.xf} — style not correctly inherited.`)
    }
  }

  // Every OTHER sheet must be byte-identical in content (order-preserved,
  // just shifted position) — verified by comparing each sheet's own
  // record slice against the original, opcode-by-opcode and byte-by-byte.
  for (const origSheet of sheets) {
    if (origSheet.name === 'Consumer') continue
    const reSheet = reSub.sheets.find(s => s.name === origSheet.name)
    if (!reSheet) throw new Error(`Self-check failed: sheet "${origSheet.name}" missing after patch.`)
    const origSlice = records.slice(origSheet.startIdx, origSheet.endIdx + 1)
    const reSlice = reparsed.slice(reSheet.startIdx, reSheet.endIdx + 1)
    if (origSlice.length !== reSlice.length) throw new Error(`Self-check failed: sheet "${origSheet.name}" record count changed (${origSlice.length} -> ${reSlice.length}).`)
    for (let k = 0; k < origSlice.length; k++) {
      if (origSlice[k].opcode !== reSlice[k].opcode || !origSlice[k].data.equals(reSlice[k].data)) {
        throw new Error(`Self-check failed: sheet "${origSheet.name}" record ${k} differs — should be untouched.`)
      }
    }
  }

  const outBuffer = writeWorkbookStream(container, reserialized)

  return {
    buffer: outBuffer,
    newRow: newRowIndex,
    fieldsWritten,
    newSstEntriesAdded,
    sstGrowthBytes,
    indexAndDbcellRemoved: indexIdx !== -1 || dbcellIdxs.length > 0,
  }
}

// ─── Stage 5: removing an existing client row ────────────────────────────

function patchSstCounts(sstData: Buffer, newCstTotal: number): Buffer {
  const out = Buffer.from(sstData)
  out.writeUInt32LE(newCstTotal, 0)
  return out
}

export interface Stage5Result {
  buffer: Buffer
  removedRow: number
  removedFields: Record<string, string>
  rowsRenumbered: number
  cstTotalBefore: number
  cstTotalAfter: number
  cstUniqueUnchanged: boolean
  orphanedSstEntries: string[]
  indexAndDbcellRemoved: boolean
}

// Removes one existing data row entirely — a genuine deletion, not a
// blank-out: every row after it is renumbered down by one so the sheet
// stays contiguous (rows 0..N-1), matching what Excel's own "Delete
// Row" does, not leaving a visible gap. Uses the same design decision
// as Stage 4 for Consumer's INDEX/DBCELL (removed, not recomputed) —
// already confirmed clean by Kevin for the insertion case; this
// re-confirms it for removal.
export function runStage5RowRemoval(originalFileBuffer: Buffer, targetRow: number): Stage5Result {
  const container = CFB.parse(originalFileBuffer)
  const wbEntry = container.FileIndex.find((e: any) => e.name === WORKBOOK_STREAM_NAME)
  if (!wbEntry) throw new Error('Workbook stream not found in the archived file.')

  const originalStream = Buffer.from(wbEntry.content)
  const records = parseBiffRecords(originalStream)
  const { globals, sheets } = locateSubstreams(records)

  const sstIdx = records.findIndex((r, i) => r.opcode === OPCODE.SST && i >= globals.startIdx && i <= globals.endIdx)
  if (sstIdx === -1) throw new Error('No SST record found in globals.')
  const sstStrings = parseSstStrings(records[sstIdx].data)
  const cstTotalBefore = records[sstIdx].data.readUInt32LE(0)
  const cstUnique = records[sstIdx].data.readUInt32LE(4)

  const consumer = sheets.find(s => s.name === 'Consumer')
  if (!consumer) throw new Error('Consumer sheet substream not found.')

  const dimIdx = records.findIndex((r, i) => r.opcode === OPCODE.DIMENSIONS && i >= consumer.startIdx && i <= consumer.endIdx)
  if (dimIdx === -1) throw new Error('No DIMENSIONS record found in Consumer.')
  const dims = readDimensions(records[dimIdx].data)
  if (targetRow < 1 || targetRow >= dims.rwMac) throw new Error(`Target row ${targetRow} is out of range (header is row 0, data rows 1..${dims.rwMac - 1}).`)

  const rowRecordIdx = new Map<number, number>() // row number -> record index
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode === OPCODE.ROW) rowRecordIdx.set(records[i].data.readUInt16LE(0), i)
  }
  const targetRowRecordIdx = rowRecordIdx.get(targetRow)
  if (targetRowRecordIdx === undefined) throw new Error(`No ROW record found for row ${targetRow}.`)

  const targetCellIdxs: number[] = []
  const headerCellIdxs: number[] = []
  const laterRowCellIdxs: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode !== OPCODE.LABELSST) continue
    const row = decodeLabelSst(records[i].data).row
    if (row === 0) headerCellIdxs.push(i)
    else if (row === targetRow) targetCellIdxs.push(i)
    else if (row > targetRow) laterRowCellIdxs.push(i)
  }
  if (targetCellIdxs.length === 0) throw new Error(`No cell records found for row ${targetRow}.`)

  const removedFields: Record<string, string> = {}
  for (const i of targetCellIdxs) {
    const v = decodeLabelSst(records[i].data)
    const headerEntry = headerCellIdxs.map(hi => decodeLabelSst(records[hi].data)).find(h => h.col === v.col)
    const headerText = headerEntry ? sstStrings[headerEntry.sstIndex] : `col${v.col}`
    removedFields[headerText] = sstStrings[v.sstIndex]
  }

  // ── Item 4: which of the removed row's string indices become
  // genuinely unreferenced anywhere in the WHOLE workbook (not just
  // Consumer — SST is shared across all 7 sheets), after this row is
  // gone? Flagged, not silently resolved either way. ────────────────────
  //
  // Not simply "usage count == 1": several of this row's own columns
  // (Work/Home/Mobile Telephone) reference the SAME sstIndex — a phone
  // number can have a total usage count of 3 while every one of those 3
  // references still comes from the row being deleted. Correct check is
  // whether ALL references anywhere equal the references from THIS row.
  const removedRowSstIndices = targetCellIdxs.map(i => decodeLabelSst(records[i].data).sstIndex)
  const removedRowUsage = new Map<number, number>()
  for (const idx of removedRowSstIndices) removedRowUsage.set(idx, (removedRowUsage.get(idx) ?? 0) + 1)
  const totalUsage = new Map<number, number>()
  for (const r of records) {
    if (r.opcode !== OPCODE.LABELSST) continue
    const idx = decodeLabelSst(r.data).sstIndex
    totalUsage.set(idx, (totalUsage.get(idx) ?? 0) + 1)
  }
  const orphanedSstEntries = Array.from(new Set(removedRowSstIndices))
    .filter(idx => (totalUsage.get(idx) ?? 0) === (removedRowUsage.get(idx) ?? 0)) // every reference anywhere was from this row
    .map(idx => sstStrings[idx])

  const indexIdx0 = records.findIndex((r, i) => r.opcode === OPCODE.INDEX && i >= consumer.startIdx && i <= consumer.endIdx)
  const dbcellIdxs: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) if (records[i].opcode === OPCODE.DBCELL) dbcellIdxs.push(i)

  // ── Build the patch plan. ─────────────────────────────────────────────
  const replacements = new Map<number, Biff8Record>()
  const deletions = new Set<number>()

  replacements.set(dimIdx, { ...records[dimIdx], data: patchDimensionsRwMac(records[dimIdx].data, dims.rwMac - 1) })
  const cstTotalAfter = cstTotalBefore - targetCellIdxs.length
  replacements.set(sstIdx, { ...records[sstIdx], data: patchSstCounts(records[sstIdx].data, cstTotalAfter) })

  deletions.add(targetRowRecordIdx)
  for (const i of targetCellIdxs) deletions.add(i)
  if (indexIdx0 !== -1) deletions.add(indexIdx0)
  for (const i of dbcellIdxs) deletions.add(i)

  let rowsRenumbered = 0
  for (const [rowNum, idx] of Array.from(rowRecordIdx.entries())) {
    if (rowNum > targetRow) {
      replacements.set(idx, { ...records[idx], data: patchRowIndex(records[idx].data, rowNum - 1) })
      rowsRenumbered++
    }
  }
  for (const i of laterRowCellIdxs) {
    const v = decodeLabelSst(records[i].data)
    replacements.set(i, { ...records[i], data: encodeLabelSst({ ...v, row: v.row - 1 }) })
  }

  const removedBytes = (4 + records[targetRowRecordIdx].data.length)
    + targetCellIdxs.reduce((sum, i) => sum + 4 + records[i].data.length, 0)
    + (indexIdx0 !== -1 ? 4 + records[indexIdx0].data.length : 0)
    + dbcellIdxs.reduce((sum, i) => sum + 4 + records[i].data.length, 0)
  const consumerBofOffset = records[consumer.startIdx].offset

  const boundsheetIdxs: number[] = []
  for (let i = globals.startIdx; i <= globals.endIdx; i++) if (records[i].opcode === OPCODE.BOUNDSHEET) boundsheetIdxs.push(i)
  for (const bsIdx of boundsheetIdxs) {
    const bsLbPlyPos = records[bsIdx].data.readUInt32LE(0)
    const delta = bsLbPlyPos === consumerBofOffset ? 0 : -removedBytes // Consumer's own BOF doesn't move (SST didn't grow); everything after it shifts back
    replacements.set(bsIdx, { ...records[bsIdx], data: patchBoundsheetLbPlyPos(records[bsIdx].data, bsLbPlyPos + delta) })
  }

  const patchedRecords = applyPatchPlan(records, { replacements, deletions, insertionsAfter: new Map() })
  const reserialized = serializeBiffRecords(patchedRecords)

  // ── Independent re-verification, same discipline as Stage 4. ─────────
  const reparsed = parseBiffRecords(reserialized)
  const reSub = locateSubstreams(reparsed) // throws if any BOUNDSHEET.lbPlyPos is wrong
  const reConsumer = reSub.sheets.find(s => s.name === 'Consumer')
  if (!reConsumer) throw new Error('Self-check failed: Consumer sheet not found after patch.')

  const reDimIdx = reparsed.findIndex((r, i) => r.opcode === OPCODE.DIMENSIONS && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  const reDims = readDimensions(reparsed[reDimIdx].data)
  if (reDims.rwMac !== dims.rwMac - 1) throw new Error(`Self-check failed: DIMENSIONS.rwMac is ${reDims.rwMac}, expected ${dims.rwMac - 1}.`)

  const reSstIdx = reparsed.findIndex((r, i) => r.opcode === OPCODE.SST && i >= reSub.globals.startIdx && i <= reSub.globals.endIdx)
  const reCstTotal = reparsed[reSstIdx].data.readUInt32LE(0)
  const reCstUnique = reparsed[reSstIdx].data.readUInt32LE(4)
  if (reCstTotal !== cstTotalAfter) throw new Error(`Self-check failed: cstTotal is ${reCstTotal}, expected ${cstTotalAfter}.`)
  if (reCstUnique !== cstUnique) throw new Error(`Self-check failed: cstUnique changed (${cstUnique} -> ${reCstUnique}) — should be untouched, orphans deliberately left in place.`)

  const reIndexPresent = reparsed.some((r, i) => r.opcode === OPCODE.INDEX && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  const reDbcellPresent = reparsed.some((r, i) => r.opcode === OPCODE.DBCELL && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  if (reIndexPresent || reDbcellPresent) throw new Error('Self-check failed: INDEX/DBCELL still present after intended removal.')

  const reRowNumbers = new Set<number>()
  for (let i = reConsumer.startIdx; i <= reConsumer.endIdx; i++) {
    if (reparsed[i].opcode === OPCODE.ROW) reRowNumbers.add(reparsed[i].data.readUInt16LE(0))
  }
  const expectedRows = new Set(Array.from({ length: dims.rwMac - 1 }, (_, k) => k))
  if (reRowNumbers.size !== expectedRows.size || Array.from(expectedRows).some(r => !reRowNumbers.has(r))) {
    throw new Error(`Self-check failed: row numbers after removal are ${Array.from(reRowNumbers).sort((a, b) => a - b)}, expected a contiguous 0..${dims.rwMac - 2}.`)
  }

  // Every real surviving client's data must still be intact — content
  // unchanged, just renumbered — verified by comparing the ORIGINAL
  // rows before/after the target against the PATCHED rows at their new
  // (shifted) indices.
  const reSstStrings = parseSstStrings(reparsed[reSstIdx].data)
  for (let origRow = 1; origRow < dims.rwMac; origRow++) {
    if (origRow === targetRow) continue
    const newRow = origRow > targetRow ? origRow - 1 : origRow
    const origCells = new Map<number, string>()
    for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
      if (records[i].opcode === OPCODE.LABELSST) {
        const v = decodeLabelSst(records[i].data)
        if (v.row === origRow) origCells.set(v.col, sstStrings[v.sstIndex])
      }
    }
    const newCells = new Map<number, string>()
    for (let i = reConsumer.startIdx; i <= reConsumer.endIdx; i++) {
      if (reparsed[i].opcode === OPCODE.LABELSST) {
        const v = decodeLabelSst(reparsed[i].data)
        if (v.row === newRow) newCells.set(v.col, reSstStrings[v.sstIndex])
      }
    }
    if (origCells.size !== newCells.size) throw new Error(`Self-check failed: row ${origRow} (now ${newRow}) has ${newCells.size} cells, expected ${origCells.size}.`)
    for (const [col, val] of Array.from(origCells.entries())) {
      if (newCells.get(col) !== val) throw new Error(`Self-check failed: row ${origRow} (now ${newRow}) col ${col} is "${newCells.get(col)}", expected "${val}".`)
    }
  }

  // Every other sheet must be byte-identical in content.
  for (const origSheet of sheets) {
    if (origSheet.name === 'Consumer') continue
    const reSheet = reSub.sheets.find(s => s.name === origSheet.name)
    if (!reSheet) throw new Error(`Self-check failed: sheet "${origSheet.name}" missing after patch.`)
    const origSlice = records.slice(origSheet.startIdx, origSheet.endIdx + 1)
    const reSlice = reparsed.slice(reSheet.startIdx, reSheet.endIdx + 1)
    if (origSlice.length !== reSlice.length) throw new Error(`Self-check failed: sheet "${origSheet.name}" record count changed.`)
    for (let k = 0; k < origSlice.length; k++) {
      if (origSlice[k].opcode !== reSlice[k].opcode || !origSlice[k].data.equals(reSlice[k].data)) {
        throw new Error(`Self-check failed: sheet "${origSheet.name}" record ${k} differs — should be untouched.`)
      }
    }
  }

  const outBuffer = writeWorkbookStream(container, reserialized)

  return {
    buffer: outBuffer,
    removedRow: targetRow,
    removedFields,
    rowsRenumbered,
    cstTotalBefore,
    cstTotalAfter,
    cstUniqueUnchanged: true,
    orphanedSstEntries,
    indexAndDbcellRemoved: indexIdx0 !== -1 || dbcellIdxs.length > 0,
  }
}

// ─── PRODUCTION: diff-based monthly update ───────────────────────────────
//
// Everything below reuses the exact primitives proven by Stages 1-5 and
// the chained repeat-use test — no new BIFF8 mechanics, just generalizing
// "one hardcoded target cell/row" into "whichever real header/row a real
// client's data lives at." This is what `lib/crb-report.ts` calls: given
// last month's real filed file and this month's live loan data, it
// updates only the rows whose values actually changed, inserts rows for
// genuinely new clients, and removes rows for clients no longer carrying
// a balance — never a from-scratch rebuild.

function extractWorkbookStream(fileBuffer: Buffer): { container: any; stream: Buffer } {
  const container = CFB.parse(fileBuffer)
  const wbEntry = container.FileIndex.find((e: any) => e.name === WORKBOOK_STREAM_NAME)
  if (!wbEntry) throw new Error('Workbook stream not found in the file.')
  return { container, stream: Buffer.from(wbEntry.content) }
}

function findConsumerHeaderColumns(records: Biff8Record[], consumer: SheetSubstream, sstStrings: string[]): Record<string, number> {
  const colMap: Record<string, number> = {}
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode !== OPCODE.LABELSST) continue
    const v = decodeLabelSst(records[i].data)
    if (v.row === 0) colMap[sstStrings[v.sstIndex]] = v.col
  }
  return colMap
}

interface ExistingCell {
  idx: number // the record's index — for a MULRK member, this is the shared MULRK record's index
  value: string
  xf: number
  mulrk?: { firstCol: number; lastCol: number }
}

// Scans one row for every cell that carries a real value — LABELSST
// (text) or RK/MULRK (real BIFF8 numbers, confirmed present for
// Classification and Opening/Current Balance on some real rows — see
// the OPCODE.RK comment above). Missing this was a real bug caught
// before any live data ran through it: without it, RK/MULRK-encoded
// cells looked like "no existing value" to the diff logic, which would
// have inserted a second, conflicting cell record at the same
// coordinates instead of updating the one already there.
function readRowCells(records: Biff8Record[], consumer: SheetSubstream, sstStrings: string[], row: number): Map<number, ExistingCell> {
  const cells = new Map<number, ExistingCell>()
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    const opcode = records[i].opcode
    if (opcode === OPCODE.LABELSST) {
      const v = decodeLabelSst(records[i].data)
      if (v.row === row) cells.set(v.col, { idx: i, value: sstStrings[v.sstIndex], xf: v.xf })
    } else if (opcode === OPCODE.RK) {
      const r = records[i].data.readUInt16LE(0)
      const col = records[i].data.readUInt16LE(2)
      const xf = records[i].data.readUInt16LE(4)
      if (r === row) cells.set(col, { idx: i, value: String(decodeRk(records[i].data.readUInt32LE(6))), xf })
    } else if (opcode === OPCODE.MULRK) {
      const r = records[i].data.readUInt16LE(0)
      if (r !== row) continue
      const firstCol = records[i].data.readUInt16LE(2)
      const lastCol = records[i].data.readUInt16LE(records[i].data.length - 2)
      for (let c = firstCol; c <= lastCol; c++) {
        const off = 4 + (c - firstCol) * 6
        const xf = records[i].data.readUInt16LE(off)
        const rkRaw = records[i].data.readUInt32LE(off + 2)
        cells.set(c, { idx: i, value: String(decodeRk(rkRaw)), xf, mulrk: { firstCol, lastCol } })
      }
    }
  }
  return cells
}

// Splits a MULRK record into individual per-column records so one column
// within the group can be changed without disturbing the others — every
// column in the group becomes a plain cell record (LABELSST for the one
// column actually changing, RK preserved for the rest), in the same
// relative column order the MULRK record already had.
// `changesByCol` may contain more than one column from the same group at
// once (e.g. Opening Balance and Current Balance are adjacent columns in
// the same real MULRK record) — every changing column becomes LABELSST
// with its new value, every other column in the group is preserved
// exactly as an individual RK record, in the same column order.
function splitMulrk(records: Biff8Record[], mulrkIdx: number, changesByCol: Map<number, number>): Biff8Record[] {
  const data = records[mulrkIdx].data
  const row = data.readUInt16LE(0)
  const firstCol = data.readUInt16LE(2)
  const lastCol = data.readUInt16LE(data.length - 2)
  const out: Biff8Record[] = []
  for (let c = firstCol; c <= lastCol; c++) {
    const off = 4 + (c - firstCol) * 6
    const xf = data.readUInt16LE(off)
    const newSstIndex = changesByCol.get(c)
    if (newSstIndex !== undefined) {
      out.push({ opcode: OPCODE.LABELSST, offset: -1, data: encodeLabelSst({ row, col: c, xf, sstIndex: newSstIndex }) })
    } else {
      const rkRaw = data.readUInt32LE(off + 2)
      const rkData = Buffer.alloc(10)
      rkData.writeUInt16LE(row, 0)
      rkData.writeUInt16LE(c, 2)
      rkData.writeUInt16LE(xf, 4)
      rkData.writeUInt32LE(rkRaw, 6)
      out.push({ opcode: OPCODE.RK, offset: -1, data: rkData })
    }
  }
  return out
}

export interface ConsumerRoster {
  // Real header text -> real column index, from row 0 of the actual file.
  colMap: Record<string, number>
  // Client national ID -> { row, fields (only the headers asked for) }.
  rowsByNationalId: Map<string, { row: number; fields: Record<string, string> }>
  lastRow: number
}

// Reads the CURRENT state of the Consumer sheet's data rows, keyed by
// National ID Number (the natural real-world unique key — `iacm_clients`
// itself is keyed the same way). `headersOfInterest` limits which columns
// get read into `fields` — every OTHER column (Nature/Category/Employer/
// etc., anything with no live source) is deliberately left out of this
// snapshot entirely, so update logic downstream never touches it, which
// is what preserves any manually-entered supplementary data across
// months instead of wiping it on every regeneration like the old
// SheetJS-based clear-and-rewrite approach did.
export function readConsumerRoster(fileBuffer: Buffer, headersOfInterest: string[]): ConsumerRoster {
  const { stream } = extractWorkbookStream(fileBuffer)
  const records = parseBiffRecords(stream)
  const { globals, sheets } = locateSubstreams(records)
  const sstIdx = records.findIndex((r, i) => r.opcode === OPCODE.SST && i >= globals.startIdx && i <= globals.endIdx)
  if (sstIdx === -1) throw new Error('No SST record found in globals.')
  const sstStrings = parseSstStrings(records[sstIdx].data)

  const consumer = sheets.find(s => s.name === 'Consumer')
  if (!consumer) throw new Error('Consumer sheet substream not found.')
  const colMap = findConsumerHeaderColumns(records, consumer, sstStrings)
  const natIdCol = colMap['National ID Number']
  if (natIdCol === undefined) throw new Error('"National ID Number" header not found in Consumer row 0.')

  const dimIdx = records.findIndex((r, i) => r.opcode === OPCODE.DIMENSIONS && i >= consumer.startIdx && i <= consumer.endIdx)
  if (dimIdx === -1) throw new Error('No DIMENSIONS record found in Consumer.')
  const dims = readDimensions(records[dimIdx].data)
  const lastRow = dims.rwMac - 1

  const rowsByNationalId = new Map<string, { row: number; fields: Record<string, string> }>()
  for (let row = 1; row <= lastRow; row++) {
    const cols = readRowCells(records, consumer, sstStrings, row) // covers LABELSST and RK/MULRK-encoded cells alike
    const natId = cols.get(natIdCol)?.value
    if (!natId) continue
    const fields: Record<string, string> = {}
    for (const h of headersOfInterest) {
      const c = colMap[h]
      if (c !== undefined && cols.has(c)) fields[h] = cols.get(c)!.value
    }
    rowsByNationalId.set(natId, { row, fields })
  }

  return { colMap, rowsByNationalId, lastRow }
}

// Finds the record to splice a brand-new cell in after, for a row that
// already has SOME cells but not one at `col` yet: the nearest existing
// cell in the same row at a smaller column, or failing that, the last
// cell of any earlier row (cell records for a whole sheet run in one
// contiguous, row-ordered block), or failing that (this row is the very
// first thing in the sheet with no earlier cells at all — realistically
// never hit, since row 0's header cells always exist first), that row's
// own ROW record.
function findCellInsertionAnchor(records: Biff8Record[], consumer: SheetSubstream, row: number, col: number, rowRecordIdx: Map<number, number>): number {
  let bestCol = -1, bestIdx = -1
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode !== OPCODE.LABELSST) continue
    const v = decodeLabelSst(records[i].data)
    if (v.row === row && v.col < col && v.col > bestCol) { bestCol = v.col; bestIdx = i }
  }
  if (bestIdx !== -1) return bestIdx

  let lastEarlierCellIdx = -1
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode !== OPCODE.LABELSST) continue
    if (decodeLabelSst(records[i].data).row < row) lastEarlierCellIdx = i
  }
  if (lastEarlierCellIdx !== -1) return lastEarlierCellIdx

  const ownRowRecord = rowRecordIdx.get(row)
  if (ownRowRecord !== undefined) return ownRowRecord
  throw new Error(`Could not find an insertion anchor for a new cell at row ${row}, col ${col}.`)
}

// Same column-XF-inheritance rule as Stage 4: a genuinely new cell on an
// existing row copies the XF from the same column on the nearest other
// real data row, rather than guessing a default.
// Falls back to the most common (mode) XF used across every real data-
// row cell in the sheet when this exact column has never been populated
// on any other row — a real edge case, not hypothetical: caught live
// when a genuinely new client had a third forename, a column no
// existing row had ever used. That mode XF is a real, evidence-derived
// "typical data cell" style for this sheet (285/282-range values showed
// up repeatedly as the dominant style across unrelated columns/rows all
// through this feature's testing), not an invented default.
function findXfForColumn(records: Biff8Record[], consumer: SheetSubstream, col: number, excludeRow: number): number {
  const xfCounts = new Map<number, number>()
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode !== OPCODE.LABELSST) continue
    const v = decodeLabelSst(records[i].data)
    if (v.row === 0) continue
    if (v.col === col && v.row !== excludeRow) return v.xf
    if (v.row !== excludeRow) xfCounts.set(v.xf, (xfCounts.get(v.xf) ?? 0) + 1)
  }
  let modeXf = -1, modeCount = 0
  for (const [xf, count] of Array.from(xfCounts.entries())) {
    if (count > modeCount) { modeXf = xf; modeCount = count }
  }
  if (modeXf === -1) throw new Error(`No real data rows found at all to derive a fallback style from for column ${col}.`)
  return modeXf
}

export interface RowUpdateResult {
  buffer: Buffer
  changedFields: Record<string, { old: string | undefined; new: string }>
}

// Updates one existing row's cells to match `targetFields` — ONLY the
// headers passed in, and ONLY the ones whose value actually differs from
// what's currently there. Every other cell on the row (including any
// header not in `targetFields` — Nature/Category/Employer/etc., or
// anything Devotha may have filled in by hand) is never touched at all.
export function applyRowFieldUpdates(originalFileBuffer: Buffer, targetRow: number, targetFields: Record<string, string>): RowUpdateResult {
  const { container, stream } = extractWorkbookStream(originalFileBuffer)
  const records = parseBiffRecords(stream)
  const { globals, sheets } = locateSubstreams(records)

  const sstIdx = records.findIndex((r, i) => r.opcode === OPCODE.SST && i >= globals.startIdx && i <= globals.endIdx)
  if (sstIdx === -1) throw new Error('No SST record found in globals.')
  let sstStrings = parseSstStrings(records[sstIdx].data)
  const cstTotalBefore = records[sstIdx].data.readUInt32LE(0)
  let cstUnique = records[sstIdx].data.readUInt32LE(4)
  let sstData = Buffer.from(records[sstIdx].data)
  let newCellCount = 0

  function ensureSstIndex(value: string): number {
    const existing = sstStrings.indexOf(value)
    if (existing !== -1) return existing
    const newIndex = cstUnique
    sstData = Buffer.concat([sstData, encodeSstEntry(value)])
    cstUnique += 1
    sstStrings = [...sstStrings, value]
    sstData.writeUInt32LE(cstTotalBefore + newCellCount, 0) // corrected again below once newCellCount is final
    sstData.writeUInt32LE(cstUnique, 4)
    return newIndex
  }

  const consumer = sheets.find(s => s.name === 'Consumer')
  if (!consumer) throw new Error('Consumer sheet substream not found.')
  const colMap = findConsumerHeaderColumns(records, consumer, sstStrings)

  const rowRecordIdx = new Map<number, number>()
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) {
    if (records[i].opcode === OPCODE.ROW) rowRecordIdx.set(records[i].data.readUInt16LE(0), i)
  }
  if (!rowRecordIdx.has(targetRow)) throw new Error(`No ROW record found for row ${targetRow}.`)

  // Covers LABELSST AND the real RK/MULRK-encoded cells confirmed present
  // for some columns on some rows (Classification, Opening/Current
  // Balance) — scanning LABELSST alone would treat those as "no existing
  // value" and insert a conflicting second cell at the same coordinates.
  const existingCells = readRowCells(records, consumer, sstStrings, targetRow)

  const replacements = new Map<number, Biff8Record>()
  const deletions = new Set<number>()
  const insertionsAfter = new Map<number, Biff8Record[]>()
  const changedFields: Record<string, { old: string | undefined; new: string }> = {}
  const mulrkGroupChanges = new Map<number, Map<number, number>>() // mulrk record idx -> (col -> new sstIndex)

  const sortedTargets = Object.entries(targetFields)
    .map(([header, value]) => {
      const col = colMap[header]
      if (col === undefined) throw new Error(`Header "${header}" not found in Consumer row 0.`)
      return { header, value, col }
    })
    .sort((a, b) => a.col - b.col)

  for (const { header, value, col } of sortedTargets) {
    const existing = existingCells.get(col)
    if (existing && existing.value === value) continue

    const newSstIndex = ensureSstIndex(value)
    changedFields[header] = { old: existing?.value, new: value }

    if (!existing) {
      // Genuinely new cell — a real new string reference.
      newCellCount++
      const xf = findXfForColumn(records, consumer, col, targetRow)
      const anchor = findCellInsertionAnchor(records, consumer, targetRow, col, rowRecordIdx)
      const newCell: Biff8Record = { opcode: OPCODE.LABELSST, offset: -1, data: encodeLabelSst({ row: targetRow, col, xf, sstIndex: newSstIndex }) }
      insertionsAfter.set(anchor, [...(insertionsAfter.get(anchor) ?? []), newCell])
    } else if (existing.mulrk) {
      // Deferred: batched per-group below, so multiple changing columns
      // in the same MULRK record only get split once, not once per column.
      newCellCount++ // was numeric (RK), becomes a real string reference
      if (!mulrkGroupChanges.has(existing.idx)) mulrkGroupChanges.set(existing.idx, new Map())
      mulrkGroupChanges.get(existing.idx)!.set(col, newSstIndex)
    } else if (records[existing.idx].opcode === OPCODE.RK) {
      // Single RK cell -> LABELSST: same 10-byte layout, simple replace,
      // but this IS a new string reference (was numeric before).
      newCellCount++
      replacements.set(existing.idx, { opcode: OPCODE.LABELSST, offset: -1, data: encodeLabelSst({ row: targetRow, col, xf: existing.xf, sstIndex: newSstIndex }) })
    } else {
      // Already LABELSST — pure repoint, no new reference.
      replacements.set(existing.idx, { opcode: OPCODE.LABELSST, offset: -1, data: encodeLabelSst({ row: targetRow, col, xf: existing.xf, sstIndex: newSstIndex }) })
    }
  }

  for (const [mulrkIdx, changes] of Array.from(mulrkGroupChanges.entries())) {
    deletions.add(mulrkIdx)
    insertionsAfter.set(mulrkIdx, [...(insertionsAfter.get(mulrkIdx) ?? []), ...splitMulrk(records, mulrkIdx, changes)])
  }

  if (Object.keys(changedFields).length === 0) {
    return { buffer: originalFileBuffer, changedFields: {} }
  }

  // cstTotal grows by exactly the number of genuinely new cells created.
  sstData.writeUInt32LE(cstTotalBefore + newCellCount, 0)
  replacements.set(sstIdx, { ...records[sstIdx], data: sstData })

  const sstGrowthBytes = sstData.length - records[sstIdx].data.length
  const insertedBytes = Array.from(insertionsAfter.values()).reduce((sum, cells) => sum + cells.reduce((s, c) => s + 4 + c.data.length, 0), 0)
  const deletedBytes = Array.from(deletions).reduce((sum, i) => sum + 4 + records[i].data.length, 0)
  const consumerInternalDelta = insertedBytes - deletedBytes
  const consumerBofOffset = records[consumer.startIdx].offset

  const boundsheetIdxs: number[] = []
  for (let i = globals.startIdx; i <= globals.endIdx; i++) if (records[i].opcode === OPCODE.BOUNDSHEET) boundsheetIdxs.push(i)
  for (const bsIdx of boundsheetIdxs) {
    const bsLbPlyPos = records[bsIdx].data.readUInt32LE(0)
    const delta = bsLbPlyPos === consumerBofOffset ? sstGrowthBytes : sstGrowthBytes + consumerInternalDelta
    replacements.set(bsIdx, { ...records[bsIdx], data: patchBoundsheetLbPlyPos(records[bsIdx].data, bsLbPlyPos + delta) })
  }

  const patchedRecords = applyPatchPlan(records, { replacements, deletions, insertionsAfter })
  const reserialized = serializeBiffRecords(patchedRecords)

  // Independent re-verification, same discipline as every stage above.
  const reparsed = parseBiffRecords(reserialized)
  const reSub = locateSubstreams(reparsed) // throws if any BOUNDSHEET.lbPlyPos is wrong
  const reConsumer = reSub.sheets.find(s => s.name === 'Consumer')
  if (!reConsumer) throw new Error('Self-check failed: Consumer sheet not found after patch.')
  const reSstIdx = reparsed.findIndex((r, i) => r.opcode === OPCODE.SST && i >= reSub.globals.startIdx && i <= reSub.globals.endIdx)
  const reSstStrings = parseSstStrings(reparsed[reSstIdx].data)

  // Must use the same RK/MULRK-aware scan as the real update logic above
  // — an earlier version of this check only looked at LABELSST records,
  // which meant a column deliberately left untouched (value already
  // matched, so still a preserved RK cell inside a split MULRK group)
  // read back as "missing" and failed a self-check that was actually
  // correct. Caught in the first live run against real data, before any
  // wrong file was ever written.
  const reRowCells = readRowCells(reparsed, reConsumer, reSstStrings, targetRow)
  for (const { header, value, col } of sortedTargets) {
    const actual = reRowCells.get(col)?.value
    if (actual !== value) {
      throw new Error(`Self-check failed: after patch, row ${targetRow} col ${col} ("${header}") is "${actual}", expected "${value}".`)
    }
  }
  // Every OTHER sheet must be byte-identical in content.
  for (const origSheet of sheets) {
    if (origSheet.name === 'Consumer') continue
    const reSheet = reSub.sheets.find(s => s.name === origSheet.name)
    if (!reSheet) throw new Error(`Self-check failed: sheet "${origSheet.name}" missing after patch.`)
    const origSlice = records.slice(origSheet.startIdx, origSheet.endIdx + 1)
    const reSlice = reparsed.slice(reSheet.startIdx, reSheet.endIdx + 1)
    if (origSlice.length !== reSlice.length) throw new Error(`Self-check failed: sheet "${origSheet.name}" record count changed.`)
    for (let k = 0; k < origSlice.length; k++) {
      if (origSlice[k].opcode !== reSlice[k].opcode || !origSlice[k].data.equals(reSlice[k].data)) {
        throw new Error(`Self-check failed: sheet "${origSheet.name}" record ${k} differs — should be untouched.`)
      }
    }
  }

  const outBuffer = writeWorkbookStream(container, reserialized)
  return { buffer: outBuffer, changedFields }
}

export interface RowInsertionResult {
  buffer: Buffer
  newRow: number
}

// Appends a genuinely new client row, populated with ONLY the headers in
// `fields` (everything else — Nature/Category/Employer/etc. — is left
// with no cell record at all, i.e. genuinely blank, matching the
// existing blank-by-design policy for a client we have no data for).
// Each populated cell's XF is copied from the same column on the current
// real last row. Consumer's INDEX/DBCELL (if still present) are removed,
// same confirmed-safe design decision as Stage 4.
export function applyRowInsertion(originalFileBuffer: Buffer, fields: Record<string, string>): RowInsertionResult {
  const { container, stream } = extractWorkbookStream(originalFileBuffer)
  const records = parseBiffRecords(stream)
  const { globals, sheets } = locateSubstreams(records)

  const sstIdx = records.findIndex((r, i) => r.opcode === OPCODE.SST && i >= globals.startIdx && i <= globals.endIdx)
  if (sstIdx === -1) throw new Error('No SST record found in globals.')
  let sstStrings = parseSstStrings(records[sstIdx].data)
  const cstTotal = records[sstIdx].data.readUInt32LE(0)
  let cstUnique = records[sstIdx].data.readUInt32LE(4)
  let sstData = Buffer.from(records[sstIdx].data)
  let newCellCount = 0

  function ensureSstIndex(value: string): number {
    const existing = sstStrings.indexOf(value)
    if (existing !== -1) return existing
    const newIndex = cstUnique
    sstData = Buffer.concat([sstData, encodeSstEntry(value)])
    cstUnique += 1
    sstStrings = [...sstStrings, value]
    sstData.writeUInt32LE(cstTotal + newCellCount, 0)
    sstData.writeUInt32LE(cstUnique, 4)
    return newIndex
  }

  const consumer = sheets.find(s => s.name === 'Consumer')
  if (!consumer) throw new Error('Consumer sheet substream not found.')
  const colMap = findConsumerHeaderColumns(records, consumer, sstStrings)

  const dimIdx = records.findIndex((r, i) => r.opcode === OPCODE.DIMENSIONS && i >= consumer.startIdx && i <= consumer.endIdx)
  if (dimIdx === -1) throw new Error('No DIMENSIONS record found in Consumer.')
  const dims = readDimensions(records[dimIdx].data)

  const rowRecordIdxs: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) if (records[i].opcode === OPCODE.ROW) rowRecordIdxs.push(i)
  const lastRowRecordIdx = rowRecordIdxs[rowRecordIdxs.length - 1]
  const lastRowIndex = records[lastRowRecordIdx].data.readUInt16LE(0)
  if (lastRowIndex !== dims.rwMac - 1) {
    throw new Error(`Last ROW record is row ${lastRowIndex} but DIMENSIONS says rwMac=${dims.rwMac} — inconsistent, not proceeding.`)
  }
  const newRowIndex = lastRowIndex + 1

  const indexIdx = records.findIndex((r, i) => r.opcode === OPCODE.INDEX && i >= consumer.startIdx && i <= consumer.endIdx)
  const dbcellIdxs: number[] = []
  for (let i = consumer.startIdx; i <= consumer.endIdx; i++) if (records[i].opcode === OPCODE.DBCELL) dbcellIdxs.push(i)

  const sortedFields = Object.entries(fields)
    .map(([header, value]) => {
      const col = colMap[header]
      if (col === undefined) throw new Error(`Header "${header}" not found in Consumer row 0.`)
      return { header, value, col }
    })
    .sort((a, b) => a.col - b.col)

  newCellCount = sortedFields.length
  const newRowCells: Biff8Record[] = sortedFields.map(({ value, col }) => {
    const xf = findXfForColumn(records, consumer, col, newRowIndex)
    const sstIndex = ensureSstIndex(value)
    return { opcode: OPCODE.LABELSST, offset: -1, data: encodeLabelSst({ row: newRowIndex, col, xf, sstIndex }) }
  })
  const lastCellRecordIdx = (() => {
    let idx = -1
    for (let i = consumer.startIdx; i <= consumer.endIdx; i++) if (records[i].opcode === OPCODE.LABELSST) idx = i
    return idx
  })()
  if (lastCellRecordIdx === -1) throw new Error('No existing cell records found in Consumer to anchor the new row after.')

  const newRowRecord: Biff8Record = { opcode: OPCODE.ROW, offset: -1, data: patchRowIndex(records[lastRowRecordIdx].data, newRowIndex) }
  const sstGrowthBytes = sstData.length - records[sstIdx].data.length

  const consumerBofOffset = records[consumer.startIdx].offset
  const insertedBytes = (4 + newRowRecord.data.length) + newRowCells.reduce((sum, c) => sum + 4 + c.data.length, 0)
  const removedBytes = (indexIdx !== -1 ? 4 + records[indexIdx].data.length : 0) + dbcellIdxs.reduce((sum, i) => sum + 4 + records[i].data.length, 0)
  const consumerInternalDelta = insertedBytes - removedBytes

  const boundsheetIdxs: number[] = []
  for (let i = globals.startIdx; i <= globals.endIdx; i++) if (records[i].opcode === OPCODE.BOUNDSHEET) boundsheetIdxs.push(i)

  const replacements = new Map<number, Biff8Record>()
  const deletions = new Set<number>()
  const insertionsAfter = new Map<number, Biff8Record[]>()

  replacements.set(sstIdx, { ...records[sstIdx], data: sstData })
  replacements.set(dimIdx, { ...records[dimIdx], data: patchDimensionsRwMac(records[dimIdx].data, newRowIndex + 1) })
  insertionsAfter.set(lastRowRecordIdx, [newRowRecord])
  insertionsAfter.set(lastCellRecordIdx, newRowCells)
  if (indexIdx !== -1) deletions.add(indexIdx)
  for (const i of dbcellIdxs) deletions.add(i)

  for (const bsIdx of boundsheetIdxs) {
    const bsLbPlyPos = records[bsIdx].data.readUInt32LE(0)
    const delta = bsLbPlyPos === consumerBofOffset ? sstGrowthBytes : sstGrowthBytes + consumerInternalDelta
    replacements.set(bsIdx, { ...records[bsIdx], data: patchBoundsheetLbPlyPos(records[bsIdx].data, bsLbPlyPos + delta) })
  }

  const patchedRecords = applyPatchPlan(records, { replacements, deletions, insertionsAfter })
  const reserialized = serializeBiffRecords(patchedRecords)

  const reparsed = parseBiffRecords(reserialized)
  const reSub = locateSubstreams(reparsed)
  const reConsumer = reSub.sheets.find(s => s.name === 'Consumer')
  if (!reConsumer) throw new Error('Self-check failed: Consumer sheet not found after patch.')
  const reDimIdx = reparsed.findIndex((r, i) => r.opcode === OPCODE.DIMENSIONS && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  const reDims = readDimensions(reparsed[reDimIdx].data)
  if (reDims.rwMac !== newRowIndex + 1) throw new Error(`Self-check failed: DIMENSIONS.rwMac is ${reDims.rwMac}, expected ${newRowIndex + 1}.`)
  const reIndexPresent = reparsed.some((r, i) => r.opcode === OPCODE.INDEX && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  const reDbcellPresent = reparsed.some((r, i) => r.opcode === OPCODE.DBCELL && i >= reConsumer.startIdx && i <= reConsumer.endIdx)
  if (reIndexPresent || reDbcellPresent) throw new Error('Self-check failed: INDEX/DBCELL still present after intended removal.')
  for (const origSheet of sheets) {
    if (origSheet.name === 'Consumer') continue
    const reSheet = reSub.sheets.find(s => s.name === origSheet.name)
    if (!reSheet) throw new Error(`Self-check failed: sheet "${origSheet.name}" missing after patch.`)
    const origSlice = records.slice(origSheet.startIdx, origSheet.endIdx + 1)
    const reSlice = reparsed.slice(reSheet.startIdx, reSheet.endIdx + 1)
    if (origSlice.length !== reSlice.length) throw new Error(`Self-check failed: sheet "${origSheet.name}" record count changed.`)
    for (let k = 0; k < origSlice.length; k++) {
      if (origSlice[k].opcode !== reSlice[k].opcode || !origSlice[k].data.equals(reSlice[k].data)) {
        throw new Error(`Self-check failed: sheet "${origSheet.name}" record ${k} differs — should be untouched.`)
      }
    }
  }

  const outBuffer = writeWorkbookStream(container, reserialized)
  return { buffer: outBuffer, newRow: newRowIndex }
}
