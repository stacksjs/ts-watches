import type { Activity, ActivityRecord } from '../types'

export interface PersonalRecord {
  type: RecordType
  value: number
  unit: string
  activityId: string
  activityName?: string
  date: Date
  sport: string
  previousRecord?: {
    value: number
    date: Date
  }
}

export type RecordType =
  | 'longest_distance'
  | 'longest_duration'
  | 'fastest_1k'
  | 'fastest_5k'
  | 'fastest_10k'
  | 'fastest_half_marathon'
  | 'fastest_marathon'
  | 'fastest_100m'
  | 'fastest_400m'
  | 'fastest_1_mile'
  | 'highest_avg_power'
  | 'highest_max_power'
  | 'highest_normalized_power'
  | 'highest_elevation_gain'
  | 'most_calories'
  | 'fastest_avg_pace'
  | 'highest_avg_hr'
  | 'highest_max_hr'
  | 'longest_moving_time'
  | 'best_20min_power'
  | 'best_1hr_power'
  | 'best_5min_power'
  | 'max_speed'

export interface RecordDefinition {
  type: RecordType
  label: string
  unit: string
  sports: string[]
  extractor: (activity: Activity, records?: ActivityRecord[]) => number | null
  comparator: 'higher' | 'lower'
  distanceMeters?: number
}

const RECORD_DEFINITIONS: RecordDefinition[] = [
  // Distance records
  {
    type: 'longest_distance',
    label: 'Longest Distance',
    unit: 'km',
    sports: ['running', 'cycling', 'swimming', 'hiking', 'walking'],
    extractor: (a) => a.totalDistance / 1000,
    comparator: 'higher',
  },
  {
    type: 'longest_duration',
    label: 'Longest Duration',
    unit: 'hours',
    sports: ['running', 'cycling', 'swimming', 'hiking', 'walking', 'strength_training'],
    extractor: (a) => a.totalTimerTime / 3600,
    comparator: 'higher',
  },
  {
    type: 'longest_moving_time',
    label: 'Longest Moving Time',
    unit: 'hours',
    sports: ['running', 'cycling', 'hiking'],
    extractor: (a) => a.totalTimerTime / 3600,
    comparator: 'higher',
  },

  // Running time records
  {
    type: 'fastest_1k',
    label: 'Fastest 1K',
    unit: 'min:sec',
    sports: ['running'],
    extractor: (a, r) => findFastestSplit(r || [], 1000),
    comparator: 'lower',
    distanceMeters: 1000,
  },
  {
    type: 'fastest_5k',
    label: 'Fastest 5K',
    unit: 'min:sec',
    sports: ['running'],
    extractor: (a, r) => findFastestSplit(r || [], 5000),
    comparator: 'lower',
    distanceMeters: 5000,
  },
  {
    type: 'fastest_10k',
    label: 'Fastest 10K',
    unit: 'min:sec',
    sports: ['running'],
    extractor: (a, r) => findFastestSplit(r || [], 10000),
    comparator: 'lower',
    distanceMeters: 10000,
  },
  {
    type: 'fastest_half_marathon',
    label: 'Fastest Half Marathon',
    unit: 'hours:min:sec',
    sports: ['running'],
    extractor: (a, r) => findFastestSplit(r || [], 21097.5),
    comparator: 'lower',
    distanceMeters: 21097.5,
  },
  {
    type: 'fastest_marathon',
    label: 'Fastest Marathon',
    unit: 'hours:min:sec',
    sports: ['running'],
    extractor: (a, r) => findFastestSplit(r || [], 42195),
    comparator: 'lower',
    distanceMeters: 42195,
  },
  {
    type: 'fastest_1_mile',
    label: 'Fastest Mile',
    unit: 'min:sec',
    sports: ['running'],
    extractor: (a, r) => findFastestSplit(r || [], 1609.34),
    comparator: 'lower',
    distanceMeters: 1609.34,
  },

  // Speed records
  {
    type: 'fastest_avg_pace',
    label: 'Fastest Avg Pace',
    unit: 'min/km',
    sports: ['running'],
    extractor: (a) => a.avgSpeed ? 1000 / a.avgSpeed / 60 : null,
    comparator: 'lower',
  },
  {
    type: 'max_speed',
    label: 'Max Speed',
    unit: 'km/h',
    sports: ['running', 'cycling'],
    extractor: (a) => a.maxSpeed ? a.maxSpeed * 3.6 : null,
    comparator: 'higher',
  },

  // Power records (cycling)
  {
    type: 'highest_avg_power',
    label: 'Highest Avg Power',
    unit: 'W',
    sports: ['cycling'],
    extractor: (a) => a.avgPower || null,
    comparator: 'higher',
  },
  {
    type: 'highest_max_power',
    label: 'Highest Max Power',
    unit: 'W',
    sports: ['cycling'],
    extractor: (a) => a.maxPower || null,
    comparator: 'higher',
  },
  {
    type: 'highest_normalized_power',
    label: 'Highest Normalized Power',
    unit: 'W',
    sports: ['cycling'],
    extractor: (a) => a.normalizedPower || null,
    comparator: 'higher',
  },
  {
    type: 'best_5min_power',
    label: 'Best 5min Power',
    unit: 'W',
    sports: ['cycling'],
    extractor: (a, r) => findBestPowerForDuration(r || [], 5 * 60),
    comparator: 'higher',
  },
  {
    type: 'best_20min_power',
    label: 'Best 20min Power',
    unit: 'W',
    sports: ['cycling'],
    extractor: (a, r) => findBestPowerForDuration(r || [], 20 * 60),
    comparator: 'higher',
  },
  {
    type: 'best_1hr_power',
    label: 'Best 1hr Power',
    unit: 'W',
    sports: ['cycling'],
    extractor: (a, r) => findBestPowerForDuration(r || [], 60 * 60),
    comparator: 'higher',
  },

  // Heart rate records
  {
    type: 'highest_avg_hr',
    label: 'Highest Avg HR',
    unit: 'bpm',
    sports: ['running', 'cycling', 'swimming'],
    extractor: (a) => a.avgHeartRate || null,
    comparator: 'higher',
  },
  {
    type: 'highest_max_hr',
    label: 'Highest Max HR',
    unit: 'bpm',
    sports: ['running', 'cycling', 'swimming'],
    extractor: (a) => a.maxHeartRate || null,
    comparator: 'higher',
  },

  // Other records
  {
    type: 'highest_elevation_gain',
    label: 'Highest Elevation Gain',
    unit: 'm',
    sports: ['running', 'cycling', 'hiking'],
    extractor: (a) => a.totalAscent || null,
    comparator: 'higher',
  },
  {
    type: 'most_calories',
    label: 'Most Calories',
    unit: 'kcal',
    sports: ['running', 'cycling', 'swimming', 'strength_training'],
    extractor: (a) => a.totalCalories || null,
    comparator: 'higher',
  },
]

