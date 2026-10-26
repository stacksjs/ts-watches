import { crc16 } from '@zig-utils/garmin'
export type FitValue = number | string | null | Array<number | null>
export interface StrictFitMessage { number: number, fields: Record<number, FitValue> }
interface Definition { number: number, little: boolean, fields: { number: number, size: number, type: number }[], developerBytes: number }
const widths: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 1, 8: 4, 9: 8, 10: 1, 11: 2, 12: 4, 13: 1, 14: 8, 15: 8, 16: 8 }
/** Exact framing and CRCs, no recovery-by-skipping corrupted bytes. */
export function readStrictFit(bytes: Uint8Array): StrictFitMessage[] {
  if (bytes.length < 14 || bytes.length > 16 * 1024 * 1024) throw new Error('Invalid FIT size')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const header = bytes[0]!
  if (![12, 14].includes(header) || String.fromCharCode(...bytes.subarray(8, 12)) !== '.FIT' || header + v.getUint32(4, true) + 2 !== bytes.length) throw new Error('Invalid FIT header or length')
  if (header === 14 && v.getUint16(12, true) !== 0 && crc16(bytes.subarray(0, 14)) !== 0) throw new Error('FIT header checksum mismatch')
  const end = bytes.length - 2
  const expected = v.getUint16(end, true)
  if (crc16(bytes.subarray(0, end)) !== expected) throw new Error('FIT checksum mismatch')
  const defs = new Map<number, Definition>()
  const messages: StrictFitMessage[] = []
  let at = header
  let timestamp: number | null = null
  const need = (count: number): void => { if (count < 0 || at + count > end) throw new Error('Truncated FIT record') }
  const scalar = (type: number, little: boolean, offset: number): number | null => {
    const width = widths[type]!
    let value: number
    if (type === 8) value = v.getFloat32(offset, little)
    else if (type === 9) value = v.getFloat64(offset, little)
    else if (width === 8) {
      const big = type === 14 ? v.getBigInt64(offset, little) : v.getBigUint64(offset, little)
      if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(Number.MIN_SAFE_INTEGER)) return null
      value = Number(big)
    }
    else if ([1, 3, 5].includes(type)) value = width === 1 ? v.getInt8(offset) : width === 2 ? v.getInt16(offset, little) : v.getInt32(offset, little)
    else value = width === 1 ? v.getUint8(offset) : width === 2 ? v.getUint16(offset, little) : v.getUint32(offset, little)
    const invalid = [10, 11, 12, 16].includes(type) ? 0 : [1, 3, 5, 14].includes(type) ? 2 ** (width * 8 - 1) - 1 : 2 ** (width * 8) - 1
    return !Number.isFinite(value) || value === invalid ? null : value
  }
  while (at < end) {
    if (messages.length >= 500000) throw new Error('Too many FIT records')
    const record = bytes[at++]!
    if (!(record & 128) && record & 64) {
      need(5)
      const architecture = bytes[at + 1]
      if (architecture !== 0 && architecture !== 1) throw new Error('Invalid FIT architecture')
      const little = architecture === 0
      const number = v.getUint16(at + 2, little)
      const count = bytes[at + 4]!
      at += 5
      need(count * 3)
      const fields: Definition['fields'] = []
      for (let i = 0; i < count; i++) {
        const field = { number: bytes[at]!, size: bytes[at + 1]!, type: bytes[at + 2]! & 31 }
        if (!field.size || !widths[field.type] || field.size % widths[field.type]! !== 0) throw new Error('Invalid FIT field')
        fields.push(field); at += 3
      }
      let developerBytes = 0
      if (record & 32) {
        need(1); const countDev = bytes[at++]!; need(countDev * 3)
        for (let i = 0; i < countDev; i++) { developerBytes += bytes[at + 1]!; at += 3 }
      }
      defs.set(record & 15, { number, little, fields, developerBytes })
      continue
    }
    const compressed = !!(record & 128)
    const def = defs.get(compressed ? (record >>> 5) & 3 : record & 15)
    if (!def) throw new Error('Missing FIT definition')
    const fields: StrictFitMessage['fields'] = {}
    if (compressed) {
      if (timestamp === null) throw new Error('Compressed FIT timestamp lacks a base')
      const low = record & 31
      timestamp = Math.floor(timestamp / 32) * 32 + low + (low < timestamp % 32 ? 32 : 0)
      fields[253] = timestamp
    }
    for (const f of def.fields) {
      if (compressed && f.number === 253) continue
      need(f.size)
      if (f.type === 7) {
        const raw = bytes.subarray(at, at + f.size)
        const zero = raw.indexOf(0)
        fields[f.number] = new TextDecoder().decode(zero < 0 ? raw : raw.subarray(0, zero))
      }
      else {
        const values: Array<number | null> = []
        for (let i = 0; i < f.size; i += widths[f.type]!) values.push(scalar(f.type, def.little, at + i))
        fields[f.number] = values.length === 1 ? values[0]! : values
      }
      at += f.size
    }
    need(def.developerBytes); at += def.developerBytes
    if (typeof fields[253] === 'number') timestamp = fields[253]
    if (def.number === 55 && typeof fields[26] === 'number' && fields[253] == null && timestamp !== null) {
      const low = fields[26]
      timestamp = Math.floor(timestamp / 65536) * 65536 + low + (low < timestamp % 65536 ? 65536 : 0)
      fields[253] = timestamp
    }
    messages.push({ number: def.number, fields })
  }
  return messages
}
