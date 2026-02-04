import * as fs from 'node:fs'
import * as path from 'node:path'
import { HttpClient } from '../common/HttpClient'
import { checkIsDirectory, createDirectory, writeToFile } from '../utils'
import { UrlClass } from './UrlClass'
import type {
  ActivitySubType,
  ActivityType,
  ExportFileTypeValue,
  GCActivityId,
  GCGearId,
  GarminDomain,
  IActivity,
  ICountActivities,
  IGarminTokens,
  IOauth1Token,
  IOauth2Token,
  ISocialProfile,
  IUserSettings,
  IWorkout,
  IWorkoutDetail,
  ListCoursesResponse,
  UploadFileTypeValue,
} from './types'
import { UploadFileType } from './types'
import { toDateString, calculateTimeDifference, getLocalTimestamp } from './common/DateUtils'
import type { SleepData } from './types/sleep'
import { gramsToPounds } from './common/WeightUtils'
import { convertMLToOunces, convertOuncesToML } from './common/HydrationUtils'
import type { GearData } from './types/gear'
import type { Workout } from './types/workout'
import type { CoursePoint, GeoPoint, GpxActivityType, ImportedGpxResponse } from './types/gpx'
import { courseRequestTemplate } from './common/GpxUtils'
import type { MonthCalendar, YearCalendar } from './types/calendar'
import type { HeartRate } from './types/heartrate'
import type { HydrationData, WaterIntake } from './types/hydration'
import type { UpdateWeight, WeightData } from './types/weight'
import type { IDailyStepsType } from './types'

export interface GCCredentials {
  username: string
  password: string
}

export interface Listeners {
  [event: string]: EventCallback<unknown>[]
}

export type EventCallback<T> = (data: T) => void

export enum Event {
  sessionChange = 'sessionChange',
}

export default class GarminConnect {
  client: HttpClient
  private credentials: GCCredentials
  private listeners: Listeners
  private url: UrlClass

  constructor(
    credentials?: GCCredentials,
    domain: GarminDomain = 'garmin.com',
  ) {
    if (!credentials) {
      throw new Error('Missing credentials')
    }
    this.credentials = credentials
    this.url = new UrlClass(domain)
    this.client = new HttpClient(this.url)
    this.listeners = {}
  }

  async login(username?: string, password?: string): Promise<GarminConnect> {
    if (username && password) {
      this.credentials.username = username
      this.credentials.password = password
    }
    await this.client.login(this.credentials.username, this.credentials.password)
    return this
  }

  exportTokenToFile(dirPath: string): void {
    if (!checkIsDirectory(dirPath)) {
      createDirectory(dirPath)
    }
    if (this.client.oauth1Token) {
      writeToFile(
        path.join(dirPath, 'oauth1_token.json'),
        JSON.stringify(this.client.oauth1Token),
      )
    }
    if (this.client.oauth2Token) {
      writeToFile(
        path.join(dirPath, 'oauth2_token.json'),
        JSON.stringify(this.client.oauth2Token),
      )
    }
  }

  loadTokenByFile(dirPath: string): void {
    if (!checkIsDirectory(dirPath)) {
      throw new Error(`loadTokenByFile: Directory not found: ${dirPath}`)
    }
    const oauth1Data = fs.readFileSync(path.join(dirPath, 'oauth1_token.json'), 'utf-8')
    const oauth1 = JSON.parse(oauth1Data)
    this.client.oauth1Token = oauth1

    const oauth2Data = fs.readFileSync(path.join(dirPath, 'oauth2_token.json'), 'utf-8')
    const oauth2 = JSON.parse(oauth2Data)
    this.client.oauth2Token = oauth2
  }

  exportToken(): IGarminTokens {
    if (!this.client.oauth1Token || !this.client.oauth2Token) {
      throw new Error('exportToken: Token not found')
    }
    return {
      oauth1: this.client.oauth1Token,
      oauth2: this.client.oauth2Token,
    }
  }

  loadToken(oauth1: IOauth1Token, oauth2: IOauth2Token): void {
    this.client.oauth1Token = oauth1
    this.client.oauth2Token = oauth2
  }

  async getUserSettings(): Promise<IUserSettings> {
    return this.client.get<IUserSettings>(this.url.USER_SETTINGS)
  }

  async getUserProfile(): Promise<ISocialProfile> {
    return this.client.get<ISocialProfile>(this.url.USER_PROFILE)
  }

