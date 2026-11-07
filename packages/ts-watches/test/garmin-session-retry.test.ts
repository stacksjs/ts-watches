import { afterEach, expect, test } from 'bun:test'
import { HttpClient } from '../../ts-garmin/src/common/HttpClient'
import { UrlClass } from '../../ts-garmin/src/garmin/UrlClass'
import { GarminConnectClient } from '../src/cloud/garmin-connect'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('SSO throttles stop at their HTTP response and retain the provider deadline without leaking HTML', async () => {
  for (const failedStep of [1, 2, 3]) {
    let calls = 0
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      if (String(input).includes('oauth_consumer.json')) return Response.json({ consumer_key: 'consumer', consumer_secret: 'secret' })
      calls++
      return calls === failedStep
        ? new Response('<html>private sign-in response</html>', { status: 429, headers: { 'Retry-After': '7200' } })
        : new Response('<input name="_csrf" value="fixture">')
    }) as unknown as typeof fetch
    const before = Date.now()
    const error = await new HttpClient(new UrlClass()).login('athlete@example.com', 'password').catch(error => error)
    expect(error.status).toBe(429)
    expect(error.retryAfterSeconds).toBe(7200)
    expect(Date.parse(error.retryAt)).toBeGreaterThanOrEqual(before + 7200_000)
    expect(error.message).toContain('HTTP Error: 429')
    expect(error.message).not.toMatch(/password|MFA|private|athlete@example/)
    expect(calls).toBe(failedStep)
  }
})

test('Cloudflare throttles without Retry-After cool down for an hour; HTTP dates also survive', async () => {
  for (const after of [null, new Date(Date.now() + 3600_000).toUTCString()]) {
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => String(input).includes('oauth_consumer.json') ? Response.json({ consumer_key: 'consumer', consumer_secret: 'secret' }) : new Response('', { status: 429, headers: after ? { 'Retry-After': after } : {} })) as unknown as typeof fetch
    const error = await new HttpClient(new UrlClass()).login('a', 'b').catch(error => error)
    expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(3599)
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(3600)
  }
})

test('a restored account session can read without SSO and exports its encrypted-storage payload', async () => {
  const seen: string[] = []
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    seen.push(String(input))
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer cached-access')
    return Response.json({ displayName: 'Athlete', profileId: 7 })
  }) as unknown as typeof fetch
  const tokens = { oauth1: { oauth_token: 'one', oauth_token_secret: 'secret' }, oauth2: { access_token: 'cached-access', expires_at: Math.floor(Date.now() / 1000) + 3600 } } as Parameters<GarminConnectClient['restoreSession']>[0]
  const client = new GarminConnectClient({ username: 'athlete@example.com', password: 'unused' })
  client.restoreSession(tokens)
  expect(await client.getUserProfile()).toEqual({ displayName: 'Athlete', profileId: '7' })
  expect(client.exportSession()).toEqual(tokens)
  expect(seen).toHaveLength(1)
  expect(seen[0]).not.toContain('/sso/')
})

test('concurrent expired sessions refresh independently and never receive another account token', async () => {
  const reads: string[] = []
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input)
    if (url.endsWith('/exchange/user/2.0')) {
      const owner = new Headers(init?.headers).get('authorization')!.includes('oauth_token="a"') ? 'a' : 'b'
      await Bun.sleep(5)
      return Response.json({ access_token: owner + '-fresh', expires_in: 3600 })
    }
    const auth = new Headers(init?.headers).get('authorization')
    if (auth?.endsWith('-old')) return new Response('', { status: 401 })
    reads.push(url + ' ' + auth)
    return Response.json({ ok: true })
  }) as unknown as typeof fetch
  const clients = ['a', 'b'].map(owner => {
    const client = new HttpClient(new UrlClass())
    client.OAUTH_CONSUMER = { key: 'consumer', secret: 'secret' }
    client.oauth1Token = { oauth_token: owner, oauth_token_secret: 'secret' }
    client.oauth2Token = { access_token: owner + '-old' } as NonNullable<HttpClient['oauth2Token']>
    return client
  })
  await Promise.all(clients.map((client, i) => client.get('https://connectapi.garmin.com/' + ['a', 'b'][i])))
  expect(reads.sort()).toEqual(['https://connectapi.garmin.com/a Bearer a-fresh', 'https://connectapi.garmin.com/b Bearer b-fresh'])
})
