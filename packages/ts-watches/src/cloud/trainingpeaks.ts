import type { Activity } from '../types'

export interface TrainingPeaksConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  useSandbox?: boolean
}

export interface TrainingPeaksTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  athleteId?: number
}

export interface TrainingPeaksAthlete {
  Id: number
  FirstName?: string
  LastName?: string
  Email?: string
  DateOfBirth?: string
  Gender?: string
  City?: string
  State?: string
  Country?: string
  Weight?: number
  IsCoach?: boolean
  IsPremium?: boolean
}

export interface TrainingPeaksWorkout {
  Id: number
  AthleteId: number
  WorkoutDay: string
  StartTime?: string
  StartTimePlanned?: string
  Title: string
  Description?: string
  CoachComments?: string
  WorkoutType: string
  Completed: boolean
  // Duration/Distance
  TotalTime?: number
  TotalTimePlanned?: number
  Distance?: number
  DistancePlanned?: number
  // Heart Rate
  HeartRateAverage?: number
  HeartRateMinimum?: number
  HeartRateMaximum?: number
  // Power
  PowerAverage?: number
  PowerMaximum?: number
  NormalizedPower?: number
  IntensityFactor?: number
  TssActual?: number
  TssPlanned?: number
  // Cadence
  CadenceAverage?: number
  CadenceMaximum?: number
  // Speed/Pace
  VelocityAverage?: number
  VelocityMaximum?: number
  // Elevation
  ElevationGain?: number
  ElevationLoss?: number
  ElevationAverage?: number
  ElevationMinimum?: number
  ElevationMaximum?: number
  // Energy
  Energy?: number
  Calories?: number
  // Temperature
  TemperatureAverage?: number
  TemperatureMinimum?: number
  TemperatureMaximum?: number
}

export interface TrainingPeaksUploadResponse {
  Id: number
  Status: string
  Message?: string
}

export interface TrainingPeaksMetrics {
  date: string
  weight?: number
  restingHeartRate?: number
  hrv?: number
  sleepHours?: number
  sleepQuality?: number
  stress?: number
  steps?: number
  fatigue?: number
  mood?: number
  motivation?: number
  injury?: number
}

// TrainingPeaks API URLs
const TP_SANDBOX_API = 'https://api.sandbox.trainingpeaks.com'
const TP_PRODUCTION_API = 'https://api.trainingpeaks.com'
const TP_SANDBOX_OAUTH = 'https://oauth.sandbox.trainingpeaks.com'
const TP_PRODUCTION_OAUTH = 'https://oauth.trainingpeaks.com'

export class TrainingPeaksClient {
  private tokens: TrainingPeaksTokens | null = null
  private apiUrl: string
  private oauthUrl: string

  constructor(private config: TrainingPeaksConfig) {
    this.apiUrl = config.useSandbox ? TP_SANDBOX_API : TP_PRODUCTION_API
    this.oauthUrl = config.useSandbox ? TP_SANDBOX_OAUTH : TP_PRODUCTION_OAUTH
  }