  async getActivities(
    start?: number,
    limit?: number,
    activityType?: ActivityType,
    subActivityType?: ActivitySubType,
  ): Promise<IActivity[]> {
    return this.client.get<IActivity[]>(this.url.ACTIVITIES, {
      params: { start, limit, activityType, subActivityType },
    })
  }

  async getActivity(activity: { activityId: GCActivityId }): Promise<IActivity> {
    if (!activity.activityId)
      throw new Error('Missing activityId')
    return this.client.get<IActivity>(`${this.url.ACTIVITY}${activity.activityId}`)
  }

  async countActivities(): Promise<ICountActivities> {
    const now = new Date()
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return this.client.get<ICountActivities>(this.url.STAT_ACTIVITIES, {
      params: {
        aggregation: 'lifetime',
        startDate: '1970-01-01',
        endDate,
        metric: 'duration',
      },
    })
  }

  async downloadOriginalActivityData(
    activity: { activityId: GCActivityId },
    dir: string,
    type: ExportFileTypeValue = 'zip',
  ): Promise<void> {
    if (!activity.activityId)
      throw new Error('Missing activityId')
    if (!checkIsDirectory(dir)) {
      createDirectory(dir)
    }

    let fileBuffer: ArrayBuffer
    let url: string

    if (type === 'tcx') {
      url = `${this.url.DOWNLOAD_TCX}${activity.activityId}`
    }
    else if (type === 'gpx') {
      url = `${this.url.DOWNLOAD_GPX}${activity.activityId}`
    }
    else if (type === 'kml') {
      url = `${this.url.DOWNLOAD_KML}${activity.activityId}`
    }
    else if (type === 'zip') {
      url = `${this.url.DOWNLOAD_ZIP}${activity.activityId}`
    }
    else {
      throw new Error(`downloadOriginalActivityData - Invalid type: ${type}`)
    }

    fileBuffer = await this.client.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
    writeToFile(path.join(dir, `${activity.activityId}.${type}`), Buffer.from(fileBuffer))
  }

