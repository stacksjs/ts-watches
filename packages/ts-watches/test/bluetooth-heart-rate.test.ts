import { describe, expect, it } from 'bun:test'
import { parseHeartRateMeasurement } from '../src/realtime/bluetooth'

const measurement = (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer)

describe('Bluetooth heart rate broadcasts', () => {
  it('decodes a standard watch broadcast and a 16-bit reading', () => {
    expect(parseHeartRateMeasurement(measurement([0, 142])).heartRate).toBe(142)
    expect(parseHeartRateMeasurement(measurement([1, 44, 1])).heartRate).toBe(300)
  })

  it('reads contact, energy and multiple beat intervals in field order', () => {
    expect(parseHeartRateMeasurement(measurement([0x1e, 150, 12, 0, 0, 4, 0, 2]))).toEqual({ heartRate: 150, contactDetected: true, energyExpended: 12, rrIntervals: [1000, 500] })
    expect(parseHeartRateMeasurement(measurement([4, 150])).contactDetected).toBe(false)
    expect(parseHeartRateMeasurement(measurement([0, 150])).contactDetected).toBeUndefined()
  })

  it('rejects truncated fields and partial RR intervals', () => {
    for (const bytes of [[], [0], [1, 150], [8, 150], [8, 150, 1], [16, 150], [16, 150, 1], [16, 150, 0, 4, 0]])
      expect(() => parseHeartRateMeasurement(measurement(bytes))).toThrow('Incomplete Bluetooth heart rate measurement')
  })

  it('respects a view into a larger notification buffer', () => {
    const bytes = Uint8Array.from([255, 0, 142, 255])
    expect(parseHeartRateMeasurement(new DataView(bytes.buffer, 1, 2)).heartRate).toBe(142)
  })
})
