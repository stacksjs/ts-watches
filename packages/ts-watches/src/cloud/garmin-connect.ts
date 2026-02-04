import type { Activity, MonitoringData, SleepData, StressData, BodyBattery, HRVData } from '../types'

export interface GarminConnectConfig {
  email: string
  password: string
}

export interface GarminConnectSession {
  oauth1Token: string
  oauth1TokenSecret: string
  oauth2Token: string
  oauth2RefreshToken: string
  displayName: string
  userId: string
}

export interface GarminActivitySummary {
  activityId: number
  activityName: string
  activityType: { typeKey: string }
  startTimeLocal: string
  startTimeGMT: string
  duration: number
  distance: number
  calories: number
  averageHR?: number
  maxHR?: number
  averageSpeed?: number
  maxSpeed?: number
  elevationGain?: number
  elevationLoss?: number
}

const GARMIN_SSO_URL = 'https://sso.garmin.com/sso'
const GARMIN_CONNECT_URL = 'https://connect.garmin.com'
const GARMIN_API_URL = 'https://connect.garmin.com/modern/proxy'

export class GarminConnectClient {
  private session: GarminConnectSession | null = null
  private cookies: Map<string, string> = new Map()

  constructor(private config?: GarminConnectConfig) {}

  async login(email?: string, password?: string): Promise<GarminConnectSession> {
    const loginEmail = email || this.config?.email
    const loginPassword = password || this.config?.password

    if (!loginEmail || !loginPassword) {
      throw new Error('Email and password are required')
    }

    // Step 1: Get login page and CSRF token
    const loginPageResponse = await fetch(`${GARMIN_SSO_URL}/signin`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    })

    this.extractCookies(loginPageResponse)
    const loginPageHtml = await loginPageResponse.text()
    const csrfToken = this.extractCsrfToken(loginPageHtml)

    // Step 2: Submit login form
    const loginResponse = await fetch(`${GARMIN_SSO_URL}/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Cookie': this.getCookieHeader(),
      },
      body: new URLSearchParams({
        username: loginEmail,
        password: loginPassword,
        embed: 'false',
        _csrf: csrfToken,
      }),
      redirect: 'manual',
    })

    this.extractCookies(loginResponse)

    // Step 3: Follow redirects and get OAuth tokens
    const ticketUrl = loginResponse.headers.get('location')
    if (!ticketUrl) {
      throw new Error('Login failed - no redirect received')
    }

    const ticketResponse = await fetch(ticketUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Cookie': this.getCookieHeader(),
      },
      redirect: 'manual',
    })

    this.extractCookies(ticketResponse)

    // Step 4: Get user profile
    const profileResponse = await fetch(`${GARMIN_CONNECT_URL}/modern/currentuser-service/user/info`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Cookie': this.getCookieHeader(),
      },
    })

    const profile = await profileResponse.json() as { displayName: string; profileId: string }

    this.session = {
      oauth1Token: this.cookies.get('oauth1_token') || '',
      oauth1TokenSecret: this.cookies.get('oauth1_token_secret') || '',
      oauth2Token: this.cookies.get('oauth2_token') || '',
      oauth2RefreshToken: this.cookies.get('oauth2_refresh_token') || '',
      displayName: profile.displayName,
      userId: profile.profileId,
    }

    return this.session
  }

  async getActivities(start = 0, limit = 20): Promise<GarminActivitySummary[]> {
    this.ensureSession()

    const response = await fetch(
      `${GARMIN_API_URL}/activitylist-service/activities/search/activities?start=${start}&limit=${limit}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch activities: ${response.status}`)
    }

    return await response.json() as GarminActivitySummary[]
  }

  async getActivity(activityId: number): Promise<Activity> {
    this.ensureSession()

    const response = await fetch(
      `${GARMIN_API_URL}/activity-service/activity/${activityId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch activity: ${response.status}`)
    }

    const data = await response.json()
    return this.parseActivityResponse(data)
  }

  async downloadActivityFit(activityId: number): Promise<ArrayBuffer> {
    this.ensureSession()

    const response = await fetch(
      `${GARMIN_API_URL}/download-service/files/activity/${activityId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to download FIT file: ${response.status}`)
    }

    return await response.arrayBuffer()
  }

  async uploadActivity(fitData: ArrayBuffer, fileName?: string): Promise<{ activityId: number }> {
    this.ensureSession()

    const formData = new FormData()
    const blob = new Blob([fitData], { type: 'application/octet-stream' })
    formData.append('file', blob, fileName || 'activity.fit')

    const response = await fetch(
      `${GARMIN_API_URL}/upload-service/upload/.fit`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
        body: formData,
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to upload activity: ${response.status}`)
    }

    const result = await response.json() as { detailedImportResult: { successes: Array<{ internalId: number }> } }
    return { activityId: result.detailedImportResult.successes[0].internalId }
  }

