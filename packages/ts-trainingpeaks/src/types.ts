export interface TPCredentials {
  username: string
  password: string
}

export interface TPTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  userId?: number
  accountType?: 'athlete' | 'coach'
}

export interface TPCookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: Date
  secure?: boolean
  httpOnly?: boolean
}

export interface TPAthlete {
  Id: number
  UserId?: number
  FirstName: string
  LastName: string
  Email?: string
  DateOfBirth?: string
  Gender?: string
  City?: string
  State?: string
  Country?: string
  Weight?: number
  ProfilePhotoUrl?: string
  IsCoach?: boolean
  IsPremium?: boolean
  ThresholdPower?: number
  ThresholdHeartRate?: number
  ThresholdPace?: number
}

export interface TPCoachAthlete extends TPAthlete {
  AthleteId: number
  CoachId: number
  Status: string
  LastActivity?: string
  CompliancePercent?: number
}

export interface TPAthleteGroup {
  id: number
  coachId: number
  name: string
  athleteIds: number[]
  isDefault: boolean
}

export interface TPWorkout {
  workoutId: number
  athleteId: number
  workoutDay: string
  title: string
  description?: string
  coachComments?: string
  workoutComments?: unknown[]
  workoutTypeValueId: number
  completed: boolean | null
  // Planned metrics
  totalTimePlanned?: number
  distancePlanned?: number
  tssPlanned?: number
  ifPlanned?: number
  velocityPlanned?: number
  caloriesPlanned?: number
  energyPlanned?: number
  elevationGainPlanned?: number
  // Actual metrics
  totalTime?: number
  distance?: number
  energy?: number
  calories?: number
  // Heart rate
  heartRateAverage?: number
  heartRateMinimum?: number
  heartRateMaximum?: number
  // Power
  powerAverage?: number
  powerMaximum?: number
  normalizedPowerActual?: number
  normalizedSpeedActual?: number
  if?: number
  tssActual?: number
  // Cadence
  cadenceAverage?: number
  cadenceMaximum?: number
  // Speed
  velocityAverage?: number
  velocityMaximum?: number
  // Elevation
  elevationGain?: number
  elevationLoss?: number
  elevationMinimum?: number
  elevationAverage?: number
  elevationMaximum?: number
  // Temperature
  tempMin?: number
  tempAvg?: number
  tempMax?: number
  // RPE/Feeling
  rpe?: number
  feeling?: number
  // Compliance
  complianceDurationPercent?: number
  complianceDistancePercent?: number
  complianceTssPercent?: number
  // Other
  structure?: TPWorkoutStructureResponse
  userTags?: string[] | null
  syncedTo?: string[]
  orderOnDay?: number
  personalRecordCount?: number
  lastModifiedDate?: string
  isLocked?: boolean | null
  startTime?: string | null
  startTimePlanned?: string | null
  sharedWorkoutInformationKey?: string
  publicSettingValue?: number
  code?: string | null
  equipmentBikeId?: number | null
  equipmentShoeId?: number | null
  poolLengthOptionId?: number | null
  workoutSubTypeId?: number | null
  workoutDeviceSource?: string | null
}

export interface TPWorkoutStructureResponse {
  structure: TPWorkoutStructureStep[]
  polyline?: number[][]
  primaryLengthMetric?: string
  primaryIntensityMetric?: string
  primaryIntensityTargetOrRange?: string
}

export interface TPWorkoutStructureStep {
  type: 'step' | 'repetition'
  name?: string
  length: {
    value: number
    unit: string
  }
  steps?: TPWorkoutStructureStep[]
  targets?: {
    minValue?: number
    maxValue?: number
  }[]
  intensityClass?: string
  openDuration?: boolean
  begin?: number
  end?: number
}

// Workout type IDs returned by API
export const TPWorkoutTypeIds = {
  Swim: 1,
  Bike: 2,
  Run: 3,
  Brick: 4,
  XTrain: 5,
  Strength: 6,
  Custom: 7,
  Walk: 8,
  Hike: 9,
  Row: 10,
  Ski: 11,
  Other: 100,
} as const

export type TPWorkoutTypeId = typeof TPWorkoutTypeIds[keyof typeof TPWorkoutTypeIds]

export type TPWorkoutType =
  | 'Swim'
  | 'Bike'
  | 'Run'
  | 'Brick'
  | 'XTrain'
  | 'Strength'
  | 'Custom'
  | 'Walk'
  | 'Hike'
  | 'Row'
  | 'Ski'
  | 'Other'

export function getWorkoutTypeName(typeId: number): TPWorkoutType {
  const map: Record<number, TPWorkoutType> = {
    1: 'Swim',
    2: 'Bike',
    3: 'Run',
    4: 'Brick',
    5: 'XTrain',
    6: 'Strength',
    7: 'Custom',
    8: 'Walk',
    9: 'Hike',
    10: 'Row',
    11: 'Ski',
  }
  return map[typeId] || 'Other'
}

export interface TPDailySummary {
  Date: string
  TssTotal?: number
  DurationTotal?: number
  DistanceTotal?: number
  CaloriesTotal?: number
  WorkoutsPlanned?: number
  WorkoutsCompleted?: number
  CompliancePercent?: number
}

export interface TPMetrics {
  Date: string
  Weight?: number
  RestingHeartRate?: number
  HrvRmssd?: number
  SleepHours?: number
  SleepQuality?: number
  Fatigue?: number
  Mood?: number
  Motivation?: number
  Stress?: number
  Soreness?: number
  Injury?: number
  Steps?: number
  CaloriesConsumed?: number
  Comments?: string
}

export interface TPCalendarDay {
  Date: string
  Workouts: TPWorkout[]
  Metrics?: TPMetrics
  Notes?: string[]
}

export interface TPPerformanceChart {
  StartDate: string
  EndDate: string
  Ctl: number[]  // Chronic Training Load (fitness)
  Atl: number[]  // Acute Training Load (fatigue)
  Tsb: number[]  // Training Stress Balance (form)
  Tss: number[]  // Training Stress Score
}

export interface TPActivityFile {
  Id: number
  FileName: string
  FileType: string
  UploadDate: string
  ProcessedDate?: string
  Status: string
  WorkoutId?: number
}

export interface TPUploadResult {
  Success: boolean
  FileId?: number
  WorkoutId?: number
  Message?: string
  Errors?: string[]
}

export interface TPSearchParams {
  startDate?: Date
  endDate?: Date
  workoutTypes?: TPWorkoutType[]
  completed?: boolean
  limit?: number
  offset?: number
}

export interface TPLibraryWorkout {
  Id: number
  Title: string
  Description?: string
  WorkoutType: TPWorkoutType
  Duration?: number
  Distance?: number
  Tss?: number
  Structure?: TPWorkoutStructureResponse
  Tags?: string[]
  IsPublic?: boolean
  CreatedDate?: string
  ModifiedDate?: string
}

export interface TPPlan {
  Id: number
  Name: string
  Description?: string
  StartDate?: string
  EndDate?: string
  AthleteId?: number
  CoachId?: number
  Status: string
  Weeks?: TPPlanWeek[]
}

export interface TPPlanWeek {
  WeekNumber: number
  StartDate: string
  EndDate: string
  Description?: string
  PlannedTss?: number
  PlannedDuration?: number
}
