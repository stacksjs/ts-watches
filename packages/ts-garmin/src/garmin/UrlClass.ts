import type { GCActivityId, GCGearId, GCUserProfileId, GCWorkoutId, GarminDomain } from './types'

export class UrlClass {
  private domain: GarminDomain
  GC_MODERN: string
  GARMIN_SSO_ORIGIN: string
  GC_API: string

  constructor(domain: GarminDomain = 'garmin.com') {
    this.domain = domain
    this.GC_MODERN = `https://connect.${this.domain}/modern`
    this.GARMIN_SSO_ORIGIN = `https://sso.${this.domain}`
    this.GC_API = `https://connectapi.${this.domain}`
  }

  get GARMIN_SSO(): string {
    return `${this.GARMIN_SSO_ORIGIN}/sso`
  }

  get GARMIN_SSO_EMBED(): string {
    return `${this.GARMIN_SSO_ORIGIN}/sso/embed`
  }

  get BASE_URL(): string {
    return `${this.GC_MODERN}/proxy`
  }

  get SIGNIN_URL(): string {
    return `${this.GARMIN_SSO}/signin`
  }

  get LOGIN_URL(): string {
    return `${this.GARMIN_SSO}/login`
  }

  get OAUTH_URL(): string {
    return `${this.GC_API}/oauth-service/oauth`
  }

  get USER_SETTINGS(): string {
    return `${this.GC_API}/userprofile-service/userprofile/user-settings/`
  }

  get USER_PROFILE(): string {
    return `${this.GC_API}/userprofile-service/socialProfile`
  }

  get ACTIVITIES(): string {
    return `${this.GC_API}/activitylist-service/activities/search/activities`
  }

  get ACTIVITY(): string {
    return `${this.GC_API}/activity-service/activity/`
  }

  ACTIVITY_BY_ID(activityId: GCActivityId): string {
    return `${this.GC_API}/activity-service/activity/${activityId}`
  }

  get STAT_ACTIVITIES(): string {
    return `${this.GC_API}/fitnessstats-service/activity`
  }

  get DOWNLOAD_ZIP(): string {
    return `${this.GC_API}/download-service/files/activity/`
  }

  get DOWNLOAD_GPX(): string {
    return `${this.GC_API}/download-service/export/gpx/activity/`
  }

  get DOWNLOAD_TCX(): string {
    return `${this.GC_API}/download-service/export/tcx/activity/`
  }

  get DOWNLOAD_KML(): string {
    return `${this.GC_API}/download-service/export/kml/activity/`
  }

  get UPLOAD(): string {
    return `${this.GC_API}/upload-service/upload/`
  }

  get IMPORT_DATA(): string {
    return `${this.GC_API}/modern/import-data`
  }

  get DAILY_STEPS(): string {
    return `${this.GC_API}/usersummary-service/stats/steps/daily/`
  }

  get DAILY_SLEEP(): string {
    return `${this.GC_API}/sleep-service/sleep/dailySleepData`
  }

  get DAILY_WEIGHT(): string {
    return `${this.GC_API}/weight-service/weight/dayview`
  }

  get UPDATE_WEIGHT(): string {
    return `${this.GC_API}/weight-service/user-weight`
  }

  get DAILY_HYDRATION(): string {
    return `${this.GC_API}/usersummary-service/usersummary/hydration/allData`
  }

  get HYDRATION_LOG(): string {
    return `${this.GC_API}/usersummary-service/usersummary/hydration/log`
  }

  get GOLF_SCORECARD_SUMMARY(): string {
    return `${this.GC_API}/gcs-golfcommunity/api/v2/scorecard/summary`
  }

  get GOLF_SCORECARD_DETAIL(): string {
    return `${this.GC_API}/gcs-golfcommunity/api/v2/scorecard/detail`
  }

  get DAILY_HEART_RATE(): string {
    return `${this.GC_API}/wellness-service/wellness/dailyHeartRate`
  }

  WORKOUT(id?: GCWorkoutId): string {
    if (id) {
      return `${this.GC_API}/workout-service/workout/${id}`
    }
    return `${this.GC_API}/workout-service/workout`
  }

  get WORKOUTS(): string {
    return `${this.GC_API}/workout-service/workouts`
  }

  GEAR_OF_ACTIVITY(activityId: GCActivityId): string {
    return `${this.GC_API}/gear-service/gear/filterGear?activityId=${activityId}`
  }

  GEAR(userProfilePk: GCUserProfileId, availableGearDate?: string): string {
    return `${this.GC_API}/gear-service/gear/filterGear?userProfilePk=${userProfilePk}${availableGearDate ? `&availableGearDate=${availableGearDate}` : ''}`
  }

  LINK_GEAR_TO_ACTIVITY(activityId: GCActivityId, gearId: GCGearId): string {
    return `${this.GC_API}/gear-service/gear/link/${gearId}/activity/${activityId}`
  }

  UNLINK_GEAR_FROM_ACTIVITY(activityId: GCActivityId, gearId: GCGearId): string {
    return `${this.GC_API}/gear-service/gear/unlink/${gearId}/activity/${activityId}`
  }

  WORKOUTS_LIST(
    start = 1,
    limit = 999,
    myWorkoutsOnly = true,
    sharedWorkoutsOnly = false,
    orderBy = 'UPDATE_DATE',
    orderSeq: 'ASC' | 'DESC' = 'DESC',
    includeAtp = false,
  ): string {
    return `${this.GC_API}/workout-service/workouts?start=${start}&limit=${limit}&myWorkoutsOnly=${myWorkoutsOnly}&sharedWorkoutsOnly=${sharedWorkoutsOnly}&orderBy=${orderBy}&orderSeq=${orderSeq}&includeAtp=${includeAtp}`
  }

  SCHEDULE_WORKOUT(workoutId: number): string {
    return `${this.GC_API}/workout-service/schedule/${workoutId}`
  }

  get IMPORT_GPX_FILE(): string {
    return `${this.GC_API}/course-service/course/import`
  }

  EXPORT_COURSE_GPX_FILE(courseId: number): string {
    return `${this.GC_API}/course-service/course/gpx/${courseId}`
  }

  get CREATE_COURSE_GPX_FILE(): string {
    return `${this.GC_API}/course-service/course`
  }

  UPDATE_COURSE_GPX_FILE(courseId: number): string {
    return `${this.GC_API}/course-service/course/${courseId}`
  }

  get LIST_COURSES(): string {
    return `${this.GC_API}/web-gateway/course/owner/`
  }

  CALENDAR_YEAR(year: number): string {
    return `${this.GC_API}/calendar-service/year/${year}`
  }

  CALENDAR_MONTH(year: number, month: number): string {
    return `${this.GC_API}/calendar-service/year/${year}/month/${month}`
  }

  CALENDAR_WEEK(year: number, month: number, day: number, firstDateOfWeek = 1): string {
    return `${this.GC_API}/calendar-service/year/${year}/month/${month}/day/${day}/start/${firstDateOfWeek}`
  }
}