  async uploadActivity(file: string, format: UploadFileTypeValue = 'fit'): Promise<unknown> {
    const detectedFormat = (format || path.extname(file))?.toLowerCase() as UploadFileTypeValue
    if (!Object.values(UploadFileType).includes(detectedFormat as UploadFileType)) {
      throw new Error(`uploadActivity - Invalid format: ${format}`)
    }

    const fileBuffer = fs.readFileSync(file)
    const formData = new FormData()
    formData.append('userfile', new Blob([fileBuffer]), path.basename(file))

    const response = await fetch(`${this.url.UPLOAD}.${format}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.client.oauth2Token?.access_token}`,
      },
      body: formData,
    })

    return response.json()
  }

  async deleteActivity(activity: { activityId: GCActivityId }): Promise<void> {
    if (!activity.activityId)
      throw new Error('Missing activityId')
    await this.client.delete<void>(`${this.url.ACTIVITY}${activity.activityId}`)
  }

  async getWorkouts(start: number, limit: number): Promise<IWorkout[]> {
    return this.client.get<IWorkout[]>(this.url.WORKOUTS, {
      params: { start, limit },
    })
  }

  async getWorkoutDetail(workout: { workoutId: string }): Promise<IWorkoutDetail> {
    if (!workout.workoutId)
      throw new Error('Missing workoutId')
    return this.client.get<IWorkoutDetail>(this.url.WORKOUT(workout.workoutId))
  }

  async createWorkout(workout: IWorkoutDetail): Promise<Workout> {
    return this.client.post<Workout>(this.url.WORKOUT(), workout)
  }

  async deleteWorkout(workout: { workoutId: string }): Promise<unknown> {
    if (!workout.workoutId)
      throw new Error('Missing workout')
    return this.client.delete(this.url.WORKOUT(workout.workoutId))
  }

  async scheduleWorkout(workout: { workoutId: string }, scheduleDate: string): Promise<unknown> {
    return this.client.post(
      this.url.SCHEDULE_WORKOUT(Number.parseInt(workout.workoutId)),
      { date: scheduleDate },
    )
  }

  async getSteps(date = new Date()): Promise<number> {
    const dateString = toDateString(date)
    const days = await this.client.get<IDailyStepsType[]>(
      `${this.url.DAILY_STEPS}${dateString}/${dateString}`,
    )
    const dayStats = days.find(({ calendarDate }) => calendarDate === dateString)

    if (!dayStats) {
      throw new Error("Can't find daily steps for this date.")
    }

    return dayStats.totalSteps
  }

  async getSleepData(date = new Date()): Promise<SleepData> {
    try {
      const dateString = toDateString(date)
      const sleepData = await this.client.get<SleepData>(this.url.DAILY_SLEEP, {
        params: { date: dateString },
      })

      if (!sleepData) {
        throw new Error('Invalid or empty sleep data response.')
      }

      return sleepData
    }
    catch (error) {
      throw new Error(`Error in getSleepData: ${error instanceof Error ? error.message : error}`)
    }
  }

  async getSleepDuration(date = new Date()): Promise<{ hours: number, minutes: number }> {
    try {
      const sleepData = await this.getSleepData(date)

      if (
        !sleepData
        || !sleepData.dailySleepDTO
        || sleepData.dailySleepDTO.sleepStartTimestampGMT === undefined
        || sleepData.dailySleepDTO.sleepEndTimestampGMT === undefined
      ) {
        throw new Error('Invalid or missing sleep data for the specified date.')
      }

      const { hours, minutes } = calculateTimeDifference(
        sleepData.dailySleepDTO.sleepStartTimestampGMT,
        sleepData.dailySleepDTO.sleepEndTimestampGMT,
      )

      return { hours, minutes }
    }
    catch (error) {
      throw new Error(`Error in getSleepDuration: ${error instanceof Error ? error.message : error}`)
    }
  }

  async getDailyWeightData(date = new Date()): Promise<WeightData> {
    try {
      const dateString = toDateString(date)
      const weightData = await this.client.get<WeightData>(`${this.url.DAILY_WEIGHT}/${dateString}`)

      if (!weightData) {
        throw new Error('Invalid or empty weight data response.')
      }

      return weightData
    }
    catch (error) {
      throw new Error(`Error in getDailyWeightData: ${error instanceof Error ? error.message : error}`)
    }
  }

  async getDailyWeightInPounds(date = new Date()): Promise<number> {
    const weightData = await this.getDailyWeightData(date)

    if (weightData.totalAverage && typeof weightData.totalAverage.weight === 'number') {
      return gramsToPounds(weightData.totalAverage.weight)
    }
    else {
      throw new Error("Can't find valid daily weight for this date.")
    }
  }

  async getDailyHydration(date = new Date()): Promise<number> {
    try {
      const dateString = toDateString(date)
      const hydrationData = await this.client.get<HydrationData>(
        `${this.url.DAILY_HYDRATION}/${dateString}`,
      )

      if (!hydrationData || !hydrationData.valueInML) {
        throw new Error('Invalid or empty hydration data response.')
      }

      return convertMLToOunces(hydrationData.valueInML)
    }
    catch (error) {
      throw new Error(`Error in getDailyHydration: ${error instanceof Error ? error.message : error}`)
    }
  }

  async updateWeight(date = new Date(), lbs: number, timezone: string): Promise<UpdateWeight> {
    try {
      const weightData = await this.client.post<UpdateWeight>(this.url.UPDATE_WEIGHT, {
        dateTimestamp: getLocalTimestamp(date, timezone),
        gmtTimestamp: date.toISOString().substring(0, 23),
        unitKey: 'lbs',
        value: lbs,
      })

      return weightData
    }
    catch (error) {
      throw new Error(`Error in updateWeight: ${error instanceof Error ? error.message : error}`)
    }
  }

  async updateHydrationLogOunces(date = new Date(), valueInOz: number): Promise<WaterIntake> {
    try {
      const dateString = toDateString(date)
      const hydrationData = await this.client.put<WaterIntake>(this.url.HYDRATION_LOG, {
        calendarDate: dateString,
        valueInML: convertOuncesToML(valueInOz),
        userProfileId: (await this.getUserProfile()).profileId,
        timestampLocal: date.toISOString().substring(0, 23),
      })

      return hydrationData
    }
    catch (error) {
      throw new Error(`Error in updateHydrationLogOunces: ${error instanceof Error ? error.message : error}`)
    }
  }

  async getGolfSummary(): Promise<unknown> {
    try {
      const golfSummary = await this.client.get(this.url.GOLF_SCORECARD_SUMMARY)

      if (!golfSummary) {
        throw new Error('Invalid or empty golf summary data response.')
      }

      return golfSummary
    }
    catch (error) {
      throw new Error(`Error in getGolfSummary: ${error instanceof Error ? error.message : error}`)
    }
  }

  async getGolfScorecard(scorecardId: number): Promise<unknown> {
    try {
      const golfScorecard = await this.client.get(this.url.GOLF_SCORECARD_DETAIL, {
        params: { 'scorecard-ids': scorecardId },
      })

      if (!golfScorecard) {
        throw new Error('Invalid or empty golf scorecard data response.')
      }

      return golfScorecard
    }
    catch (error) {
      throw new Error(`Error in getGolfScorecard: ${error instanceof Error ? error.message : error}`)
    }
  }

  async getHeartRate(date = new Date()): Promise<HeartRate> {
    try {
      const dateString = toDateString(date)
      const heartRate = await this.client.get<HeartRate>(this.url.DAILY_HEART_RATE, {
        params: { date: dateString },
      })

      return heartRate
    }
    catch (error) {
      throw new Error(`Error in getHeartRate: ${error instanceof Error ? error.message : error}`)
    }
  }

  async getGear(availableGearDate?: string): Promise<GearData[]> {
    const id = (await this.getUserProfile()).profileId
    return this.client.get(this.url.GEAR(id, availableGearDate))
  }

  async getGearsForActivity(activityId: GCActivityId): Promise<GearData[]> {
    return this.client.get(this.url.GEAR_OF_ACTIVITY(activityId))
  }

  async linkGearToActivity(activityId: GCActivityId, gearId: GCGearId): Promise<GearData> {
    return this.client.put(this.url.LINK_GEAR_TO_ACTIVITY(activityId, gearId), {})
  }

  async unlinkGearFromActivity(activityId: GCActivityId, gearId: GCGearId): Promise<GearData> {
    return this.client.put(this.url.UNLINK_GEAR_FROM_ACTIVITY(activityId, gearId), {})
  }

  async workouts(): Promise<Workout[]> {
    return this.client.get(this.url.WORKOUTS_LIST())
  }

  async importGpx(fileName: string, fileContent: string): Promise<ImportedGpxResponse> {
    const formData = new FormData()
    formData.append('file', new Blob([fileContent], { type: 'application/octet-stream' }), fileName)

    const response = await fetch(this.url.IMPORT_GPX_FILE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.client.oauth2Token?.access_token}`,
      },
      body: formData,
    })

    return response.json() as Promise<ImportedGpxResponse>
  }

  async createCourse(
    activityType: GpxActivityType,
    courseName: string,
    geoPoints: GeoPoint[],
    coursePoints: CoursePoint[] = [],
  ): Promise<unknown> {
    return this.client.post(
      this.url.CREATE_COURSE_GPX_FILE,
      courseRequestTemplate(activityType, courseName, geoPoints, coursePoints),
    )
  }

  async listCourses(): Promise<ListCoursesResponse> {
    return this.client.get<ListCoursesResponse>(this.url.LIST_COURSES)
  }

  async exportCourseAsGpx(courseId: number): Promise<string> {
    return this.client.get<string>(this.url.EXPORT_COURSE_GPX_FILE(courseId), {
      responseType: 'text',
    })
  }

  async getYearCalendarEvents(year: number): Promise<YearCalendar> {
    return this.client.get<YearCalendar>(this.url.CALENDAR_YEAR(year))
  }

  async getMonthCalendarEvents(year: number, month: number): Promise<MonthCalendar> {
    return this.client.get<MonthCalendar>(this.url.CALENDAR_MONTH(year, month))
  }

  async getWeekCalendarEvents(
    year: number,
    month: number,
    day: number,
    firstDayOfWeek?: number,
  ): Promise<unknown> {
    return this.client.get(this.url.CALENDAR_WEEK(year, month, day, firstDayOfWeek))
  }

  async renameActivity(activityId: GCActivityId, newName: string): Promise<void> {
    if (!activityId)
      throw new Error('Missing activityId')
    if (!newName)
      throw new Error('Missing newName')

    await this.client.put<void>(this.url.ACTIVITY_BY_ID(activityId), {
      activityName: newName,
    })
  }

  async get<T>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.get(url, data as { params?: Record<string, unknown> })
    return response as T
  }

  async post<T>(url: string, data: unknown): Promise<T> {
    const response = await this.client.post<T>(url, data, {})
    return response as T
  }

  async put<T>(url: string, data: unknown): Promise<T> {
    const response = await this.client.put<T>(url, data, {})
    return response as T
  }
}
