import type { Activity } from '../types'

export interface StravaConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export interface StravaTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  athleteId: number
}

export interface StravaAthlete {
  id: number
  username: string
  firstname: string
  lastname: string
  city: string
  country: string
  profile: string
  profileMedium: string
}

export interface StravaActivitySummary {
  id: number
  name: string
  type: string
  sport_type: string
  start_date: string
  start_date_local: string
  elapsed_time: number
  moving_time: number
  distance: number
  total_elevation_gain: number
  average_speed: number
  max_speed: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  average_watts?: number
  weighted_average_watts?: number
  kilojoules?: number
  calories?: number
}

export interface StravaUploadResponse {
  id: number
  id_str: string
  external_id: string
  error: string | null
  status: string
  activity_id: number | null
}

const STRAVA_API_URL = 'https://www.strava.com/api/v3'
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth'

export class StravaClient {
  private tokens: StravaTokens | null = null

  constructor(private config: StravaConfig) {}

  getAuthorizationUrl(scope = 'read,activity:read_all,activity:write'): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri || 'http://localhost:8080/callback',
      response_type: 'code',
      scope,
    })

    return `${STRAVA_AUTH_URL}/authorize?${params.toString()}`
  }

  async exchangeCode(code: string): Promise<StravaTokens> {
    const response = await fetch(`${STRAVA_AUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to exchange code: ${error}`)
    }

    const data = await response.json() as {
      access_token: string
      refresh_token: string
      expires_at: number
      athlete: { id: number }
    }

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athleteId: data.athlete.id,
    }

    return this.tokens
  }

  async refreshTokens(): Promise<StravaTokens> {
    if (!this.tokens) {
      throw new Error('No tokens to refresh. Call exchangeCode() first.')
    }

    const response = await fetch(`${STRAVA_AUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.tokens.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh tokens: ${error}`)
    }

    const data = await response.json() as {
      access_token: string
      refresh_token: string
      expires_at: number
    }

    this.tokens = {
      ...this.tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
    }

    return this.tokens
  }

  setTokens(tokens: StravaTokens): void {
    this.tokens = tokens
  }

  async getAthlete(): Promise<StravaAthlete> {
    await this.ensureValidToken()

    const response = await fetch(`${STRAVA_API_URL}/athlete`, {
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch athlete: ${response.status}`)
    }

    return await response.json() as StravaAthlete
  }

  async getActivities(page = 1, perPage = 30, before?: Date, after?: Date): Promise<StravaActivitySummary[]> {
    await this.ensureValidToken()

    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    })

    if (before) {
      params.set('before', Math.floor(before.getTime() / 1000).toString())
    }
    if (after) {
      params.set('after', Math.floor(after.getTime() / 1000).toString())
    }

    const response = await fetch(`${STRAVA_API_URL}/athlete/activities?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch activities: ${response.status}`)
    }

    return await response.json() as StravaActivitySummary[]
  }

  async getActivity(activityId: number, includeAllEfforts = false): Promise<Activity> {
    await this.ensureValidToken()

    const response = await fetch(
      `${STRAVA_API_URL}/activities/${activityId}?include_all_efforts=${includeAllEfforts}`,
      {
        headers: {
          Authorization: `Bearer ${this.tokens!.accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch activity: ${response.status}`)
    }

    const data = await response.json()
    return this.parseStravaActivity(data)
  }

  async uploadActivity(
    file: ArrayBuffer,
    fileName: string,
    options: {
      name?: string
      description?: string
      type?: string
      private?: boolean
      externalId?: string
    } = {}
  ): Promise<StravaUploadResponse> {
    await this.ensureValidToken()

    const formData = new FormData()
    const blob = new Blob([file], { type: 'application/octet-stream' })
    formData.append('file', blob, fileName)

    if (options.name) formData.append('name', options.name)
    if (options.description) formData.append('description', options.description)
    if (options.type) formData.append('activity_type', options.type)
    if (options.private) formData.append('private', '1')
    if (options.externalId) formData.append('external_id', options.externalId)

    // Determine data type from file extension
    const ext = fileName.split('.').pop()?.toLowerCase()
    const dataType = ext === 'fit' ? 'fit' : ext === 'tcx' ? 'tcx' : ext === 'gpx' ? 'gpx' : 'fit'
    formData.append('data_type', dataType)

    const response = await fetch(`${STRAVA_API_URL}/uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to upload activity: ${error}`)
    }

    return await response.json() as StravaUploadResponse
  }

  async checkUploadStatus(uploadId: number): Promise<StravaUploadResponse> {
    await this.ensureValidToken()

    const response = await fetch(`${STRAVA_API_URL}/uploads/${uploadId}`, {
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to check upload status: ${response.status}`)
    }

    return await response.json() as StravaUploadResponse
  }

  async waitForUpload(uploadId: number, maxAttempts = 10, delayMs = 2000): Promise<StravaUploadResponse> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.checkUploadStatus(uploadId)

      if (status.activity_id) {
        return status
      }

      if (status.error) {
        throw new Error(`Upload failed: ${status.error}`)
      }

      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    throw new Error('Upload timed out')
  }

  async updateActivity(
    activityId: number,
    updates: {
      name?: string
      type?: string
      description?: string
      private?: boolean
      commute?: boolean
      trainer?: boolean
      gearId?: string
    }
  ): Promise<Activity> {
    await this.ensureValidToken()

    const body: Record<string, unknown> = {}
    if (updates.name) body.name = updates.name
    if (updates.type) body.sport_type = updates.type
    if (updates.description) body.description = updates.description
    if (updates.private !== undefined) body.hide_from_home = updates.private
    if (updates.commute !== undefined) body.commute = updates.commute
    if (updates.trainer !== undefined) body.trainer = updates.trainer
    if (updates.gearId) body.gear_id = updates.gearId

    const response = await fetch(`${STRAVA_API_URL}/activities/${activityId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Failed to update activity: ${response.status}`)
    }

    const data = await response.json()
    return this.parseStravaActivity(data)
  }

  async deleteActivity(activityId: number): Promise<void> {
    await this.ensureValidToken()

    const response = await fetch(`${STRAVA_API_URL}/activities/${activityId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to delete activity: ${response.status}`)
    }
  }

  async getActivityStreams(
    activityId: number,
    streams: string[] = ['time', 'distance', 'latlng', 'altitude', 'heartrate', 'cadence', 'watts', 'temp']
  ): Promise<Map<string, number[]>> {
    await this.ensureValidToken()

    const response = await fetch(
      `${STRAVA_API_URL}/activities/${activityId}/streams?keys=${streams.join(',')}&key_by_type=true`,
      {
        headers: {
          Authorization: `Bearer ${this.tokens!.accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch activity streams: ${response.status}`)
    }

    const data = await response.json() as Record<string, { data: number[] }>
    const result = new Map<string, number[]>()

    for (const [key, value] of Object.entries(data)) {
      result.set(key, value.data)
    }

    return result
  }

  private parseStravaActivity(data: any): Activity {
    return {
      id: `strava_${data.id}`,
      name: data.name,
      sport: this.mapStravaType(data.sport_type || data.type),
      startTime: new Date(data.start_date),
      endTime: new Date(new Date(data.start_date).getTime() + data.elapsed_time * 1000),
      totalElapsedTime: data.elapsed_time,
      totalTimerTime: data.moving_time,
      totalDistance: data.distance,
      totalCalories: data.calories || data.kilojoules ? Math.round((data.kilojoules || 0) * 0.239) : 0,
      avgHeartRate: data.average_heartrate,
      maxHeartRate: data.max_heartrate,
      avgSpeed: data.average_speed,
      maxSpeed: data.max_speed,
      avgCadence: data.average_cadence,
      avgPower: data.average_watts,
      maxPower: data.max_watts,
      normalizedPower: data.weighted_average_watts,
      totalAscent: data.total_elevation_gain,
      totalDescent: data.total_elevation_loss,
      laps: [],
      records: [],
      source: 'garmin',
    }
  }

  private mapStravaType(type: string): Activity['sport'] {
    const typeMap: Record<string, Activity['sport']> = {
      Run: 'running',
      TrailRun: 'running',
      Ride: 'cycling',
      MountainBikeRide: 'cycling',
      GravelRide: 'cycling',
      VirtualRide: 'cycling',
      Swim: 'swimming',
      Hike: 'hiking',
      Walk: 'walking',
      WeightTraining: 'strength_training',
      Workout: 'cardio',
      Yoga: 'yoga',
    }
    return typeMap[type] || 'other'
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error('Not authenticated. Call exchangeCode() or setTokens() first.')
    }

    // Refresh token if expired (with 5 minute buffer)
    if (Date.now() / 1000 >= this.tokens.expiresAt - 300) {
      await this.refreshTokens()
    }
  }
}

export function createStravaClient(config: StravaConfig): StravaClient {
  return new StravaClient(config)
}

// Helper to convert ts-watches Activity to Strava upload
export function activityToStravaUpload(activity: Activity): {
  name: string
  type: string
  description: string
} {
  const sportMap: Record<string, string> = {
    running: 'Run',
    cycling: 'Ride',
    swimming: 'Swim',
    hiking: 'Hike',
    walking: 'Walk',
    strength_training: 'WeightTraining',
    cardio: 'Workout',
    yoga: 'Yoga',
  }

  return {
    name: activity.name || `${activity.sport} - ${activity.startTime.toLocaleDateString()}`,
    type: sportMap[activity.sport] || 'Workout',
    description: `Uploaded via ts-watches`,
  }
}
