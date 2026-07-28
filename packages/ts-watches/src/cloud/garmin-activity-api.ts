/**
 * Garmin Connect Developer Program: the official Activity API.
 *
 * This is the counterpart to `garmin-connect.ts`, which drives the unofficial
 * Connect endpoints with a username and password. That approach works, but it
 * means an application holds a credential that unlocks the athlete's entire
 * health history and location, it breaks on any account with two-factor
 * authentication, and it depends on endpoints Garmin never promised to keep.
 *
 * The Activity API is the supported route: the athlete approves on Garmin's
 * own site, the application receives a revocable token, and Garmin pushes each
 * activity to a webhook within seconds of the watch syncing. No polling, no
 * password.
 *
 * Access is granted per application through the Garmin Connect Developer
 * Program, so this client is useful only once Garmin has issued credentials.
 * Until then {@link GarminActivityApiClient.isConfigured} is false and nothing
 * here will pretend otherwise.
 *
 * @module cloud/garmin-activity-api
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Endpoints from Garmin's OAuth 2.0 PKCE specification. */
export const GARMIN_ENDPOINTS = {
  authorize: 'https://connect.garmin.com/oauth2Confirm',
  token: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
  userId: 'https://apis.garmin.com/wellness-api/rest/user/id',
  permissions: 'https://apis.garmin.com/wellness-api/rest/user/permissions',
  registration: 'https://apis.garmin.com/wellness-api/rest/user/registration',
  backfillActivities: 'https://apis.garmin.com/wellness-api/rest/backfill/activities',
} as const

export interface GarminActivityApiConfig {
  clientId: string
  clientSecret: string
  /** Must match a redirect URI registered with Garmin exactly. */
  redirectUri: string
  /** Defaults to activity export, which is read-only. */
  scope?: string
  /** Override for testing against Garmin's evaluation environment. */
  endpoints?: Partial<typeof GARMIN_ENDPOINTS>
  /** Injected in tests. Defaults to global fetch. */
  fetch?: typeof globalThis.fetch
}

export interface GarminTokens {
  accessToken: string
  refreshToken?: string
  /** Unix seconds. Absolute, so it survives being stored and reloaded. */
  expiresAt?: number
  scope?: string
}

/** A PKCE verifier and the challenge derived from it. */
export interface PkcePair {
  verifier: string
  challenge: string
}

/**
 * An activity summary as the Activity API pushes it.
 *
 * Field names are Garmin's. Everything except `summaryId` is optional, because
 * a summary reflects what the device recorded: a treadmill run carries no GPS,
 * a manually entered activity carries almost nothing.
 */
export interface GarminActivitySummary {
  /** Stable across redeliveries of the same activity. The idempotency key. */
  summaryId: string
  activityId?: number
  /** Garmin's opaque athlete id, and the only link from a push to an account. */
  userId?: string
  userAccessToken?: string
  activityType?: string
  activityName?: string
  startTimeInSeconds?: number
  startTimeOffsetInSeconds?: number
  durationInSeconds?: number
  distanceInMeters?: number
  activeKilocalories?: number
  averageHeartRateInBeatsPerMinute?: number
  maxHeartRateInBeatsPerMinute?: number
  averageSpeedInMetersPerSecond?: number
  maxSpeedInMetersPerSecond?: number
  averageRunCadenceInStepsPerMinute?: number
  averageBikeCadenceInRoundsPerMinute?: number
  averagePaceInMinutesPerKilometer?: number
  totalElevationGainInMeters?: number
  totalElevationLossInMeters?: number
  startingLatitudeInDegree?: number
  startingLongitudeInDegree?: number
  steps?: number
  deviceName?: string
  manual?: boolean
  /** A multisport parent; its children arrive as their own summaries. */
  isParent?: boolean
  parentSummaryId?: string
  isWebUpload?: boolean
}

/** Garmin tells an application when an athlete revokes it. */
export interface GarminDeregistration {
  userId: string
  userAccessToken?: string
}

/**
 * Create a PKCE verifier and its S256 challenge.
 *
 * Only the challenge travels to Garmin. Because the authorization code comes
 * back through the athlete's browser, someone able to read it there still
 * cannot redeem it without the verifier, which never left the server.
 */
export function createPkcePair(): PkcePair {
  // 64 bytes as base64url is 86 characters, inside RFC 7636's 43-128 range.
  const verifier = randomBytes(64).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/**
 * Read activity summaries out of a push payload.
 *
 * Garmin posts `{ activities: [...] }`, and has historically also posted a
 * bare array. Accepting both costs nothing and avoids dropping a batch over a
 * shape the caller did not anticipate. Entries without a `summaryId` are
 * dropped, since without it a redelivery cannot be recognised.
 */
export function extractActivitySummaries(body: unknown): GarminActivitySummary[] {
  const candidates: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as any)?.activities)
      ? (body as any).activities
      : Array.isArray((body as any)?.activityDetails)
        ? (body as any).activityDetails
        : []

  return candidates.filter(
    (entry): entry is GarminActivitySummary =>
      Boolean(entry) && typeof (entry as any).summaryId === 'string',
  )
}

