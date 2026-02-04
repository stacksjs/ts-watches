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

export interface TPWorkout {
  Id: number
  AthleteId: number
  WorkoutDay: string
  Title: string
  Description?: string
  CoachComments?: string
  AthleteComments?: string
  WorkoutType: TPWorkoutType
  Completed: boolean
  CompletedDate?: string
  // Planned metrics
  TotalTimePlanned?: number
  DistancePlanned?: number
  TssPlanned?: number
  IfPlanned?: number
  // Actual metrics
  TotalTime?: number
  TimePaused?: number
  Distance?: number
  EnergyKj?: number
  Calories?: number
  // Heart rate
  HeartRateAverage?: number
  HeartRateMinimum?: number
  HeartRateMaximum?: number
  // Power
  PowerAverage?: number
  PowerMaximum?: number
  PowerNormalized?: number
  IntensityFactor?: number
  TssActual?: number
  // Cadence
  CadenceAverage?: number
  CadenceMaximum?: number
  // Speed
  VelocityAverage?: number
  VelocityMaximum?: number
  // Elevation
  ElevationGain?: number
  ElevationLoss?: number
  ElevationMinimum?: number
  ElevationMaximum?: number
  // Temperature
  TemperatureAverage?: number
  TemperatureMinimum?: number
  TemperatureMaximum?: number
  // Other
  Structure?: TPWorkoutStructure
  Tags?: string[]
  Source?: string
}

export interface TPWorkoutStructure {
  PrimaryLengthMetric?: string
  PrimaryIntensityMetric?: string
  Steps?: TPWorkoutStep[]
}

export interface TPWorkoutStep {
  Name?: string
  Length?: TPWorkoutStepLength
  Targets?: TPWorkoutStepTarget[]
  StepType?: string
  Steps?: TPWorkoutStep[]
}

export interface TPWorkoutStepLength {
  Value: number
  Unit: string
}

export interface TPWorkoutStepTarget {
  IntensityMetric: string
  MinValue?: number
  MaxValue?: number
  Unit?: string
}

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
  Structure?: TPWorkoutStructure
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