function findFastestSplit(records: ActivityRecord[], distanceMeters: number): number | null {
  if (records.length < 2) return null

  // Find records with distance data
  const withDistance = records.filter(r => r.distance != null)
  if (withDistance.length < 2) return null

  let fastestTime = Infinity

  for (let i = 0; i < withDistance.length; i++) {
    const startRecord = withDistance[i]
    const startDistance = startRecord.distance!

    // Find end point that covers the required distance
    for (let j = i + 1; j < withDistance.length; j++) {
      const endRecord = withDistance[j]
      const endDistance = endRecord.distance!
      const splitDistance = endDistance - startDistance

      if (splitDistance >= distanceMeters) {
        const time = (endRecord.timestamp.getTime() - startRecord.timestamp.getTime()) / 1000

        // Interpolate if we overshot the distance
        if (splitDistance > distanceMeters && j > 0) {
          const prevRecord = withDistance[j - 1]
          const prevDistance = prevRecord.distance!
          const segmentDistance = endDistance - prevDistance
          const segmentTime = (endRecord.timestamp.getTime() - prevRecord.timestamp.getTime()) / 1000
          const overshoot = splitDistance - distanceMeters
          const adjustedTime = time - (overshoot / segmentDistance) * segmentTime
          fastestTime = Math.min(fastestTime, adjustedTime)
        }
        else {
          fastestTime = Math.min(fastestTime, time)
        }
        break
      }
    }
  }

  return fastestTime === Infinity ? null : fastestTime
}

