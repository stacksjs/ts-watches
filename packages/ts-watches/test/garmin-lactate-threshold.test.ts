import { afterEach, expect, test } from 'bun:test'
import { GarminConnectClient } from '../src/cloud/garmin-connect'
import { parseGarminLactateThreshold } from '../src/cloud/garmin-lactate-threshold'

const recorded = [
  { calendarDate: '2026-10-15T17:23:20.361', speed: 0.37222118, hearRate: null },
  { calendarDate: '2026-10-15T17:23:20.361', speed: null, hearRate: 166 },
]
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

test('biometric threshold speed is normalized independently of activity speed units', () => {
  const result = parseGarminLactateThreshold(recorded)
  expect(result.speed!.metersPerSecond).toBeCloseTo(3.7222118)
  expect(result.speed!.secondsPerKilometer).toBeCloseTo(268.657467)
  expect(Math.round(result.speed!.secondsPerKilometer)).toBe(269)
  expect(result.speed!.calendarDate).toBe('2026-10-15T17:23:20.361')
  expect(result.heartRate!.bpm).toBe(166)
  expect(Math.round(result.speed!.secondsPerKilometer)).not.toBe(372)
})

test('latest measurements are selected per metric and invalid data is never guessed', () => {
  const result = parseGarminLactateThreshold([...recorded, { calendarDate: '2026-10-16T12:00:00', speed: null, hearRate: 168 }, { calendarDate: '2026-10-01T12:00:00', speed: 0.35 }])
  expect(result.heartRate!.bpm).toBe(168)
  expect(result.speed!.calendarDate).toBe(recorded[0]!.calendarDate)
  for (const speed of [0, -1, Number.NaN, Infinity, '0.37222118', 3.7222118])
    expect(parseGarminLactateThreshold([{ calendarDate: recorded[0]!.calendarDate, speed }]).speed).toBeNull()
  expect(parseGarminLactateThreshold([])).toEqual({ speed: null, heartRate: null })
  expect(() => parseGarminLactateThreshold({})).toThrow()
})

test('the running threshold endpoint requires authentication and returns normalized measurements', async () => {
  const seen: string[] = []
  globalThis.fetch = (async (url: any) => {
    seen.push(String(url))
    return Response.json(recorded)
  }) as typeof fetch
  const client = new GarminConnectClient({ username: 'athlete@example.com', password: 'test' })
  await expect(client.getLatestLactateThreshold()).rejects.toThrow()
  ;(client as unknown as { isLoggedIn: boolean }).isLoggedIn = true
  expect(await client.getLatestLactateThreshold()).toEqual(parseGarminLactateThreshold(recorded))
  expect(seen).toEqual(['https://connectapi.garmin.com/biometric-service/biometric/latestLactateThreshold'])
})
