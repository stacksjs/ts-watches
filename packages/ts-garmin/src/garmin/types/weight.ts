export interface WeightData {
  startDate: string
  endDate: string
  dateWeightList: {
    samplePk: number
    date: number
    calendarDate: string
    weight: number
    bmi?: number
    bodyFatPercentage?: number
    bodyWater?: number
    boneMass?: number
    muscleMass?: number
    physiqueRating?: number
    visceralFat?: number
    metabolicAge?: number
    sourceType: string
    timestampGMT: number
    weightDelta?: number
  }[]
  totalAverage: {
    from: number
    until: number
    weight?: number
    bmi?: number
    bodyFatPercentage?: number
    bodyWater?: number
    boneMass?: number
    muscleMass?: number
    physiqueRating?: number
    visceralFat?: number
    metabolicAge?: number
  }
}

export interface UpdateWeight {
  samplePk: number
  date: number
  calendarDate: string
  weight: number
  bmi?: number
  bodyFatPercentage?: number
  bodyWater?: number
  boneMass?: number
  muscleMass?: number
  physiqueRating?: number
  visceralFat?: number
  metabolicAge?: number
  sourceType: string
  timestampGMT: number
}