function findBestPowerForDuration(records: ActivityRecord[], durationSeconds: number): number | null {
  const withPower = records.filter(r => r.power != null)
  if (withPower.length < 2) return null

  let bestAvgPower = 0

  for (let i = 0; i < withPower.length; i++) {
    const startTime = withPower[i].timestamp.getTime()
    let powerSum = 0
    let count = 0

    for (let j = i; j < withPower.length; j++) {
      const elapsed = (withPower[j].timestamp.getTime() - startTime) / 1000

      if (elapsed > durationSeconds) break

      powerSum += withPower[j].power!
      count++

      if (elapsed >= durationSeconds - 1) {
        const avgPower = powerSum / count
        bestAvgPower = Math.max(bestAvgPower, avgPower)
      }
    }
  }

  return bestAvgPower > 0 ? Math.round(bestAvgPower) : null
}

export class PersonalRecordsTracker {
  private records: Map<string, PersonalRecord> = new Map()

  constructor(existingRecords?: PersonalRecord[]) {
    if (existingRecords) {
      for (const record of existingRecords) {
        const key = `${record.sport}_${record.type}`
        this.records.set(key, record)
      }
    }
  }

  /**
   * Process an activity and check for new personal records
   */
  processActivity(activity: Activity): PersonalRecord[] {
    const newRecords: PersonalRecord[] = []

    for (const def of RECORD_DEFINITIONS) {
      if (!def.sports.includes(activity.sport)) continue

      const value = def.extractor(activity, activity.records)
      if (value == null) continue

      const key = `${activity.sport}_${def.type}`
      const existing = this.records.get(key)

      const isNewRecord = !existing || (
        def.comparator === 'higher'
          ? value > existing.value
          : value < existing.value
      )

      if (isNewRecord) {
        const newRecord: PersonalRecord = {
          type: def.type,
          value,
          unit: def.unit,
          activityId: activity.id,
          activityName: activity.name,
          date: activity.startTime,
          sport: activity.sport,
          previousRecord: existing ? {
            value: existing.value,
            date: existing.date,
          } : undefined,
        }

        this.records.set(key, newRecord)
        newRecords.push(newRecord)
      }
    }

    return newRecords
  }

  /**
   * Process multiple activities
   */
  processActivities(activities: Activity[]): PersonalRecord[] {
    // Sort by date to process in chronological order
    const sorted = [...activities].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    )

    const allNewRecords: PersonalRecord[] = []

    for (const activity of sorted) {
      const newRecords = this.processActivity(activity)
      allNewRecords.push(...newRecords)
    }

    return allNewRecords
  }

  /**
   * Get all current records
   */
  getAllRecords(): PersonalRecord[] {
    return Array.from(this.records.values())
  }

  /**
   * Get records for a specific sport
   */
  getRecordsForSport(sport: string): PersonalRecord[] {
    return Array.from(this.records.values()).filter(r => r.sport === sport)
  }

  /**
   * Get a specific record
   */
  getRecord(sport: string, type: RecordType): PersonalRecord | undefined {
    return this.records.get(`${sport}_${type}`)
  }

  /**
   * Format a record value for display
   */
  formatRecordValue(record: PersonalRecord): string {
    if (record.unit === 'min:sec') {
      const mins = Math.floor(record.value / 60)
      const secs = Math.round(record.value % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    if (record.unit === 'hours:min:sec') {
      const hours = Math.floor(record.value / 3600)
      const mins = Math.floor((record.value % 3600) / 60)
      const secs = Math.round(record.value % 60)
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    if (record.unit === 'min/km') {
      const mins = Math.floor(record.value)
      const secs = Math.round((record.value % 1) * 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    if (record.unit === 'hours') {
      return record.value.toFixed(2)
    }

    if (record.unit === 'km') {
      return record.value.toFixed(2)
    }

    return record.value.toString()
  }

  /**
   * Export records to JSON
   */
  toJSON(): PersonalRecord[] {
    return this.getAllRecords()
  }

  /**
   * Import records from JSON
   */
  static fromJSON(data: PersonalRecord[]): PersonalRecordsTracker {
    return new PersonalRecordsTracker(data.map(r => ({
      ...r,
      date: new Date(r.date),
      previousRecord: r.previousRecord ? {
        ...r.previousRecord,
        date: new Date(r.previousRecord.date),
      } : undefined,
    })))
  }
}

export function createPersonalRecordsTracker(existingRecords?: PersonalRecord[]): PersonalRecordsTracker {
  return new PersonalRecordsTracker(existingRecords)
}