  async getDailySummary(date: Date): Promise<MonitoringData> {
    this.ensureSession()

    const dateStr = date.toISOString().slice(0, 10)

    const [heartRate, sleep, stress, bodyBattery, hrv] = await Promise.all([
      this.getHeartRateData(dateStr),
      this.getSleepData(dateStr),
      this.getStressData(dateStr),
      this.getBodyBatteryData(dateStr),
      this.getHrvData(dateStr),
    ])

    return {
      heartRate,
      sleep,
      stress,
      bodyBattery,
      hrv,
    }
  }

  async getHeartRateData(date: string): Promise<MonitoringData['heartRate']> {
    const response = await fetch(
      `${GARMIN_API_URL}/wellness-service/wellness/dailyHeartRate/${date}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
      }
    )

    if (!response.ok) return undefined

    const data = await response.json() as {
      restingHeartRate?: number
      minHeartRate?: number
      maxHeartRate?: number
      heartRateValues?: Array<[number, number]>
    }

    const samples = (data.heartRateValues || [])
      .filter(([_, hr]) => hr > 0)
      .map(([ts, hr]) => ({
        timestamp: new Date(ts),
        heartRate: hr,
      }))

    return {
      date: new Date(date),
      restingHeartRate: data.restingHeartRate,
      minHeartRate: data.minHeartRate,
      maxHeartRate: data.maxHeartRate,
      avgHeartRate: samples.length > 0
        ? Math.round(samples.reduce((sum, s) => sum + s.heartRate, 0) / samples.length)
        : undefined,
      samples,
    }
  }

  async getSleepData(date: string): Promise<SleepData | undefined> {
    const response = await fetch(
      `${GARMIN_API_URL}/wellness-service/wellness/dailySleepData/${date}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
      }
    )

    if (!response.ok) return undefined

    const data = await response.json() as {
      dailySleepDTO?: {
        sleepStartTimestampGMT: number
        sleepEndTimestampGMT: number
        sleepTimeSeconds: number
        deepSleepSeconds: number
        lightSleepSeconds: number
        remSleepSeconds: number
        awakeSleepSeconds: number
        sleepScores?: { overall?: { value: number } }
        avgOvernightHrv?: number
        averageSpO2Value?: number
        averageRespirationValue?: number
      }
      sleepLevels?: Array<{
        startGMT: number
        endGMT: number
        activityLevel: number
      }>
    }

    if (!data.dailySleepDTO) return undefined

    const dto = data.dailySleepDTO
    const stages = (data.sleepLevels || []).map(level => ({
      stage: this.mapSleepLevel(level.activityLevel),
      startTime: new Date(level.startGMT),
      endTime: new Date(level.endGMT),
    }))