  getAuthorizationUrl(scope = 'athlete:profile workouts:read workouts:write metrics:read metrics:write'): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri || 'http://localhost:8080/callback',
      response_type: 'code',
      scope,
    })

    return `${this.oauthUrl}/oauth/authorize?${params.toString()}`
  }

  async exchangeCode(code: string): Promise<TrainingPeaksTokens> {
    const response = await fetch(`${this.oauthUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri || 'http://localhost:8080/callback',
      }).toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to exchange code: ${error}`)
    }

    const data = await response.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
      token_type: string
    }

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    }

    // Fetch athlete profile to get ID
    try {
      const profile = await this.getAthlete()
      this.tokens.athleteId = profile.Id
    } catch {
      // Profile fetch is optional
    }

    return this.tokens
  }

  async refreshTokens(): Promise<TrainingPeaksTokens> {
    if (!this.tokens) {
      throw new Error('No tokens to refresh. Call exchangeCode() first.')
    }

    const response = await fetch(`${this.oauthUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.tokens.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh tokens: ${error}`)
    }

    const data = await response.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    this.tokens = {
      ...this.tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    }

    return this.tokens
  }

  setTokens(tokens: TrainingPeaksTokens): void {
    this.tokens = tokens
  }

  getTokens(): TrainingPeaksTokens | null {
    return this.tokens
  }

  async getAthlete(): Promise<TrainingPeaksAthlete> {
    await this.ensureValidToken()

    const response = await fetch(`${this.apiUrl}/v1/athlete/profile`, {
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch athlete: ${response.status}`)
    }

    return await response.json() as TrainingPeaksAthlete
  }

  async getWorkouts(startDate: Date, endDate: Date): Promise<TrainingPeaksWorkout[]> {
    await this.ensureValidToken()

    const start = this.formatDate(startDate)
    const end = this.formatDate(endDate)

    const response = await fetch(`${this.apiUrl}/v1/workouts/${start}/${end}`, {
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch workouts: ${response.status}`)
    }

    return await response.json() as TrainingPeaksWorkout[]
  }

  async getWorkout(workoutId: number): Promise<Activity> {
    await this.ensureValidToken()

    const response = await fetch(`${this.apiUrl}/v1/workouts/${workoutId}`, {
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch workout: ${response.status}`)
    }

    const data = await response.json() as TrainingPeaksWorkout
    return this.parseTPWorkout(data)
  }

  async uploadActivity(
    file: ArrayBuffer,
    fileName: string,
    options: {
      setPublic?: boolean
    } = {}
  ): Promise<TrainingPeaksUploadResponse> {
    await this.ensureValidToken()

    // Compress and base64 encode the file
    const compressed = await this.gzipEncode(file)
    const base64Data = this.arrayBufferToBase64(compressed)

    const response = await fetch(`${this.apiUrl}/v3/file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        UploadClient: 'ts-watches',
        Filename: fileName,
        SetWorkoutPublic: options.setPublic || false,
        Data: base64Data,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to upload activity: ${error}`)
    }

    return await response.json() as TrainingPeaksUploadResponse
  }

  async uploadMetrics(metrics: TrainingPeaksMetrics): Promise<void> {
    await this.ensureValidToken()

    const payload: Record<string, unknown> = {
      WorkoutDay: metrics.date,
    }

    if (metrics.weight !== undefined) payload.WeightKg = metrics.weight
    if (metrics.restingHeartRate !== undefined) payload.RestingHeartRate = metrics.restingHeartRate
    if (metrics.hrv !== undefined) payload.HrvRmssd = metrics.hrv
    if (metrics.sleepHours !== undefined) payload.SleepHours = metrics.sleepHours
    if (metrics.sleepQuality !== undefined) payload.SleepQuality = metrics.sleepQuality
    if (metrics.stress !== undefined) payload.Stress = metrics.stress
    if (metrics.steps !== undefined) payload.Steps = metrics.steps
    if (metrics.fatigue !== undefined) payload.Fatigue = metrics.fatigue
    if (metrics.mood !== undefined) payload.Mood = metrics.mood
    if (metrics.motivation !== undefined) payload.Motivation = metrics.motivation
    if (metrics.injury !== undefined) payload.Injury = metrics.injury

    const response = await fetch(`${this.apiUrl}/v1/metrics`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to upload metrics: ${error}`)
    }
  }

  async deleteWorkout(workoutId: number): Promise<void> {
    await this.ensureValidToken()

    const response = await fetch(`${this.apiUrl}/v1/workouts/${workoutId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to delete workout: ${response.status}`)
    }
  }

  async updateWorkout(
    workoutId: number,
    updates: Partial<{
      Title: string
      Description: string
      CoachComments: string
      WorkoutType: string
    }>
  ): Promise<TrainingPeaksWorkout> {
    await this.ensureValidToken()

    const response = await fetch(`${this.apiUrl}/v1/workouts/${workoutId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      throw new Error(`Failed to update workout: ${response.status}`)
    }

    return await response.json() as TrainingPeaksWorkout
  }

  private parseTPWorkout(data: TrainingPeaksWorkout): Activity {
    const startTime = data.StartTime ? new Date(data.StartTime) : new Date(data.WorkoutDay)
    const duration = data.TotalTime || 0

    return {
      id: `trainingpeaks_${data.Id}`,
      name: data.Title,
      sport: this.mapTPType(data.WorkoutType),
      startTime,
      endTime: new Date(startTime.getTime() + duration * 1000),
      totalElapsedTime: duration,
      totalTimerTime: duration,
      totalDistance: data.Distance || 0,
      totalCalories: data.Calories || data.Energy || 0,
      avgHeartRate: data.HeartRateAverage,
      maxHeartRate: data.HeartRateMaximum,
      avgSpeed: data.VelocityAverage,
      maxSpeed: data.VelocityMaximum,
      avgCadence: data.CadenceAverage,
      maxCadence: data.CadenceMaximum,
      avgPower: data.PowerAverage,
      maxPower: data.PowerMaximum,
      normalizedPower: data.NormalizedPower,
      totalAscent: data.ElevationGain,
      totalDescent: data.ElevationLoss,
      trainingStressScore: data.TssActual,
      intensityFactor: data.IntensityFactor,
      laps: [],
      records: [],
      source: 'garmin', // Default source, could be extended
    }
  }

  private mapTPType(type: string): Activity['sport'] {
    const typeMap: Record<string, Activity['sport']> = {
      Bike: 'cycling',
      Run: 'running',
      Walk: 'walking',
      Swim: 'swimming',
      MTB: 'cycling',
      'XC-Ski': 'other',
      Rowing: 'other',
      'X-Train': 'cardio',
      Strength: 'strength_training',
      Hike: 'hiking',
      Yoga: 'yoga',
      Other: 'other',
    }
    return typeMap[type] || 'other'
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
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

  private async gzipEncode(data: ArrayBuffer): Promise<ArrayBuffer> {
    // Use CompressionStream API for gzip compression
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(data))
        controller.close()
      },
    })

    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'))
    const reader = compressedStream.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return result.buffer
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }
}

export function createTrainingPeaksClient(config: TrainingPeaksConfig): TrainingPeaksClient {
  return new TrainingPeaksClient(config)
}

// Helper to sync Garmin data to TrainingPeaks
export async function syncGarminMetricsToTP(
  tpClient: TrainingPeaksClient,
  garminData: {
    date: Date
    weight?: number
    restingHeartRate?: number
    hrv?: number
    sleepHours?: number
    stress?: number
    steps?: number
  }
): Promise<void> {
  const metrics: TrainingPeaksMetrics = {
    date: garminData.date.toISOString().split('T')[0],
    weight: garminData.weight,
    restingHeartRate: garminData.restingHeartRate,
    hrv: garminData.hrv,
    sleepHours: garminData.sleepHours,
    stress: garminData.stress,
    steps: garminData.steps,
  }

  await tpClient.uploadMetrics(metrics)
}