/** Read deregistration notices out of a payload. */
export function extractDeregistrations(body: unknown): GarminDeregistration[] {
  const candidates: unknown[] = Array.isArray((body as any)?.deregistrations)
    ? (body as any).deregistrations
    : []

  return candidates.filter(
    (entry): entry is GarminDeregistration =>
      Boolean(entry) && typeof (entry as any).userId === 'string',
  )
}

/**
 * Compare a presented webhook secret against the expected one.
 *
 * Constant-time: a byte-by-byte comparison leaks how much of a guess was
 * correct, which is enough to construct the rest. Returns false when no secret
 * is configured, so an endpoint that forgot to set one rejects everything
 * rather than accepting everything.
 */
export function isAuthenticWebhook(presented: string | null | undefined, secret: string): boolean {
  if (!secret || !presented)
    return false
  const given = Buffer.from(presented)
  const want = Buffer.from(secret)
  return given.length === want.length && timingSafeEqual(given, want)
}

/**
 * Sign a value so it can be handed to a browser and trusted on return.
 *
 * The OAuth callback is a top-level navigation carrying no session, so the
 * application has to stash who was connecting somewhere the browser holds.
 * Signing is what stops someone editing that stash to attach their watch to
 * another person's account.
 */
export function signState(payload: string, secret: string): string {
  const encoded = Buffer.from(payload).toString('base64url')
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

/** Verify and decode a value produced by {@link signState}, or null if it was altered. */
export function verifyState(token: string | undefined, secret: string): string | null {
  if (!token || !secret)
    return null

  const separator = token.lastIndexOf('.')
  if (separator === -1)
    return null

  const encoded = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url')

  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want))
    return null

  try {
    return Buffer.from(encoded, 'base64url').toString('utf8')
  }
  catch {
    return null
  }
}

/**
 * A client for the official Garmin Activity API.
 *
 * Holds no state beyond its configuration: tokens are passed in and returned,
 * so the caller decides where they live. That keeps the client usable from a
 * request handler, a job, or a test without assuming a database.
 */
export class GarminActivityApiClient {
  private readonly config: Required<Omit<GarminActivityApiConfig, 'endpoints' | 'fetch'>>
  private readonly endpoints: typeof GARMIN_ENDPOINTS
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(config: GarminActivityApiConfig) {
    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      scope: config.scope ?? 'ACTIVITY_EXPORT',
    }
    this.endpoints = { ...GARMIN_ENDPOINTS, ...config.endpoints }
    this.fetchImpl = config.fetch ?? globalThis.fetch
  }

  /**
   * Whether Garmin has issued credentials for this application.
   *
   * Worth checking before starting a flow, so an athlete sees "not available
   * yet" instead of a Garmin error page about an unknown client id.
   */
  get isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret)
  }

  /** Build the URL the athlete visits to approve the connection. */
  buildAuthorizationUrl(options: { state: string, challenge: string, scope?: string }): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      code_challenge: options.challenge,
      code_challenge_method: 'S256',
      state: options.state,
      scope: options.scope ?? this.config.scope,
    })

    return `${this.endpoints.authorize}?${params.toString()}`
  }

  /** Redeem an authorization code, together with the verifier that proves it is ours. */
  async exchangeCode(code: string, verifier: string): Promise<GarminTokens> {
    const response = await this.fetchImpl(this.endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        code_verifier: verifier,
        redirect_uri: this.config.redirectUri,
      }),
    })

    return this.readTokens(response, 'exchange the authorization code')
  }

  /** Trade a refresh token for a fresh access token. */
  async refreshTokens(refreshToken: string): Promise<GarminTokens> {
    const response = await this.fetchImpl(this.endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      }),
    })

    return this.readTokens(response, 'refresh the access token')
  }

  /**
   * Garmin's opaque id for the athlete.
   *
   * This is the join key every push notification carries, so it has to be
   * stored at connection time; a webhook that arrives later has no other way
   * to say who it belongs to.
   */
  async getUserId(accessToken: string): Promise<string> {
    const response = await this.fetchImpl(this.endpoints.userId, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })

    if (!response.ok)
      throw new Error(`Garmin: could not resolve the user id (HTTP ${response.status})`)

    const body = await response.json() as { userId?: string }
    if (!body?.userId)
      throw new Error('Garmin: user id response contained no userId')

    return body.userId
  }

  /** What the athlete actually granted, which can be narrower than what was asked. */
  async getPermissions(accessToken: string): Promise<string[]> {
    const response = await this.fetchImpl(this.endpoints.permissions, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })

    if (!response.ok)
      throw new Error(`Garmin: could not read permissions (HTTP ${response.status})`)

    const body = await response.json() as { permissions?: string[] } | string[]
    return Array.isArray(body) ? body : (body?.permissions ?? [])
  }

  /**
   * End the connection on Garmin's side.
   *
   * Deleting a local record is not enough: without this Garmin keeps pushing
   * activities for an athlete who believes they have disconnected.
   */
  async deregister(accessToken: string): Promise<void> {
    const response = await this.fetchImpl(this.endpoints.registration, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok && response.status !== 404)
      throw new Error(`Garmin: deregistration failed (HTTP ${response.status})`)
  }

  /**
   * Ask Garmin to replay history.
   *
   * Answers 202 and then delivers through the same webhook as live activities,
   * which is why webhook handling has to be idempotent before this is called.
   */
  async requestBackfill(accessToken: string, start: Date, end: Date): Promise<void> {
    const params = new URLSearchParams({
      summaryStartTimeInSeconds: String(Math.floor(start.getTime() / 1000)),
      summaryEndTimeInSeconds: String(Math.floor(end.getTime() / 1000)),
    })

    const response = await this.fetchImpl(`${this.endpoints.backfillActivities}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    // 202 Accepted is the success case: the work is queued, not done.
    if (!response.ok && response.status !== 202)
      throw new Error(`Garmin: backfill request failed (HTTP ${response.status})`)
  }

  private async readTokens(response: Response, what: string): Promise<GarminTokens> {
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Garmin: could not ${what} (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`)
    }

    const body = await response.json() as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      scope?: string
    }

    if (!body?.access_token)
      throw new Error(`Garmin: could not ${what}; the response contained no access token`)

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      // Absolute rather than relative, so a stored token can be checked
      // without also knowing when it was issued.
      expiresAt: body.expires_in ? Math.floor(Date.now() / 1000) + body.expires_in : undefined,
      scope: body.scope,
    }
  }
}

