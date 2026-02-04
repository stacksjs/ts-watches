export interface StressData {
  userProfilePK: number
  calendarDate: string
  startTimestampGMT: string | null
  endTimestampGMT: string | null
  startTimestampLocal: string | null
  endTimestampLocal: string | null
  maxStressLevel: number | null
  avgStressLevel: number | null
  stressChartValueOffset: number | null
  stressChartYAxisOrigin: number | null
  stressValueDescriptorsDTOList: Array<{
    key: string
    index: number
  }>
  stressValuesArray: [number, number][]
}

export interface HrvSummary {
  calendarDate: string
  weeklyAvg: number
  lastNightAvg: number
  lastNight5MinHigh: number
  baseline: {
    lowUpper: number
    balancedLow: number
    balancedUpper: number
    markerValue: number
  }
  status: 'LOW' | 'BALANCED' | 'HIGH' | 'UNBALANCED'
  feedbackPhrase: string
  createTimeStamp: string
}

export interface HrvReading {
  hrvValue: number
  readingTimeGMT: string
  readingTimeLocal: string
}

export interface HrvData {
  userProfilePk: number
  hrvSummary: HrvSummary | null
  hrvReadings: HrvReading[]
}

export interface TrainingReadiness {
  userProfilePK: number
  calendarDate: string
  timestamp: string
  timestampLocal: string
  deviceId: number
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'PRIME'
  feedbackLong: string
  feedbackShort: string
  score: number
  sleepScore: number
  sleepScoreFactorPercent: number
  sleepScoreFactorFeedback: string
  recoveryTime: number
  recoveryTimeFactorPercent: number
  recoveryTimeFactorFeedback: string
  acwrFactorPercent: number
  acwrFactorFeedback: string
  acuteLoad: number
  stressHistoryFactorPercent: number
  stressHistoryFactorFeedback: string
  hrvFactorPercent: number
  hrvFactorFeedback: string
  hrvWeeklyAverage: number
  sleepHistoryFactorPercent?: number
  sleepHistoryFactorFeedback?: string
}

export interface BodyBatteryData {
  userProfilePK: number
  calendarDate: string
  startTimestampGMT: string
  endTimestampGMT: string
  startTimestampLocal: string
  endTimestampLocal: string
  charged: number
  drained: number
  bodyBatteryValueDescriptorsDTOList: Array<{
    key: string
    index: number
  }>
  bodyBatteryValuesArray: [number, number][]
}

export interface DailySummaryStats {
  calendarDate: string
  totalSteps: number
  stepGoal: number
  totalDistance: number
  floorsAscended: number
  floorsDescended: number
  floorsGoal: number
  activeCalories: number
  totalCalories: number
  bmrCalories: number
  moderateIntensityMinutes: number
  vigorousIntensityMinutes: number
  intensityMinutesGoal: number
  restingHeartRate: number
  minHeartRate: number
  maxHeartRate: number
  averageStressLevel: number
  maxStressLevel: number
  bodyBatteryChargedValue: number
  bodyBatteryDrainedValue: number
  bodyBatteryHighestValue: number
  bodyBatteryLowestValue: number
}
