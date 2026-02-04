import { existsSync, readFileSync } from 'fs'
import type {
  WatchDriver,
  WatchDevice,
  DownloadOptions,
  DownloadResult,
  Activity,
  MonitoringData,
  ActivityRecord,
  ActivityLap,
  SleepData,
  DailyHeartRate,
  DailySteps,
} from '../types'

export interface AppleDevice extends WatchDevice {
  type: 'apple'
}

/**
 * Apple Health export structure
 * Apple Watch data is exported via the Health app as an XML file
 */
interface HealthExportRecord {
  type: string
  sourceName: string
  unit: string
  value: string
  startDate: string
  endDate: string
  creationDate?: string
}

interface HealthExportWorkout {
  workoutActivityType: string
  duration: string
  durationUnit: string
  totalDistance: string
  totalDistanceUnit: string
  totalEnergyBurned: string
  totalEnergyBurnedUnit: string
  sourceName: string
  startDate: string
  endDate: string
  workoutEvents?: Array<{
    type: string
    date: string
  }>
  workoutRoute?: Array<{
    latitude: string
    longitude: string
    altitude: string
    timestamp: string
  }>
}

/**
 * Parse Apple Health export XML
 * Note: This is a simplified parser - full XML parsing would require a proper XML library
 */
function parseHealthExportXml(content: string): {
  workouts: HealthExportWorkout[]
  records: HealthExportRecord[]
} {
  const workouts: HealthExportWorkout[] = []
  const records: HealthExportRecord[] = []

  // Parse workouts
  const workoutRegex = /<Workout([^>]+)>/g
  let workoutMatch
  while ((workoutMatch = workoutRegex.exec(content)) !== null) {
    const attrs = parseAttributes(workoutMatch[1])
    workouts.push({
      workoutActivityType: attrs.workoutActivityType || '',
      duration: attrs.duration || '0',
      durationUnit: attrs.durationUnit || 'min',
      totalDistance: attrs.totalDistance || '0',
      totalDistanceUnit: attrs.totalDistanceUnit || 'km',
      totalEnergyBurned: attrs.totalEnergyBurned || '0',
      totalEnergyBurnedUnit: attrs.totalEnergyBurnedUnit || 'kcal',
      sourceName: attrs.sourceName || '',
      startDate: attrs.startDate || '',
      endDate: attrs.endDate || '',
    })
  }

  // Parse records (heart rate, steps, etc.)
  const recordRegex = /<Record([^>]+)\/>/g
  let recordMatch
  while ((recordMatch = recordRegex.exec(content)) !== null) {
    const attrs = parseAttributes(recordMatch[1])
    records.push({
      type: attrs.type || '',
      sourceName: attrs.sourceName || '',
      unit: attrs.unit || '',
      value: attrs.value || '0',
      startDate: attrs.startDate || '',
      endDate: attrs.endDate || '',
      creationDate: attrs.creationDate,
    })
  }

  return { workouts, records }
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const regex = /(\w+)="([^"]*)"/g
  let match
  while ((match = regex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

function parseAppleDate(dateStr: string): Date {
  // Apple Health dates are in format: 2024-01-15 10:30:00 -0800
  return new Date(dateStr.replace(' ', 'T').replace(' ', ''))
}

function mapAppleSport(activityType: string): Activity['sport'] {
  const sportMap: Record<string, Activity['sport']> = {
    HKWorkoutActivityTypeRunning: 'running',
    HKWorkoutActivityTypeCycling: 'cycling',
    HKWorkoutActivityTypeSwimming: 'swimming',
    HKWorkoutActivityTypeHiking: 'hiking',
    HKWorkoutActivityTypeWalking: 'walking',
    HKWorkoutActivityTypeFunctionalStrengthTraining: 'strength_training',
    HKWorkoutActivityTypeTraditionalStrengthTraining: 'strength_training',
    HKWorkoutActivityTypeYoga: 'yoga',
    HKWorkoutActivityTypeCrossTraining: 'cardio',
    HKWorkoutActivityTypeElliptical: 'cardio',
    HKWorkoutActivityTypeRowing: 'cardio',
    HKWorkoutActivityTypeStairClimbing: 'cardio',
  }

  return sportMap[activityType] || 'other'
}

export class AppleDriver implements WatchDriver {
  readonly name = 'Apple'
  readonly type = 'apple' as const

  async detectDevices(): Promise<AppleDevice[]> {
    // Apple Watch doesn't mount as a USB device
    // Data is accessed through Health app export
    return []
  }

  async downloadData(_device: WatchDevice, _options: DownloadOptions = {}): Promise<DownloadResult> {
    // Apple Watch data must be exported via Health app
    return {
      device: _device,
      activities: [],
      monitoring: new Map(),
      rawFiles: [],
      errors: [new Error('Apple Watch data must be imported from Health app export. Use parseHealthExport() instead.')],
    }
  }

  /**
   * Parse an Apple Health export file
   * Export from Health app: Profile > Export All Health Data
   */
  async parseHealthExport(exportPath: string): Promise<{
    activities: Activity[]
    monitoring: Map<string, MonitoringData>
  }> {
    const exportXmlPath = existsSync(exportPath)
      ? exportPath
      : `${exportPath}/apple_health_export/export.xml`

    if (!existsSync(exportXmlPath)) {
      throw new Error(`Health export not found at ${exportXmlPath}`)
    }

    const content = readFileSync(exportXmlPath, 'utf-8')
    const { workouts, records } = parseHealthExportXml(content)

    // Convert workouts to activities
    const activities: Activity[] = workouts
      .filter(w => w.sourceName.includes('Watch'))
      .map(w => this.workoutToActivity(w))

    // Group records by date for monitoring data
    const monitoring = new Map<string, MonitoringData>()

    // Process heart rate records
    const hrRecords = records.filter(r => r.type === 'HKQuantityTypeIdentifierHeartRate')
    const hrByDate = new Map<string, Array<{ timestamp: Date; heartRate: number }>>()

    for (const hr of hrRecords) {
      const date = parseAppleDate(hr.startDate)
      const dateKey = date.toISOString().slice(0, 10)
      const samples = hrByDate.get(dateKey) || []
      samples.push({
        timestamp: date,
        heartRate: parseInt(hr.value, 10),
      })
      hrByDate.set(dateKey, samples)
    }

    for (const [dateKey, samples] of hrByDate) {
      const existing = monitoring.get(dateKey) || {}
      const hrValues = samples.map(s => s.heartRate)
      existing.heartRate = {
        date: new Date(dateKey),
        minHeartRate: Math.min(...hrValues),
        maxHeartRate: Math.max(...hrValues),
        avgHeartRate: Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length),
        samples,
      }
      monitoring.set(dateKey, existing)
    }

    // Process step records
    const stepRecords = records.filter(r => r.type === 'HKQuantityTypeIdentifierStepCount')
    const stepsByDate = new Map<string, number>()

    for (const step of stepRecords) {
      const date = parseAppleDate(step.startDate)
      const dateKey = date.toISOString().slice(0, 10)
      const current = stepsByDate.get(dateKey) || 0
      stepsByDate.set(dateKey, current + parseInt(step.value, 10))
    }

    for (const [dateKey, totalSteps] of stepsByDate) {
      const existing = monitoring.get(dateKey) || {}
      existing.steps = {
        date: new Date(dateKey),
        totalSteps,
        goal: 10000, // Default Apple goal
        distance: 0,
        calories: 0,
        activeMinutes: 0,
      }
      monitoring.set(dateKey, existing)
    }

    return { activities, monitoring }
  }

  private workoutToActivity(workout: HealthExportWorkout): Activity {
    const startTime = parseAppleDate(workout.startDate)
    const endTime = parseAppleDate(workout.endDate)

    // Convert duration based on unit
    let durationSec = parseFloat(workout.duration)
    if (workout.durationUnit === 'min') {
      durationSec *= 60
    } else if (workout.durationUnit === 'hr') {
      durationSec *= 3600
    }

    // Convert distance based on unit
    let distanceM = parseFloat(workout.totalDistance)
    if (workout.totalDistanceUnit === 'km') {
      distanceM *= 1000
    } else if (workout.totalDistanceUnit === 'mi') {
      distanceM *= 1609.34
    }

    // Convert calories
    let calories = parseFloat(workout.totalEnergyBurned)
    if (workout.totalEnergyBurnedUnit === 'kJ') {
      calories /= 4.184
    }

    return {
      id: `apple_${startTime.getTime()}`,
      sport: mapAppleSport(workout.workoutActivityType),
      startTime,
      endTime,
      totalElapsedTime: durationSec,
      totalTimerTime: durationSec,
      totalDistance: distanceM,
      totalCalories: Math.round(calories),
      laps: [],
      records: [],
      source: 'garmin',
    }
  }

  async parseActivityFile(_filePath: string): Promise<Activity | null> {
    throw new Error('Apple Watch activities must be imported via Health export')
  }

  async parseMonitoringFile(_filePath: string): Promise<MonitoringData> {
    throw new Error('Apple Watch monitoring data must be imported via Health export')
  }
}

export function createAppleDriver(): AppleDriver {
  return new AppleDriver()
}
