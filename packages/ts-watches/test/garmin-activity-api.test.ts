import { createHash } from 'node:crypto'
import { describe, expect, it } from 'bun:test'
import {
  createPkcePair,
  extractActivitySummaries,
  extractDeregistrations,
  GarminActivityApiClient,
  isAuthenticWebhook,
  isTokenExpired,
  OAUTH_ATTEMPT_TTL_MS,
  openOAuthAttempt,
  sealOAuthAttempt,
  signState,
  verifyState,
} from '../src/cloud/garmin-activity-api'

/** A fetch stub that records calls and replays canned responses. */
function stubFetch(responses: Array<{ status?: number, body?: unknown, text?: string }>): {
  fetch: typeof globalThis.fetch
  calls: Array<{ url: string, init?: RequestInit }>
} {
  const calls: Array<{ url: string, init?: RequestInit }> = []
  let index = 0

  const fetchImpl = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const next = responses[Math.min(index++, responses.length - 1)] ?? {}
    return new Response(next.text ?? JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof globalThis.fetch

  return { fetch: fetchImpl, calls }
}

function client(overrides: Partial<ConstructorParameters<typeof GarminActivityApiClient>[0]> = {}): GarminActivityApiClient {
  return new GarminActivityApiClient({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://example.test/callback',
    ...overrides,
  })
}

describe('createPkcePair', () => {
  it('derives the challenge as the S256 hash of the verifier', () => {
    const { verifier, challenge } = createPkcePair()

    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })

  it('stays within the length RFC 7636 permits', () => {
    const { verifier } = createPkcePair()

    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('produces a fresh pair each time', () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier)
  })
})

describe('buildAuthorizationUrl', () => {
  it('sends the challenge and never the verifier', () => {
    const url = new URL(client().buildAuthorizationUrl({ state: 's1', challenge: 'c1' }))

    expect(url.searchParams.get('code_challenge')).toBe('c1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('s1')
    expect(url.toString()).not.toContain('code_verifier')
  })

  it('defaults to read-only activity export', () => {
    const url = new URL(client().buildAuthorizationUrl({ state: 's', challenge: 'c' }))

    expect(url.searchParams.get('scope')).toBe('ACTIVITY_EXPORT')
  })

  it('encodes the redirect uri instead of corrupting the query', () => {
    const url = new URL(
      client({ redirectUri: 'https://example.test/callback?a=1' })
        .buildAuthorizationUrl({ state: 's', challenge: 'c' }),
    )

    expect(url.searchParams.get('redirect_uri')).toBe('https://example.test/callback?a=1')
  })
})

describe('exchangeCode', () => {
  it('sends the verifier and returns an absolute expiry', async () => {
    const { fetch, calls } = stubFetch([
      { body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'ACTIVITY_EXPORT' } },
    ])

    const tokens = await client({ fetch }).exchangeCode('the-code', 'the-verifier')

    const sent = new URLSearchParams(calls[0]!.init!.body as any)
    expect(sent.get('grant_type')).toBe('authorization_code')
    expect(sent.get('code_verifier')).toBe('the-verifier')
    expect(tokens.accessToken).toBe('at')
    // Absolute, so a stored token can be checked without knowing when it was issued.
    expect(tokens.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('reports the failure rather than returning an empty token', async () => {
    const { fetch } = stubFetch([{ status: 400, text: 'invalid_grant' }])

    await expect(client({ fetch }).exchangeCode('bad', 'v')).rejects.toThrow(/HTTP 400/)
  })

  it('rejects a 200 that carries no access token', async () => {
    const { fetch } = stubFetch([{ body: { token_type: 'Bearer' } }])

    await expect(client({ fetch }).exchangeCode('c', 'v')).rejects.toThrow(/no access token/)
  })
})

describe('refreshTokens', () => {
  it('uses the refresh grant', async () => {
    const { fetch, calls } = stubFetch([{ body: { access_token: 'new', expires_in: 100 } }])

    await client({ fetch }).refreshTokens('rt')

    const sent = new URLSearchParams(calls[0]!.init!.body as any)
    expect(sent.get('grant_type')).toBe('refresh_token')
    expect(sent.get('refresh_token')).toBe('rt')
  })
})

describe('getUserId', () => {
  it('returns the id every push notification is keyed by', async () => {
    const { fetch, calls } = stubFetch([{ body: { userId: 'garmin-abc' } }])

    expect(await client({ fetch }).getUserId('at')).toBe('garmin-abc')
    expect((calls[0]!.init!.headers as any).Authorization).toBe('Bearer at')
  })

  it('throws when the id is absent, since nothing can be attributed without it', async () => {
    const { fetch } = stubFetch([{ body: {} }])

    await expect(client({ fetch }).getUserId('at')).rejects.toThrow(/no userId/)
  })
})

describe('deregister', () => {
  it('tolerates a connection Garmin has already forgotten', async () => {
    const { fetch } = stubFetch([{ status: 404 }])

    await expect(client({ fetch }).deregister('at')).resolves.toBeUndefined()
  })

  it('reports a real failure', async () => {
    const { fetch } = stubFetch([{ status: 500 }])

    await expect(client({ fetch }).deregister('at')).rejects.toThrow(/HTTP 500/)
  })
})

describe('requestBackfill', () => {
  it('treats 202 as success, because the work is queued rather than done', async () => {
    const { fetch, calls } = stubFetch([{ status: 202 }])

    await client({ fetch }).requestBackfill('at', new Date(1_700_000_000_000), new Date(1_700_086_400_000))

    const url = new URL(calls[0]!.url)
    expect(url.searchParams.get('summaryStartTimeInSeconds')).toBe('1700000000')
    expect(url.searchParams.get('summaryEndTimeInSeconds')).toBe('1700086400')
  })
})

describe('isConfigured', () => {
  it('is false until Garmin has issued credentials', () => {
    expect(client({ clientId: '', clientSecret: '' }).isConfigured).toBe(false)
    expect(client({ clientSecret: '' }).isConfigured).toBe(false)
    expect(client().isConfigured).toBe(true)
  })
})

describe('extractActivitySummaries', () => {
  it('reads the documented envelope', () => {
    expect(extractActivitySummaries({ activities: [{ summaryId: 'a' }, { summaryId: 'b' }] })).toHaveLength(2)
  })

  it('also accepts a bare array', () => {
    expect(extractActivitySummaries([{ summaryId: 'a' }])).toHaveLength(1)
  })

  it('drops entries with no summaryId, which is the idempotency key', () => {
    expect(extractActivitySummaries({ activities: [{ summaryId: 'a' }, { activityType: 'RUNNING' }] })).toHaveLength(1)
  })

  it('returns nothing for an unrecognised shape rather than throwing', () => {
    expect(extractActivitySummaries(null)).toEqual([])
    expect(extractActivitySummaries({ nope: true })).toEqual([])
  })
})

describe('extractDeregistrations', () => {
  it('reads revocation notices', () => {
    expect(extractDeregistrations({ deregistrations: [{ userId: 'g1' }] })).toHaveLength(1)
  })

  it('ignores an activity payload', () => {
    expect(extractDeregistrations({ activities: [{ summaryId: 'a' }] })).toEqual([])
  })
})

describe('isAuthenticWebhook', () => {
  it('accepts only the configured secret', () => {
    expect(isAuthenticWebhook('shh', 'shh')).toBe(true)
    expect(isAuthenticWebhook('nope', 'shh')).toBe(false)
  })

  it('rejects everything when no secret is configured', () => {
    // A webhook that writes data must fail closed, or a forgotten setting
    // leaves a public write endpoint.
    expect(isAuthenticWebhook('anything', '')).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(isAuthenticWebhook(null, 'shh')).toBe(false)
    expect(isAuthenticWebhook(undefined, 'shh')).toBe(false)
  })
})

describe('signState / verifyState', () => {
  it('round-trips a value', () => {
    expect(verifyState(signState('user:42', 'secret'), 'secret')).toBe('user:42')
  })

  it('refuses a payload that was edited', () => {
    const [, signature] = signState('user:42', 'secret').split('.')
    const forged = Buffer.from('user:1').toString('base64url')

    expect(verifyState(`${forged}.${signature}`, 'secret')).toBeNull()
  })

  it('refuses a different signing key', () => {
    expect(verifyState(signState('user:42', 'other'), 'secret')).toBeNull()
  })

  it('refuses malformed input rather than throwing', () => {
    expect(verifyState(undefined, 'secret')).toBeNull()
    expect(verifyState('no-separator', 'secret')).toBeNull()
  })
})

describe('isTokenExpired', () => {
  const now = 1_700_000_000_000

  it('treats a token about to expire as expired, to cover the round trip', () => {
    expect(isTokenExpired({ accessToken: 'a', expiresAt: 1_700_000_000 + 30 }, 60, now)).toBe(true)
  })

  it('accepts a token with real time left', () => {
    expect(isTokenExpired({ accessToken: 'a', expiresAt: 1_700_000_000 + 3600 }, 60, now)).toBe(false)
  })

  it('treats an unknown expiry as not expired, leaving the API to decide', () => {
    expect(isTokenExpired({ accessToken: 'a' }, 60, now)).toBe(false)
  })
})

describe('sealOAuthAttempt / openOAuthAttempt', () => {
  const secret = 'signing-key'
  const attempt = { subject: 7, state: 'abc', verifier: 'v-123', issuedAt: 1_700_000_000_000 }

  it('round-trips an in-flight attempt', () => {
    const opened = openOAuthAttempt<number>(sealOAuthAttempt(attempt, secret), secret, { now: attempt.issuedAt + 1000 })

    expect(opened).toEqual(attempt)
  })

  it('refuses an attempt whose subject was edited', () => {
    // Otherwise someone points their own connection at another person's
    // account by changing one value in their cookie.
    const [, signature] = sealOAuthAttempt(attempt, secret).split('.')
    const forged = Buffer.from(JSON.stringify({ ...attempt, subject: 1 })).toString('base64url')

    expect(openOAuthAttempt(`${forged}.${signature}`, secret, { now: attempt.issuedAt + 1000 })).toBeNull()
  })

  it('refuses an attempt that has gone stale', () => {
    const sealed = sealOAuthAttempt(attempt, secret)

    expect(openOAuthAttempt(sealed, secret, { now: attempt.issuedAt + OAUTH_ATTEMPT_TTL_MS + 1 })).toBeNull()
  })

  it('refuses a different signing key', () => {
    expect(openOAuthAttempt(sealOAuthAttempt(attempt, 'other'), secret, { now: attempt.issuedAt })).toBeNull()
  })

  it('refuses malformed input rather than throwing', () => {
    expect(openOAuthAttempt(undefined, secret)).toBeNull()
    expect(openOAuthAttempt('not-a-token', secret)).toBeNull()
  })
})