/** Is a token past, or nearly past, its expiry? */
export function isTokenExpired(tokens: GarminTokens, skewSeconds = 60, now = Date.now()): boolean {
  if (!tokens.expiresAt)
    return false
  // The skew covers the round trip: a token with two seconds left is expired
  // by the time the request lands.
  return tokens.expiresAt - skewSeconds <= Math.floor(now / 1000)
}

/** An in-flight authorization attempt, as it survives the round trip to Garmin. */
export interface OAuthAttempt<TSubject = string> {
  /** Who is connecting: a user id, an account key, whatever the app keys on. */
  subject: TSubject
  /** Echoed by Garmin and compared on return. The CSRF guard. */
  state: string
  /** Redeems the authorization code. Never leaves the server. */
  verifier: string
  /** Unix milliseconds. A stale attempt is refused rather than resumed. */
  issuedAt: number
}

/** How long an in-flight attempt stays valid, in milliseconds. */
export const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000

/**
 * Seal an in-flight attempt into a token safe to hand to a browser.
 *
 * The callback is a top-level navigation from Garmin carrying no session, so
 * the app has to stash who was connecting somewhere the browser holds - which
 * means the value is under the visitor's control and must be signed. Without a
 * signature someone edits the subject in their own cookie and attaches their
 * watch to another person's account.
 *
 * This is {@link signState} with the shape the flow actually needs: a subject,
 * the state parameter, the PKCE verifier, and an issue time so a stale attempt
 * can be refused instead of silently resumed.
 */
export function sealOAuthAttempt<TSubject>(attempt: OAuthAttempt<TSubject>, secret: string): string {
  return signState(JSON.stringify(attempt), secret)
}

/**
 * Open a sealed attempt, or return null when it was tampered with, malformed,
 * or has expired. Null always means "start again", never "trust it anyway".
 */
export function openOAuthAttempt<TSubject = string>(
  token: string | undefined,
  secret: string,
  options: { now?: number, ttlMs?: number } = {},
): OAuthAttempt<TSubject> | null {
  const payload = verifyState(token, secret)
  if (!payload)
    return null

  try {
    const parsed = JSON.parse(payload) as OAuthAttempt<TSubject>
    if (parsed?.subject === undefined || typeof parsed?.verifier !== 'string' || typeof parsed?.state !== 'string')
      return null

    const now = options.now ?? Date.now()
    const ttl = options.ttlMs ?? OAUTH_ATTEMPT_TTL_MS
    if (!parsed.issuedAt || now - parsed.issuedAt > ttl)
      return null

    return parsed
  }
  catch {
    return null
  }
}
