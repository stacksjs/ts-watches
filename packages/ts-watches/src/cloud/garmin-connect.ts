import { GarminConnect } from 'ts-garmin'
import type { Activity, SleepData, StressData, BodyBattery, HRVData } from '../types'

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
  samples?: Array<{ timestamp: Date, heartRate: number }>
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
  private client: GarminConnect
  private isLoggedIn = false

  constructor(config?: GarminConnectConfig) {
    if (config) {
      this.client = new GarminConnect({
        username: config.username,
        password: config.password,
      })
    }
    else {
      // Will require login with credentials
      this.client = null as unknown as GarminConnect
    }
  }

  async login(username?: string, password?: string): Promise<void> {
    if (username && password) {
      this.client = new GarminConnect({ username, password })
    }
    if (!this.client) {
      throw new Error('Credentials required for login')
    }
    await this.client.login()
    this.isLoggedIn = true
  }

  async getUserProfile(): Promise<{ displayName: string, profileId: string }> {
    this.ensureLoggedIn()
    const profile = await this.client.getUserProfile()
    return {
      displayName: profile.displayName || profile.userName || 'Unknown',
      profileId: String(profile.profileId),
    }
  }

  async getActivities(start = 0, limit = 20): Promise<GarminActivitySummary[]> {
    this.ensureLoggedIn()
    const activities = await this.client.getActivities(start, limit)
    return activities as unknown as GarminActivitySummary[]
  }

  async getActivity(activityId: number): Promise<Activity> {
    this.ensureLoggedIn()
    const data = await this.client.getActivity({ activityId })
    return this.parseActivityResponse(data)
  }

  async downloadActivityFit(activityId: number, outputDir: string): Promise<void> {
    this.ensureLoggedIn()
    await this.client.downloadOriginalActivityData({ activityId }, outputDir, 'zip')
  }

  async getDailySummary(date: Date): Promise<DailySummary> {
    this.ensureLoggedIn()

    const summary: DailySummary = { date }

    const [heartRate, sleep, steps] = await Promise.allSettled([
      this.getHeartRateData(date),
      this.getSleepData(date),
      this.getStepsData(date),
    ])

    if (heartRate.status === 'fulfilled')
      summary.heartRate = heartRate.value
    if (sleep.status === 'fulfilled')
      summary.sleep = sleep.value
    if (steps.status === 'fulfilled')
      summary.steps = steps.value

    return summary
  }

  async getHeartRateData(date: Date): Promise<DailyHeartRate | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getHeartRate(date)
      if (!data)
        return undefined

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
    }
    catch {
      return undefined
    }
  }

  async getSleepData(date: Date): Promise<SleepData | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getSleepData(date)
      if (!data?.dailySleepDTO)
        return undefined

      const dto = data.dailySleepDTO
      const stages = (data.sleepLevels || []).map((level: { startGMT: string, endGMT: string, activityLevel: number }) => ({
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
        avgSpO2: undefined,
        avgRespirationRate: dto.averageRespirationValue,
      }
    }
    catch {
      return undefined
    }
  }

  async getStepsData(date: Date): Promise<{ total: number, goal: number, distance: number, calories: number } | undefined> {
    this.ensureLoggedIn()

    try {
      const total = await this.client.getSteps(date)

      return {
        total,
        goal: 10000,
        distance: 0,
        calories: 0,
      }
    }
    catch {
      return undefined
    }
  }

  async getStressData(_date: Date): Promise<StressData | undefined> {
    this.ensureLoggedIn()
    // Stress data endpoint not directly available in ts-garmin
    // Would need to use the generic get() method
    return undefined
  }

  async getBodyBatteryData(_date: Date): Promise<BodyBattery | undefined> {
    this.ensureLoggedIn()
    // Body battery endpoint not directly available in ts-garmin
    // Would need to use the generic get() method
    return undefined
  }

  async getHrvData(_date: Date): Promise<HRVData | undefined> {
    this.ensureLoggedIn()
    // HRV endpoint not directly available in ts-garmin
    // Would need to use the generic get() method
    return undefined
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

  private parseActivityResponse(data: unknown): Activity {
    const d = data as Record<string, unknown>
    return {
      id: `garmin_${d.activityId}`,
      name: d.activityName as string,
      sport: this.mapActivityType((d.activityType as Record<string, unknown>)?.typeKey as string),
      startTime: new Date(d.startTimeGMT as string),
      endTime: new Date(new Date(d.startTimeGMT as string).getTime() + (d.duration as number) * 1000),
      totalElapsedTime: (d.elapsedDuration as number) || (d.duration as number),
      totalTimerTime: d.duration as number,
      totalDistance: (d.distance as number) || 0,
      totalCalories: (d.calories as number) || 0,
      avgHeartRate: d.averageHR as number | undefined,
      maxHeartRate: d.maxHR as number | undefined,
      avgSpeed: d.averageSpeed as number | undefined,
      maxSpeed: d.maxSpeed as number | undefined,
      avgCadence: (d.averageRunningCadenceInStepsPerMinute as number) || (d.averageBikingCadenceInRevPerMinute as number),
      maxCadence: (d.maxRunningCadenceInStepsPerMinute as number) || (d.maxBikingCadenceInRevPerMinute as number),
      avgPower: d.avgPower as number | undefined,
      maxPower: d.maxPower as number | undefined,
      normalizedPower: d.normPower as number | undefined,
      totalAscent: d.elevationGain as number | undefined,
      totalDescent: d.elevationLoss as number | undefined,
      trainingStressScore: d.trainingStressScore as number | undefined,
      intensityFactor: d.intensityFactor as number | undefined,
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

export function createGarminConnectClient(config?: GarminConnectConfig): GarminConnectClient {
  return new GarminConnectClient(config)
}
