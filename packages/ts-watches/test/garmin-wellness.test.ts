import { afterEach, expect, test } from 'bun:test'
import { GarminConnectClient } from '../src/cloud/garmin-connect'

const original = globalThis.fetch
afterEach(() => { globalThis.fetch = original })
const day = new Date('2026-10-24T12:00:00Z')
function connected() {
  const client = new GarminConnectClient({ username: 'owner@example.com', password: 'unused' })
  ;(client as unknown as { isLoggedIn: boolean }).isLoggedIn = true
  return client
}
test('retains every real weigh-in and the original unit, timestamp and zero body fat', async () => {
  globalThis.fetch = (async () => Response.json({ dateWeightList: [
    { samplePk: 1, timestampGMT: day.getTime() - 3600000, weight: 73000, bodyFatPercentage: 0 },
    { samplePk: 2, timestampGMT: day.getTime(), weight: 73500, muscleMass: 32000 },
  ] })) as unknown as unknown as typeof fetch
  const client = connected()
  const rows = await client.getWeightReadings(day)
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ id: '1', weight: 73000, bodyFatPercentage: 0, timestamp: new Date(day.getTime() - 3600000) })
  expect(rows[1]).toMatchObject({ id: '2', weight: 73500, muscleMass: 32000 })
  expect(await client.getWeightData(day)).toEqual(rows[0])
})
test('distinguishes absent days from denied and rate-limited reads', async () => {
  const client = connected()
  for (const status of [401, 403, 429, 500]) {
    globalThis.fetch = (async () => Response.json({ error: 'unavailable' }, { status })) as unknown as unknown as typeof fetch
    await expect(client.getHeartRateData(day)).rejects.toThrow(String(status))
    await expect(client.getWeightReadings(day)).rejects.toThrow(String(status))
  }
  globalThis.fetch = (async () => Response.json({}, { status: 404 })) as unknown as unknown as typeof fetch
  expect(await client.getHeartRateData(day)).toBeUndefined()
  expect(await client.getWeightReadings(day)).toEqual([])
})
test('stress durations follow observed intervals without filling long gaps or fabricating an empty battery', async () => {
  const start = day.getTime()
  globalThis.fetch = (async (url: any) => Response.json(String(url).toLowerCase().includes('stress') ? {
    stressValuesArray: [[start, 80], [start + 120000, 20], [start + 240000, 10], [start + 3600000, 90]],
  } : {})) as unknown as typeof fetch
  const client = connected()
  const stress = await client.getStressData(day)
  expect(stress?.highStressDuration).toBe(2)
  expect(stress?.restStressDuration).toBe(2)
  expect(await client.getBodyBatteryData(day)).toBeUndefined()
})
test('hydration is a fixed own-account read with millilitres and a valid calendar date', async () => {
  const seen: string[] = []
  globalThis.fetch = (async (url: any) => { seen.push(String(url)); return Response.json({ valueInML: 0 }) }) as unknown as typeof fetch
  const client = connected()
  expect(await client.getHydrationData('2026-10-24')).toEqual({ valueInML: 0 })
  expect(seen).toEqual(['https://connectapi.garmin.com/usersummary-service/usersummary/hydration/allData/2026-10-24'])
  await expect(client.getHydrationData('../other-account')).rejects.toThrow()
  expect(seen).toHaveLength(1)
})

test('steps retain actual distance and goal, distinguish an absent day from measured zero, and never invent calories', async () => {
  const client = connected()
  globalThis.fetch = (async () => Response.json([{ calendarDate: '2026-10-24', totalSteps: 0, stepGoal: 15260, totalDistance: 0 }])) as unknown as typeof fetch
  expect(await client.getStepsData(day)).toEqual({ total: 0, goal: 15260, distance: 0 })
  globalThis.fetch = (async () => Response.json([])) as unknown as typeof fetch
  expect(await client.getStepsData(day)).toBeUndefined()
})
test('Body Battery reads the daily stress payload and resolves the level descriptor instead of the status column', async () => {
  const seen: string[] = []
  globalThis.fetch = (async (url: any) => { seen.push(String(url)); return Response.json({
    bodyBatteryValueDescriptorsDTOList: [
      { bodyBatteryValueDescriptorIndex: 0, bodyBatteryValueDescriptorKey: 'timestamp' },
      { bodyBatteryValueDescriptorIndex: 1, bodyBatteryValueDescriptorKey: 'bodyBatteryStatus' },
      { bodyBatteryValueDescriptorIndex: 2, bodyBatteryValueDescriptorKey: 'bodyBatteryLevel' },
    ], bodyBatteryValuesArray: [[day.getTime(), 'MEASURED', 30, 3], [day.getTime() + 60000, 'MEASURED', 0, 3]],
  }) }) as unknown as typeof fetch
  expect(await connected().getBodyBatteryData(day)).toMatchObject({ startLevel: 30, endLevel: 0, samples: [{ level: 30 }, { level: 0 }] })
  expect(seen[0]).toContain('/wellness-service/wellness/dailyStress/2026-10-24')
})
