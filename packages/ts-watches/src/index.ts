// Core exports
export * from './config'
export * from './types'

// FIT file parsing
export * from './fit'

// Device drivers
export * from './drivers'

// Data export
export * from './export'

// Cloud integrations
export * from './cloud'

// Analysis tools
export * from './analysis'

// Workout tools
export * from './workouts'

// Real-time data
export * from './realtime'

// Re-export commonly used types for convenience
export type {
  Activity,
  ActivityLap,
  ActivityRecord,
  MonitoringData,
  WatchDevice,
  GarminDevice,
  DownloadResult,
  DownloadOptions,
  WatchDriver,
  SleepData,
  StressData,
  HRVData,
  SpO2Data,
  DailyHeartRate,
  BodyBattery,
  DailySteps,
  GeoPosition,
  SportType,
  SubSportType,
} from './types'
