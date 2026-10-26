import { afterEach, expect, test } from 'bun:test'
import { GarminConnectClient } from '../src/cloud/garmin-connect'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
const authenticated = () => {
  const client = new GarminConnectClient({ username: 'athlete@example.com', password: 'test' })
  ;(client as unknown as { isLoggedIn: boolean }).isLoggedIn = true
  return client
}

test('configured heart-rate thresholds and cycling FTP retain their sport and units', async () => {
  const seen: string[] = []
  globalThis.fetch = (async (url: any) => {
    seen.push(String(url))
    return Response.json(String(url).endsWith('/heartRateZones')
      ? [{ sport: 'CYCLING', lactateThresholdHeartRateUsed: 155 }, { sport: 'DEFAULT', maxHeartRateUsed: 186, restingHeartRateUsed: 64, lactateThresholdHeartRateUsed: 166 }]
      : [{ sport: 'RUNNING', functionalThresholdPower: 358 }, { sport: 'CYCLING', functionalThresholdPower: 211 }, { sport: 'ROWING', functionalThresholdPower: 160 }])
  }) as typeof fetch
  const client = authenticated()
  expect(await client.getHeartRateThresholds()).toEqual({ lthr: 166, maxHeartRate: 186, restingHeartRate: 64 })
  expect(await client.getCyclingFtp()).toBe(211)
  expect(seen).toEqual(['https://connectapi.garmin.com/biometric-service/heartRateZones', 'https://connectapi.garmin.com/biometric-service/powerZones/sports/all'])
})

test('running-specific heart-rate settings take precedence and invalid fields remain absent', async () => {
  globalThis.fetch = (async () => Response.json([
    { sport: 'DEFAULT', maxHeartRateUsed: 186, restingHeartRateUsed: 64, lactateThresholdHeartRateUsed: 166 },
    { sport: 'RUNNING', maxHeartRateUsed: 190, restingHeartRateUsed: 0, lactateThresholdHeartRateUsed: 170 },
  ])) as unknown as typeof fetch
  expect(await authenticated().getHeartRateThresholds()).toEqual({ lthr: 170, maxHeartRate: 190, restingHeartRate: 64 })
  for (const functionalThresholdPower of [0, -1, 2501, 211.5, '211']) {
    globalThis.fetch = (async () => Response.json([{ sport: 'CYCLING', functionalThresholdPower }, { sport: 'RUNNING', functionalThresholdPower: 358 }])) as unknown as typeof fetch
    expect(await authenticated().getCyclingFtp()).toBeNull()
  }
})

test('missing profile settings are absent while authorization, rate limits and malformed reports fail', async () => {
  globalThis.fetch = (async () => Response.json({}, { status: 404 })) as unknown as typeof fetch
  const client = authenticated()
  expect(await client.getHeartRateThresholds()).toEqual({ lthr: null, maxHeartRate: null, restingHeartRate: null })
  expect(await client.getCyclingFtp()).toBeNull()
  for (const status of [401, 429, 503]) {
    globalThis.fetch = (async () => Response.json({}, { status })) as unknown as typeof fetch
    await expect(client.getHeartRateThresholds()).rejects.toThrow()
    await expect(client.getCyclingFtp()).rejects.toThrow()
  }
  globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch
  await expect(client.getHeartRateThresholds()).rejects.toThrow()
  await expect(client.getCyclingFtp()).rejects.toThrow()
  await expect(new GarminConnectClient().getCyclingFtp()).rejects.toThrow()
})
