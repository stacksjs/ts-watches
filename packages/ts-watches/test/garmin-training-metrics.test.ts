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
