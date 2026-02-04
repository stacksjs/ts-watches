// ============================================================================
// Configuration Types
// ============================================================================

export interface WatchConfig {
  verbose: boolean
  outputDir: string
  watchPaths: string[]
}

export type WatchOptions = Partial<WatchConfig>

// ============================================================================
// Device Types
// ============================================================================

export interface WatchDevice {
  name: string
  path: string
  type: 'garmin' | 'apple' | 'samsung' | 'fitbit' | 'unknown'
  serial?: string
  model?: string
  firmware?: string
}

export interface GarminDevice extends WatchDevice {
  type: 'garmin'
  unitId?: string
  partNumber?: string
}

// ============================================================================
// FIT File Types (Garmin's Flexible and Interoperable Data Transfer protocol)
// ============================================================================

export interface FitFileHeader {
  headerSize: number
  protocolVersion: number
  profileVersion: number
  dataSize: number
  dataType: string
  crc?: number
}

export interface FitField {
  fieldDefNum: number
  size: number
  baseType: number
}

export interface FitDefinitionMessage {
  reserved: number
  arch: 'little' | 'big'
  globalMsgNum: number
  numFields: number
  fields: FitField[]
}

export interface FitDataMessage {
  globalMsgNum: number
  fields: Map<number, unknown>
}

export interface FitRecord {
  type: 'definition' | 'data'
  localMsgType: number
  message: FitDefinitionMessage | FitDataMessage
}

// ============================================================================
// Activity Types
// ============================================================================

export type SportType =
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'hiking'
  | 'walking'
  | 'strength_training'
  | 'cardio'
  | 'yoga'
  | 'other'
  | 'generic'

export type SubSportType =
  | 'generic'
  | 'treadmill'
  | 'street'
  | 'trail'
  | 'track'
  | 'spin'
  | 'indoor_cycling'
  | 'road'
  | 'mountain'
  | 'gravel'
  | 'lap_swimming'
  | 'open_water'
  | 'other'

export interface GeoPosition {
  lat: number
  lng: number
  altitude?: number
}

export interface HeartRateZone {
  zone: number
  min: number
  max: number
  timeInZone: number // seconds
}

export interface ActivityLap {
  startTime: Date
  endTime: Date
  totalElapsedTime: number // seconds
  totalTimerTime: number // seconds
  totalDistance: number // meters
  totalCalories: number
  avgHeartRate?: number
  maxHeartRate?: number
  avgSpeed?: number // m/s
  maxSpeed?: number // m/s
  avgCadence?: number
  maxCadence?: number
  avgPower?: number // watts
  maxPower?: number // watts
  totalAscent?: number // meters
  totalDescent?: number // meters
  startPosition?: GeoPosition
  endPosition?: GeoPosition
}

export interface ActivityRecord {
  timestamp: Date
  position?: GeoPosition
  heartRate?: number
  cadence?: number
  speed?: number // m/s
  power?: number // watts
  altitude?: number // meters
  distance?: number // meters
  temperature?: number // celsius
  grade?: number // percent
  calories?: number
}

export interface Activity {
  id: string
  name?: string
  sport: SportType
  subSport?: SubSportType
  startTime: Date
  endTime: Date
  totalElapsedTime: number // seconds
  totalTimerTime: number // seconds
  totalDistance: number // meters
  totalCalories: number
  avgHeartRate?: number
  maxHeartRate?: number
  avgSpeed?: number // m/s
  maxSpeed?: number // m/s
  avgCadence?: number
  maxCadence?: number
  avgPower?: number // watts
  maxPower?: number // watts
  normalizedPower?: number // watts
  totalAscent?: number // meters
  totalDescent?: number // meters
  trainingStressScore?: number
  intensityFactor?: number
  heartRateZones?: HeartRateZone[]
  laps: ActivityLap[]
  records: ActivityRecord[]
  source: 'garmin' | 'manual' | 'import'
  rawFilePath?: string
}

// ============================================================================
// Health & Monitoring Types
// ============================================================================

export interface DailyHeartRate {
  date: Date
  restingHeartRate?: number
  minHeartRate?: number
  maxHeartRate?: number
  avgHeartRate?: number
  samples: Array<{ timestamp: Date; heartRate: number }>
}

export interface SleepStage {
  stage: 'awake' | 'light' | 'deep' | 'rem'
  startTime: Date
  endTime: Date
}

export interface SleepData {
  date: Date
  startTime: Date
  endTime: Date
  totalSleepTime: number // minutes
  deepSleepTime: number // minutes
  lightSleepTime: number // minutes
  remSleepTime: number // minutes
  awakeTime: number // minutes
  sleepScore?: number
  stages: SleepStage[]
  avgHeartRate?: number
  avgSpO2?: number
  avgRespirationRate?: number
}

export interface StressData {
  date: Date
  avgStressLevel: number // 0-100
  maxStressLevel: number
  restStressDuration: number // minutes
  lowStressDuration: number // minutes
  mediumStressDuration: number // minutes
  highStressDuration: number // minutes
  samples: Array<{ timestamp: Date; stressLevel: number }>
}

export interface BodyBattery {
  date: Date
  startLevel: number
  endLevel: number
  chargedValue: number
  drainedValue: number
  samples: Array<{ timestamp: Date; level: number }>
}

export interface DailySteps {
  date: Date
  totalSteps: number
  goal: number
  distance: number // meters
  calories: number
  activeMinutes: number
  floorsClimbed?: number
}

export interface SpO2Data {
  date: Date
  avgSpO2: number
  minSpO2: number
  maxSpO2: number
  samples: Array<{ timestamp: Date; spO2: number }>
}

export interface RespirationData {
  date: Date
  avgRespirationRate: number // breaths per minute
  minRespirationRate: number
  maxRespirationRate: number
  samples: Array<{ timestamp: Date; respirationRate: number }>
}

export interface HRVData {
  date: Date
  weeklyAverage?: number
  lastNightAverage?: number
  status?: 'low' | 'unbalanced' | 'balanced' | 'high'
  baseline?: number
  samples: Array<{ timestamp: Date; hrv: number }>
}

// ============================================================================
// Aggregate Types
// ============================================================================

export interface MonitoringData {
  heartRate?: DailyHeartRate
  sleep?: SleepData
  stress?: StressData
  bodyBattery?: BodyBattery
  steps?: DailySteps
  spO2?: SpO2Data
  respiration?: RespirationData
  hrv?: HRVData
}

export interface DownloadResult {
  device: WatchDevice
  activities: Activity[]
  monitoring: Map<string, MonitoringData> // keyed by date string YYYY-MM-DD
  rawFiles: string[]
  errors: Error[]
}

// ============================================================================
// Driver Interface
// ============================================================================

export interface WatchDriver {
  readonly name: string
  readonly type: WatchDevice['type']

  detectDevices(): Promise<WatchDevice[]>
  downloadData(device: WatchDevice, options?: DownloadOptions): Promise<DownloadResult>
  parseActivityFile(filePath: string): Promise<Activity>
  parseMonitoringFile(filePath: string): Promise<MonitoringData>
}

export interface DownloadOptions {
  outputDir?: string
  includeActivities?: boolean
  includeMonitoring?: boolean
  since?: Date
  until?: Date
  copyRawFiles?: boolean
}
