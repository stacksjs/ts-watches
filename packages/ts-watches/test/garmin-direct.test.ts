import { expect, test } from 'bun:test'
import { crc16 } from '@zig-utils/garmin'
import { readStrictFit } from '../src/fit/strict'
import { decodeGarminHealthFile } from '../src/fit/garmin-health'
import { connectGarminBluetooth, garminBluetoothAvailable, garminFileIdentity } from '../src/realtime/garmin-bluetooth'
import type { GarminNativeBluetooth } from '../src/realtime/garmin-bluetooth'
function fit(records: number[]): Uint8Array {
  const bytes = new Uint8Array(12 + records.length + 2)
  bytes[0] = 12; bytes[1] = 32
  new DataView(bytes.buffer).setUint32(4, records.length, true)
  bytes.set([46, 70, 73, 84], 8); bytes.set(records, 12)
  new DataView(bytes.buffer).setUint16(bytes.length - 2, crc16(bytes.subarray(0, -2)), true)
  return bytes
}
const u32 = (value: number): number[] => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24]
test('strict FIT preserves compressed times and skips developer payloads', () => {
  const data = fit([
    0x60, 0, 0, 55, 0, 2, 253, 4, 134, 27, 1, 2, 1, 0, 2, 0,
    0, ...u32(1000), 65, 9, 8,
    0x80 | 9, 66, 7, 6,
  ])
  const result = readStrictFit(data)
  expect(result.map(m => m.fields[253])).toEqual([1000, 1001])
  expect(result.map(m => m.fields[27])).toEqual([65, 66])
  expect(decodeGarminHealthFile(data, 'UTC').heartRate.map(p => p.bpm)).toEqual([65, 66])
  data[20] ^= 1
  expect(() => readStrictFit(data)).toThrow('checksum')
})
test('overnight HRV uses FIT summary scale, never RR intervals', () => {
  const time = Math.floor(Date.UTC(2026, 9, 25, 8) / 1000) - 631065600
  const data = fit([0x40, 0, 0, 114, 1, 2, 253, 4, 134, 1, 2, 132, 0, ...u32(time), 0, 32])
  expect(decodeGarminHealthFile(data, 'America/Los_Angeles').days).toEqual([{ date: '2026-10-25', hrv: 64 }])
})
test('sleep uses FIT levels 2/3/4, excludes awake and closes on wake', () => {
  const time = Math.floor(Date.UTC(2026, 9, 25, 0) / 1000) - 631065600
  const records = [0x40, 0, 0, 19, 1, 2, 253, 4, 134, 0, 1, 0]
  for (const [offset, level] of [[0, 2], [3600, 3], [7200, 4], [10800, 1]]) records.push(0, ...u32(time + offset), level)
  expect(decodeGarminHealthFile(fit(records), 'UTC').days).toEqual([{ date: '2026-10-25', sleep_hours: 3 }])
})
test('truncated FIT and records without definitions fail instead of recovering', () => {
  expect(() => readStrictFit(fit([0]))).toThrow('definition')
  expect(() => readStrictFit(fit([0x40, 0]))).toThrow('Truncated')
  expect(() => readStrictFit(fit([]).slice(0, -1))).toThrow()
})
test('native support is capability checked, permission errors never probe other channels', async () => {
  expect(await garminBluetoothAvailable(null)).toBe(false)
  let connections = 0
  const host = {
    getState: async () => ({ streaming: true }),
    read: async () => [], write: async () => {},
    connect: async () => { connections++; throw Object.assign(new Error('Denied'), { code: 'NOT_AUTHORIZED' }) },
  } as unknown as GarminNativeBluetooth
  await expect(connectGarminBluetooth(host, 'device')).rejects.toThrow('Denied')
  expect(connections).toBe(1)
  await expect(connectGarminBluetooth(host, 'device', () => false)).rejects.toThrow('cancelled')
  expect(connections).toBe(1)
})
test('file checkpoints distinguish growing daily files and tolerate reordered indexes', () => {
  const entry = { dataType: 128, subType: 32, number: 2, size: 100, timestamp: 1000 }
  expect(garminFileIdentity(entry)).not.toBe(garminFileIdentity({ ...entry, size: 101 }))
})

test('monitoring steps combine activity counters without summing repeated snapshots', () => {
  const time = Math.floor(Date.UTC(2026, 9, 25, 12) / 1000) - 631065600
  const records = [0x40, 0, 0, 55, 0, 3, 253, 4, 134, 3, 4, 134, 5, 1, 0]
  for (const [offset, steps, activity] of [[0, 1000, 6], [1, 200, 1], [2, 1200, 6]])
    records.push(0, ...u32(time + offset), ...u32(steps), activity)
  expect(decodeGarminHealthFile(fit(records), 'UTC').days).toEqual([{ date: '2026-10-25', steps: 1400 }])
})
