import GarminLib from 'garmin-connect'
import type { Activity, SleepData, StressData, BodyBattery, HRVData } from '../types'

const { GarminConnect: GCClient } = GarminLib

export interface GarminConnectConfig {
  username: string
  password: string
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
  averageRunningCadenceInStepsPerMinute?: number
  maxRunningCadenceInStepsPerMinute?: number
  avgPower?: number
  maxPower?: number
  normPower?: number
  trainingStressScore?: number
  intensityFactor?: number
}

export interface DailyHeartRate {
  date: Date
  restingHeartRate?: number
  minHeartRate?: number
  maxHeartRate?: number
  avgHeartRate?: number
  samples?: Array<{ timestamp: Date; heartRate: number }>
}

export interface DailySummary {
  date: Date
  heartRate?: DailyHeartRate
  sleep?: SleepData
  stress?: StressData
  bodyBattery?: BodyBattery
  hrv?: HRVData
  steps?: {
    total: number
    goal: number
    distance: number
    calories: number
  }
}

export class GarminConnectClient {
  private client: InstanceType<typeof GCClient>
  private isLoggedIn = false

  constructor(config?: GarminConnectConfig) {
    if (config) {
      this.client = new GCClient({
        username: config.username,
        password: config.password,
      })
    } else {
      this.client = new GCClient()
    }
  }

  /**
   * Login to Garmin Connect
   */
  async login(username?: string, password?: string): Promise<void> {
    if (username && password) {
      this.client = new GCClient({ username, password })
    }
    await this.client.login()
    this.isLoggedIn = true
  }

  /**
   * Get user profile
   */
  async getUserProfile(): Promise<{ displayName: string; profileId: string }> {
    this.ensureLoggedIn()
    const profile = await this.client.getUserProfile()
    return {
      displayName: profile.displayName || profile.userName || 'Unknown',
      profileId: String(profile.profileId || profile.userId),
    }
  }

  /**
   * Get recent activities
   */
  async getActivities(start = 0, limit = 20): Promise<GarminActivitySummary[]> {
    this.ensureLoggedIn()
    const activities = await this.client.getActivities(start, limit)
    return activities as GarminActivitySummary[]
  }

  /**
   * Get detailed activity data
   */
  async getActivity(activityId: number): Promise<Activity> {
    this.ensureLoggedIn()
    const data = await this.client.getActivity({ activityId })
    return this.parseActivityResponse(data)
  }

  /**
   * Download original FIT file for an activity
   */
  async downloadActivityFit(activityId: number): Promise<ArrayBuffer> {
    this.ensureLoggedIn()
    const data = await this.client.downloadOriginalActivityData(activityId)
    return data
  }

  /**
   * Get daily summary (heart rate, sleep, stress, etc.)
   */
  async getDailySummary(date: Date): Promise<DailySummary> {
    this.ensureLoggedIn()

    const summary: DailySummary = { date }

    // Fetch all data in parallel
    const [heartRate, sleep, steps] = await Promise.allSettled([
      this.getHeartRateData(date),
      this.getSleepData(date),
      this.getStepsData(date),
    ])

    if (heartRate.status === 'fulfilled') summary.heartRate = heartRate.value
    if (sleep.status === 'fulfilled') summary.sleep = sleep.value
    if (steps.status === 'fulfilled') summary.steps = steps.value

    return summary
  }

  /**
   * Get heart rate data for a specific date
   */
  async getHeartRateData(date: Date): Promise<DailyHeartRate | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getHeartRate(date)
      if (!data) return undefined

      const samples = (data.heartRateValues || [])
        .filter(([_, hr]: [number, number]) => hr > 0)
        .map(([ts, hr]: [number, number]) => ({
          timestamp: new Date(ts),
          heartRate: hr,
        }))