    return {
      date: new Date(date),
      startTime: new Date(dto.sleepStartTimestampGMT),
      endTime: new Date(dto.sleepEndTimestampGMT),
      totalSleepTime: dto.sleepTimeSeconds / 60,
      deepSleepTime: dto.deepSleepSeconds / 60,
      lightSleepTime: dto.lightSleepSeconds / 60,
      remSleepTime: dto.remSleepSeconds / 60,
      awakeTime: dto.awakeSleepSeconds / 60,
      sleepScore: dto.sleepScores?.overall?.value,
      stages,
      avgHeartRate: undefined,
      avgSpO2: dto.averageSpO2Value,
      avgRespirationRate: dto.averageRespirationValue,
    }
  }

  async getStressData(date: string): Promise<StressData | undefined> {
    const response = await fetch(
      `${GARMIN_API_URL}/wellness-service/wellness/dailyStress/${date}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
      }
    )

    if (!response.ok) return undefined

    const data = await response.json() as {
      overallStressLevel?: number
      maxStressLevel?: number
      restStressDuration?: number
      lowStressDuration?: number
      mediumStressDuration?: number
      highStressDuration?: number
      stressValuesArray?: Array<[number, number]>
    }

    const samples = (data.stressValuesArray || [])
      .filter(([_, level]) => level >= 0)
      .map(([ts, level]) => ({
        timestamp: new Date(ts),
        stressLevel: level,
      }))

    return {
      date: new Date(date),
      avgStressLevel: data.overallStressLevel || 0,
      maxStressLevel: data.maxStressLevel || 0,
      restStressDuration: (data.restStressDuration || 0) / 60,
      lowStressDuration: (data.lowStressDuration || 0) / 60,
      mediumStressDuration: (data.mediumStressDuration || 0) / 60,
      highStressDuration: (data.highStressDuration || 0) / 60,
      samples,
    }
  }

  async getBodyBatteryData(date: string): Promise<BodyBattery | undefined> {
    const response = await fetch(
      `${GARMIN_API_URL}/wellness-service/wellness/bodyBattery/date/${date}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
      }
    )

    if (!response.ok) return undefined

    const data = await response.json() as Array<{
      startTimestampGMT: number
      startTimestampLocal: number
      charged: number
      drained: number
      bodyBatteryValuesArray?: Array<[number, number]>
    }>

    if (!data || data.length === 0) return undefined

    const dayData = data[0]
    const samples = (dayData.bodyBatteryValuesArray || [])
      .filter(([_, level]) => level >= 0)
      .map(([ts, level]) => ({
        timestamp: new Date(ts),
        level,
      }))

    return {
      date: new Date(date),
      startLevel: samples[0]?.level || 0,
      endLevel: samples[samples.length - 1]?.level || 0,
      chargedValue: dayData.charged,
      drainedValue: dayData.drained,
      samples,
    }
  }

  async getHrvData(date: string): Promise<HRVData | undefined> {
    const response = await fetch(
      `${GARMIN_API_URL}/hrv-service/hrv/${date}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Cookie': this.getCookieHeader(),
          'NK': 'NT',
        },
      }
    )

    if (!response.ok) return undefined

    const data = await response.json() as {
      hrvSummary?: {
        weeklyAvg?: number
        lastNightAvg?: number
        lastNight5MinHigh?: number
        baseline?: { lowUpper: number; balancedLow: number; balancedUpper: number }
        status?: string
      }
      hrvValues?: Array<{ hrvValue: number; readingTimeGMT: number }>
    }

    if (!data.hrvSummary) return undefined

    const samples = (data.hrvValues || []).map(v => ({
      timestamp: new Date(v.readingTimeGMT),
      hrv: v.hrvValue,
    }))

    return {
      date: new Date(date),
      weeklyAverage: data.hrvSummary.weeklyAvg,
      lastNightAverage: data.hrvSummary.lastNightAvg,
      status: data.hrvSummary.status as HRVData['status'],
      baseline: data.hrvSummary.baseline?.balancedLow,
      samples,
    }
  }

  private mapSleepLevel(level: number): 'awake' | 'light' | 'deep' | 'rem' {
    switch (level) {
      case 0: return 'deep'
      case 1: return 'light'
      case 2: return 'rem'
      case 3: return 'awake'
      default: return 'light'
    }
  }

  private parseActivityResponse(data: any): Activity {
    return {
      id: `garmin_${data.activityId}`,
      name: data.activityName,
      sport: this.mapActivityType(data.activityType?.typeKey),
      startTime: new Date(data.startTimeGMT),
      endTime: new Date(new Date(data.startTimeGMT).getTime() + data.duration * 1000),
      totalElapsedTime: data.elapsedDuration || data.duration,
      totalTimerTime: data.duration,
      totalDistance: data.distance || 0,
      totalCalories: data.calories || 0,
      avgHeartRate: data.averageHR,
      maxHeartRate: data.maxHR,
      avgSpeed: data.averageSpeed,
      maxSpeed: data.maxSpeed,
      avgCadence: data.averageRunningCadenceInStepsPerMinute || data.averageBikingCadenceInRevPerMinute,
      maxCadence: data.maxRunningCadenceInStepsPerMinute || data.maxBikingCadenceInRevPerMinute,
      avgPower: data.avgPower,
      maxPower: data.maxPower,
      normalizedPower: data.normPower,
      totalAscent: data.elevationGain,
      totalDescent: data.elevationLoss,
      trainingStressScore: data.trainingStressScore,
      intensityFactor: data.intensityFactor,
      laps: [],
      records: [],
      source: 'garmin',
    }
  }

  private mapActivityType(typeKey: string): Activity['sport'] {
    const typeMap: Record<string, Activity['sport']> = {
      running: 'running',
      cycling: 'cycling',
      swimming: 'swimming',
      hiking: 'hiking',
      walking: 'walking',
      strength_training: 'strength_training',
      cardio: 'cardio',
      yoga: 'yoga',
    }
    return typeMap[typeKey] || 'other'
  }

  private extractCookies(response: Response): void {
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) {
      const cookies = setCookie.split(',').flatMap(c => c.split(';')[0].trim().split('='))
      for (let i = 0; i < cookies.length; i += 2) {
        if (cookies[i] && cookies[i + 1]) {
          this.cookies.set(cookies[i], cookies[i + 1])
        }
      }
    }
  }

  private extractCsrfToken(html: string): string {
    const match = html.match(/name="_csrf"\s+value="([^"]+)"/)
    return match ? match[1] : ''
  }

  private getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
  }

  private ensureSession(): void {
    if (!this.cookies.size) {
      throw new Error('Not logged in. Call login() first.')
    }
  }
}

export function createGarminConnectClient(config?: GarminConnectConfig): GarminConnectClient {
  return new GarminConnectClient(config)
}
