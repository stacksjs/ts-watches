// Core exports
export * from './config'
export * from './types'

// FIT file parsing
export * from './fit'

// Device drivers
export * from './drivers'

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
} from './types'
