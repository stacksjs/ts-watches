export interface HydrationData {
  userId: number
  calendarDate: string
  valueInML: number
  goalInML: number
  sweatLossInML?: number
  activityIntakeInML?: number
  timestampLocal?: string
  lastEntryTimestampLocal?: string
}

export interface WaterIntake {
  id?: number
  userProfileId: number
  calendarDate: string
  valueInML: number
  timestampLocal?: string
}
