import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GarminConnect } from 'ts-garmin'
import type { Activity, SleepData, StressData, BodyBattery, HRVData, WeightData } from '../types'

export interface GarminConnectConfig {
  username: string
  password: string
}

/**
 * What Connect can export an activity as. `zip` is "Export Original", the
 * device's own recording; the rest are Garmin's conversions.
 */
export type GarminExportFormat = 'zip' | 'tcx' | 'gpx' | 'kml'

/** A downloaded activity file, held in memory. */
export interface OriginalActivityFile {
  bytes: Uint8Array
  /** `{activityId}.{format}`. */
  filename: string
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
  aerobicTrainingEffect?: number
  anaerobicTrainingEffect?: number
  trainingEffectLabel?: string
  activityTrainingLoad?: number
  vO2MaxValue?: number
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

/** One recorded sample from an activity's details. */
export interface ActivityDetailSample {
  /** Timer time since the start, in seconds: pauses do not advance it. */
  seconds: number
  heartRate: number | null
  /** Watts. */
  power: number | null
  /** Metres per second. */
  speed: number | null
}

/**
 * Garmin Connect's activity details as plain samples. The endpoint sends one
 * array of values per sample, in the order `metricDescriptors` gives; timer
 * time is `sumDuration` (seconds), falling back to wall time from
 * `directTimestamp` (milliseconds) with any gap over a minute counted as a
 * pause. Samples with no time at all are dropped.
 */
export function parseActivityDetails(details: unknown): ActivityDetailSample[] {
  const data = details as { metricDescriptors?: Array<{ metricsIndex: number, key: string }>, activityDetailMetrics?: Array<{ metrics?: Array<number | null> }> } | null
  const descriptors = Array.isArray(data?.metricDescriptors) ? data!.metricDescriptors : []
  const rows = Array.isArray(data?.activityDetailMetrics) ? data!.activityDetailMetrics : []
  const index = (key: string) => descriptors.find(d => d.key === key)?.metricsIndex ?? -1
  const at = { duration: index('sumDuration'), timestamp: index('directTimestamp'), hr: index('directHeartRate'), power: index('directPower'), speed: index('directSpeed') }
  const value = (row: Array<number | null>, i: number): number | null => {
    if (i < 0) return null
    const v = row[i]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  const samples: ActivityDetailSample[] = []
  let wall = 0
  let lastStamp: number | null = null
  for (const row of rows) {
    const metrics = Array.isArray(row?.metrics) ? row.metrics : []
    let seconds = value(metrics, at.duration)
    if (seconds === null) {
      const stamp = value(metrics, at.timestamp)
      if (stamp === null) continue
      if (lastStamp !== null) wall += Math.min(Math.max(0, (stamp - lastStamp) / 1000), 60)
      lastStamp = stamp
      seconds = wall
    }
    const hr = value(metrics, at.hr)
    const power = value(metrics, at.power)
    const speed = value(metrics, at.speed)
    samples.push({ seconds, heartRate: hr && hr > 0 ? hr : null, power: power !== null && power >= 0 ? power : null, speed: speed !== null && speed >= 0 ? speed : null })
  }
  return samples
}

/**
 * A workout as Garmin Connect's workout service takes it: the JSON its own
 * workout editor sends to `/workout-service/workout`. Typed loosely on
 * purpose: the vocabulary (sport, step type, end condition and target ids) is
 * Garmin's and undocumented, so callers build it and this only carries it.
 */
export interface GarminConnectWorkout {
  workoutName: string
  description?: string | null
  sportType: { sportTypeId: number, sportTypeKey: string, displayOrder?: number }
  workoutSegments: Array<{
    segmentOrder: number
    sportType: { sportTypeId: number, sportTypeKey: string, displayOrder?: number }
    workoutSteps: Array<Record<string, unknown>>
  }>
  [key: string]: unknown
}

/** A workout Connect holds, as far as a caller needs to keep track of it. */
export interface GarminConnectWorkoutRef {
  /** Connect's id for the workout, as a string. */
  workoutId: string
}

/** One scheduling of a workout on the athlete's Connect calendar. */
export interface GarminConnectSchedule {
  /** Connect's id for this scheduling, or null when it answered without one. */
  workoutScheduleId: string | null
  /** The day, YYYY-MM-DD. */
  date: string
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

function idOf(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  if (typeof value === 'string' && value.trim())
    return value.trim()
  return null
}

/** Whether an error from Connect is a 404: the thing asked about is not there. */
export function isGarminNotFound(error: unknown): boolean {
  return /HTTP Error: 404\b/.test(String((error as { message?: unknown })?.message ?? error))
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

  /** Provider snapshots for the signed-in account only; dates are calendar days. */
  async getTrainingReadiness(date: string): Promise<unknown> {
    return this.trainingMetric('trainingreadiness', date)
  }

  /** Aggregated status includes the primary device's acute load and VO2 max. */
  async getTrainingStatus(date: string): Promise<unknown> {
    return this.trainingMetric('trainingstatus/aggregated', date)
  }

  /** Daily VO2 max history; no estimates are calculated by this client. */
  async getMaxMetrics(start: string, end: string): Promise<unknown> {
    this.ensureLoggedIn()
    this.metricDay(start)
    this.metricDay(end)
    if (start > end) throw new RangeError('Start date must precede end date')
    return this.client.get(`https://connectapi.garmin.com/metrics-service/metrics/maxmet/daily/${start}/${end}`)
  }

  private metricDay(date: string): void {
    if (!YMD.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
      throw new RangeError('Expected a valid calendar date')
  }

  private async trainingMetric(metric: 'trainingreadiness' | 'trainingstatus/aggregated', date: string): Promise<unknown> {
    this.ensureLoggedIn()
    this.metricDay(date)
    return this.client.get(`https://connectapi.garmin.com/metrics-service/metrics/${metric}/${date}`)
  }

  async getActivity(activityId: number): Promise<Activity> {
    this.ensureLoggedIn()
    const data = await this.client.getActivity({ activityId })
    return this.parseActivityResponse(data)
  }

  /**
   * An activity's recorded heart rate, power and speed over timer time,
   * downsampled by Garmin to at most `maxSamples`: enough for time in zone
   * without downloading the file.
   */
  async getActivityDetails(activityId: number, maxSamples = 2000): Promise<ActivityDetailSample[]> {
    this.ensureLoggedIn()
    return parseActivityDetails(await this.client.getActivityDetails({ activityId }, maxSamples))
  }

  /**
   * An activity's original recording, in memory.
   *
   * The default `zip` is Connect's "Export Original": a zip holding the file
   * the device recorded, usually a `.fit`, and the only place Connect gives
   * out an activity's GPS track. `tcx`, `gpx` and `kml` are Garmin's own
   * conversions. `filename` is `{activityId}.{format}`, the name
   * `downloadActivityFit` writes it under.
   *
   * Nothing touches the disk, so a server that only parses the recording has
   * no temporary directory to make or clean up.
   */
  async downloadOriginalActivity(activityId: number, format: GarminExportFormat = 'zip'): Promise<OriginalActivityFile> {
    this.ensureLoggedIn()
    return this.client.getOriginalActivityData({ activityId }, format)
  }

  /**
   * Write an activity's "Export Original" zip into `outputDir`, creating it
   * if need be, as `{activityId}.zip`. Returns the path written.
   */
  async downloadActivityFit(activityId: number, outputDir: string): Promise<string> {
    const { bytes, filename } = await this.downloadOriginalActivity(activityId, 'zip')
    await mkdir(outputDir, { recursive: true })
    const file = join(outputDir, filename)
    await writeFile(file, bytes)
    return file
  }

  /**
   * Put a structured workout in the athlete's Connect workout library, from
   * where Garmin syncs it to the watch. Answers with Connect's id for it.
   */
  async createWorkout(workout: GarminConnectWorkout): Promise<GarminConnectWorkoutRef> {
    this.ensureLoggedIn()
    const created = await this.client.createWorkout(workout as never) as unknown as { workoutId?: unknown }
    const workoutId = idOf(created?.workoutId)
    if (!workoutId)
      throw new Error('Garmin Connect accepted the workout but did not say which one it is')
    return { workoutId }
  }

  /** A workout as Connect holds it, or null when it is not there (deleted on the watch or in Connect). */
  async getWorkout(workoutId: string): Promise<Record<string, unknown> | null> {
    this.ensureLoggedIn()
    try {
      return await this.client.getWorkoutDetail({ workoutId: String(workoutId) }) as unknown as Record<string, unknown>
    }
    catch (error) {
      if (isGarminNotFound(error))
        return null
      throw error
    }
  }

  /** Replace a workout in place, keeping its id and its schedulings. */
  async updateWorkout(workoutId: string, workout: GarminConnectWorkout): Promise<void> {
    this.ensureLoggedIn()
    await this.client.updateWorkout({ workoutId: String(workoutId) }, workout)
  }

  /**
   * Take a workout out of the library. One already gone counts as done:
   * that is the outcome asked for.
   */
  async deleteWorkout(workoutId: string): Promise<void> {
    this.ensureLoggedIn()
    try {
      await this.client.deleteWorkout({ workoutId: String(workoutId) })
    }
    catch (error) {
      if (!isGarminNotFound(error))
        throw error
    }
  }

  /** Put a library workout on a day of the athlete's Connect calendar (YYYY-MM-DD). */
  async scheduleWorkout(workoutId: string, date: string): Promise<GarminConnectSchedule> {
    this.ensureLoggedIn()
    if (!YMD.test(date))
      throw new Error(`Not a day: ${date} (expected YYYY-MM-DD)`)
    const scheduled = await this.client.scheduleWorkout({ workoutId: String(workoutId) }, date) as { workoutScheduleId?: unknown, calendarDate?: unknown } | null
    return {
      workoutScheduleId: idOf(scheduled?.workoutScheduleId),
      date: typeof scheduled?.calendarDate === 'string' && YMD.test(scheduled.calendarDate) ? scheduled.calendarDate : date,
    }
  }

  /** Take one scheduling off the calendar; the workout stays in the library. Already gone counts as done. */
  async unscheduleWorkout(workoutScheduleId: string): Promise<void> {
    this.ensureLoggedIn()
    try {
      await this.client.unscheduleWorkout({ workoutScheduleId: String(workoutScheduleId) })
    }
    catch (error) {
      if (!isGarminNotFound(error))
        throw error
    }
  }

  async getDailySummary(date: Date): Promise<DailySummary> {
    this.ensureLoggedIn()

    const summary: DailySummary = { date }

    const [heartRate, sleep, steps, stress, hrv, bodyBattery] = await Promise.allSettled([
      this.getHeartRateData(date),
      this.getSleepData(date),
      this.getStepsData(date),
      this.getStressData(date),
      this.getHrvData(date),
      this.getBodyBatteryData(date),
    ])

    if (heartRate.status === 'fulfilled')
      summary.heartRate = heartRate.value
    if (sleep.status === 'fulfilled')
      summary.sleep = sleep.value
    if (steps.status === 'fulfilled')
      summary.steps = steps.value
    if (stress.status === 'fulfilled')
      summary.stress = stress.value
    if (hrv.status === 'fulfilled')
      summary.hrv = hrv.value
    if (bodyBattery.status === 'fulfilled')
      summary.bodyBattery = bodyBattery.value

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

  async getStressData(date: Date): Promise<StressData | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getStressData(date)
      if (!data)
        return undefined

      const samples = (data.stressValuesArray || [])
        .filter(([_, level]: [number, number]) => level >= 0)
        .map(([ts, level]: [number, number]) => ({
          timestamp: new Date(ts),
          stressLevel: level,
        }))

      // Categorize stress durations from samples (values: 0-25 rest, 26-50 low, 51-75 med, 76-100 high)
      let restMinutes = 0
      let lowMinutes = 0
      let mediumMinutes = 0
      let highMinutes = 0
      const intervalMinutes = samples.length > 1 ? 3 : 0 // Garmin samples every ~3 min

      for (const s of samples) {
        if (s.stressLevel <= 25) restMinutes += intervalMinutes
        else if (s.stressLevel <= 50) lowMinutes += intervalMinutes
        else if (s.stressLevel <= 75) mediumMinutes += intervalMinutes
        else highMinutes += intervalMinutes
      }

      return {
        date,
        avgStressLevel: data.avgStressLevel ?? 0,
        maxStressLevel: data.maxStressLevel ?? 0,
        restStressDuration: restMinutes,
        lowStressDuration: lowMinutes,
        mediumStressDuration: mediumMinutes,
        highStressDuration: highMinutes,
        samples,
      }
    }
    catch {
      return undefined
    }
  }

  async getBodyBatteryData(date: Date): Promise<BodyBattery | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getBodyBattery(date)
      if (!data)
        return undefined

      const samples = (data.bodyBatteryValuesArray || [])
        .filter(([_, level]: [number, number]) => level >= 0)
        .map(([ts, level]: [number, number]) => ({
          timestamp: new Date(ts),
          level,
        }))

      const levels = samples.map(s => s.level)
      const startLevel = levels[0] ?? 0
      const endLevel = levels[levels.length - 1] ?? 0

      return {
        date,
        startLevel,
        endLevel,
        chargedValue: data.charged ?? 0,
        drainedValue: data.drained ?? 0,
        samples,
      }
    }
    catch {
      return undefined
    }
  }

  async getHrvData(date: Date): Promise<HRVData | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getHrvData(date)
      if (!data)
        return undefined

      const summary = data.hrvSummary
      const samples = (data.hrvReadings || []).map((r: { hrvValue: number, readingTimeGMT: string }) => ({
        timestamp: new Date(r.readingTimeGMT),
        hrv: r.hrvValue,
      }))

      return {
        date,
        weeklyAverage: summary?.weeklyAvg,
        lastNightAverage: summary?.lastNightAvg,
        status: summary?.status ? summary.status.toLowerCase() as HRVData['status'] : undefined,
        baseline: summary?.baseline?.markerValue,
        samples,
      }
    }
    catch {
      return undefined
    }
  }

  async getWeightData(date: Date): Promise<WeightData | undefined> {
    this.ensureLoggedIn()

    try {
      const data = await this.client.getDailyWeightData(date)
      if (!data?.dateWeightList?.length)
        return undefined

      const entry = data.dateWeightList[0]

      return {
        date,
        weight: entry.weight,
        bmi: entry.bmi,
        bodyFatPercentage: entry.bodyFatPercentage,
        bodyWater: entry.bodyWater,
        boneMass: entry.boneMass,
        muscleMass: entry.muscleMass,
        visceralFat: entry.visceralFat,
        metabolicAge: entry.metabolicAge,
      }
    }
    catch {
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
