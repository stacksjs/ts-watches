import { afterEach, expect, test } from 'bun:test'
import { GarminConnectClient } from '../src/cloud/garmin-connect'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

test('training metrics use fixed account endpoints and preserve provider snapshots', async () => {
  const seen: string[] = []
  const snapshots = [{ calendarDate: '2026-10-24', recoveryTime: 1140, timestamp: '2026-10-24T12:00:00Z' }]
  globalThis.fetch = (async (url: any) => {
    seen.push(String(url))
    return Response.json(snapshots)
  }) as typeof fetch
  const client = new GarminConnectClient({ username: 'athlete@example.com', password: 'test' })
  ;(client as unknown as { isLoggedIn: boolean }).isLoggedIn = true
  expect(await client.getTrainingReadiness('2026-10-24')).toEqual(snapshots)
  await client.getTrainingStatus('2026-10-24')
  await client.getMaxMetrics('2026-10-01', '2026-10-24')
  expect(seen).toEqual([
    'https://connectapi.garmin.com/metrics-service/metrics/trainingreadiness/2026-10-24',
    'https://connectapi.garmin.com/metrics-service/metrics/trainingstatus/aggregated/2026-10-24',
    'https://connectapi.garmin.com/metrics-service/metrics/maxmet/daily/2026-10-01/2026-10-24',
  ])
  for (const date of ['2026-02-30', '../other', '2026-10-24?user=2'])
    await expect(client.getTrainingReadiness(date)).rejects.toThrow()
  await expect(client.getMaxMetrics('2026-10-24', '2026-10-01')).rejects.toThrow()
  expect(seen).toHaveLength(3)
  await expect(new GarminConnectClient().getTrainingStatus('2026-10-24')).rejects.toThrow()
})

test('recorded zones use activity-scoped endpoints and retain device times', async () => {
  const seen: string[] = []
  globalThis.fetch = (async (url: any) => {
    seen.push(String(url))
    return Response.json([{ zoneNumber: 1, secsInZone: 277.482, zoneLowBoundary: 93 }])
  }) as typeof fetch
  const client = new GarminConnectClient({ username: 'athlete@example.com', password: 'test' })
  ;(client as unknown as { isLoggedIn: boolean }).isLoggedIn = true
  expect(await client.getActivityHeartRateTimeInZones(42)).toEqual([{ zone: 1, seconds: 277.482, low: 93 }])
  await client.getActivityPowerTimeInZones(42)
  for (const id of [0, -1, Number.NaN, 4.5]) await expect(client.getActivityHeartRateTimeInZones(id)).rejects.toThrow()
  expect(seen).toEqual(['https://connectapi.garmin.com/activity-service/activity/42/hrTimeInZones', 'https://connectapi.garmin.com/activity-service/activity/42/powerTimeInZones'])
})

test('a missing zone report is empty, while authorization and provider failures remain failures', async () => {
  const client = new GarminConnectClient({ username: 'athlete@example.com', password: 'test' })
  ;(client as unknown as { isLoggedIn: boolean }).isLoggedIn = true
  globalThis.fetch = (async () => Response.json({}, { status: 404 })) as typeof fetch
  expect(await client.getActivityHeartRateTimeInZones(42)).toEqual([])
  for (const status of [401, 429, 503]) {
    globalThis.fetch = (async () => Response.json({}, { status })) as typeof fetch
    await expect(client.getActivityHeartRateTimeInZones(42)).rejects.toThrow()
  }
})