      return {
        date,
        restingHeartRate: data.restingHeartRate,
        minHeartRate: data.minHeartRate,
        maxHeartRate: data.maxHeartRate,
        avgHeartRate: samples.length > 0
          ? Math.round(samples.reduce((sum: number, s: { heartRate: number }) => sum + s.heartRate, 0) / samples.length)
          : undefined,
        samples,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Get sleep data for a specific date
   */
  async getSleepData(date: Date): Promise<SleepData | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getSleepData(date)
      if (!data?.dailySleepDTO) return undefined

      const dto = data.dailySleepDTO
      const stages = (data.sleepLevels || []).map((level: { startGMT: number; endGMT: number; activityLevel: number }) => ({
        stage: this.mapSleepLevel(level.activityLevel),
        startTime: new Date(level.startGMT),
        endTime: new Date(level.endGMT),
      }))

      return {
        date,
        startTime: new Date(dto.sleepStartTimestampGMT),
        endTime: new Date(dto.sleepEndTimestampGMT),
        totalSleepTime: dto.sleepTimeSeconds / 60,
        deepSleepTime: dto.deepSleepSeconds / 60,
        lightSleepTime: dto.lightSleepSeconds / 60,
        remSleepTime: dto.remSleepSeconds / 60,
        awakeTime: dto.awakeSleepSeconds / 60,
        sleepScore: dto.sleepScores?.overall?.value,
        stages,
        avgSpO2: dto.averageSpO2Value,
        avgRespirationRate: dto.averageRespirationValue,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Get steps data for a specific date
   */
  async getStepsData(date: Date): Promise<{ total: number; goal: number; distance: number; calories: number } | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getSteps(date)
      if (!data) return undefined

      return {
        total: data.totalSteps || 0,
        goal: data.dailyStepGoal || 10000,
        distance: (data.totalDistance || 0) / 100, // Convert to meters
        calories: data.totalKilocalories || 0,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Get stress data for a specific date
   */
  async getStressData(date: Date): Promise<StressData | undefined> {
    this.ensureLoggedIn()

    try {
      // The garmin-connect library may not have a direct getStress method
      // Using the underlying client request
      const dateStr = date.toISOString().slice(0, 10)
      const data = await this.client.get(`/wellness-service/wellness/dailyStress/${dateStr}`)
      if (!data) return undefined

      const samples = (data.stressValuesArray || [])
        .filter(([_, level]: [number, number]) => level >= 0)
        .map(([ts, level]: [number, number]) => ({
          timestamp: new Date(ts),
          stressLevel: level,
        }))

      return {
        date,
        avgStressLevel: data.overallStressLevel || 0,
        maxStressLevel: data.maxStressLevel || 0,
        restStressDuration: (data.restStressDuration || 0) / 60,
        lowStressDuration: (data.lowStressDuration || 0) / 60,
        mediumStressDuration: (data.mediumStressDuration || 0) / 60,
        highStressDuration: (data.highStressDuration || 0) / 60,
        samples,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Get body battery data for a specific date
   */
  async getBodyBatteryData(date: Date): Promise<BodyBattery | undefined> {
    this.ensureLoggedIn()

    try {
      const dateStr = date.toISOString().slice(0, 10)
      const data = await this.client.getBodyBattery(dateStr, dateStr)
      if (!data || data.length === 0) return undefined

      const dayData = data[0]
      const samples = (dayData.bodyBatteryValuesArray || [])
        .filter(([_, level]: [number, number]) => level >= 0)
        .map(([ts, level]: [number, number]) => ({
          timestamp: new Date(ts),
          level,
        }))

      return {
        date,
        startLevel: samples[0]?.level || 0,
        endLevel: samples[samples.length - 1]?.level || 0,
        chargedValue: dayData.charged || 0,
        drainedValue: dayData.drained || 0,
        samples,
      }
    } catch {
      return undefined
    }
  }

  /**
   * Get HRV data for a specific date
   */
  async getHrvData(date: Date): Promise<HRVData | undefined> {
    this.ensureLoggedIn()

    try {
      const dateStr = date.toISOString().slice(0, 10)
      const data = await this.client.getHrvData(dateStr)
      if (!data?.hrvSummary) return undefined

      const samples = (data.hrvValues || []).map((v: { hrvValue: number; readingTimeGMT: number }) => ({
        timestamp: new Date(v.readingTimeGMT),
        hrv: v.hrvValue,
      }))

      return {
        date,
        weeklyAverage: data.hrvSummary.weeklyAvg,
        lastNightAverage: data.hrvSummary.lastNightAvg,
        status: data.hrvSummary.status as HRVData['status'],
        baseline: data.hrvSummary.baseline?.balancedLow,
        samples,
      }
    } catch {
      return undefined
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
      meditation: 'other',
    }
    return typeMap[typeKey] || 'other'
  }

  private ensureLoggedIn(): void {
    if (!this.isLoggedIn) {
      throw new Error('Not logged in. Call login() first.')
    }
  }
}

/**
 * Create a Garmin Connect client
 */
export function createGarminConnectClient(config?: GarminConnectConfig): GarminConnectClient {
  return new GarminConnectClient(config)
}
