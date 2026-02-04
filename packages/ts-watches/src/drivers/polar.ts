import { existsSync, readdirSync, statSync, readFileSync, mkdirSync, copyFileSync } from 'fs'
import { join, extname } from 'path'
import type {
  WatchDriver,
  WatchDevice,
  DownloadOptions,
  DownloadResult,
  Activity,
  MonitoringData,
  ActivityRecord,
  ActivityLap,
} from '../types'

const VOLUMES_PATH = '/Volumes'

const POLAR_VOLUME_PATTERNS = ['POLAR', 'VANTAGE', 'GRIT', 'IGNITE', 'PACER', 'UNITE']

export interface PolarDevice extends WatchDevice {
  type: 'polar'
  deviceId?: string
}

/**
 * Polar HRM file parser
 * HRM is a text-based format used by older Polar devices
 */
function parseHrmFile(content: string): Activity | null {
  const lines = content.split('\n').map(l => l.trim())
  const sections: Map<string, string[]> = new Map()

  let currentSection = ''
  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1)
      sections.set(currentSection, [])
    } else if (currentSection && line) {
      sections.get(currentSection)?.push(line)
    }
  }

  const params = sections.get('Params') || []
  const hrData = sections.get('HRData') || []

  if (params.length === 0) return null

  // Parse parameters
  const paramMap = new Map<string, string>()
  for (const param of params) {
    const [key, value] = param.split('=')
    if (key && value) {
      paramMap.set(key.trim(), value.trim())
    }
  }

  const dateStr = paramMap.get('Date')
  const startTimeStr = paramMap.get('StartTime')
  const interval = parseInt(paramMap.get('Interval') || '1', 10)
  const length = paramMap.get('Length')

  if (!dateStr || !startTimeStr) return null

  // Parse date (YYYYMMDD format)
  const year = parseInt(dateStr.slice(0, 4), 10)
  const month = parseInt(dateStr.slice(4, 6), 10) - 1
  const day = parseInt(dateStr.slice(6, 8), 10)

  // Parse time (HH:MM:SS.s format)
  const [hours, minutes, secondsPart] = startTimeStr.split(':')
  const seconds = parseFloat(secondsPart || '0')

  const startTime = new Date(year, month, day, parseInt(hours, 10), parseInt(minutes, 10), Math.floor(seconds))

  // Parse duration
  let totalTimerTime = 0
  if (length) {
    const [dh, dm, ds] = length.split(':').map(Number)
    totalTimerTime = dh * 3600 + dm * 60 + ds
  }

  // Parse heart rate data
  const records: ActivityRecord[] = []
  let timestamp = new Date(startTime)

  for (const line of hrData) {
    const values = line.split('\t').map(v => parseInt(v, 10))
    const hr = values[0]

    if (hr > 0) {
      records.push({
        timestamp: new Date(timestamp),
        heartRate: hr,
        speed: values[1] ? values[1] / 10 : undefined, // Speed in 0.1 km/h
        cadence: values[2],
        altitude: values[3],
        power: values[4],
      })
    }

    timestamp = new Date(timestamp.getTime() + interval * 1000)
  }

  // Calculate summary stats
  const hrValues = records.filter(r => r.heartRate).map(r => r.heartRate!)
  const avgHr = hrValues.length > 0 ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : undefined
  const maxHr = hrValues.length > 0 ? Math.max(...hrValues) : undefined

  return {
    id: `polar_${startTime.getTime()}`,
    sport: 'other',
    startTime,
    endTime: new Date(startTime.getTime() + totalTimerTime * 1000),
    totalElapsedTime: totalTimerTime,
    totalTimerTime,
    totalDistance: 0,
    totalCalories: parseInt(paramMap.get('Calories') || '0', 10),
    avgHeartRate: avgHr,
    maxHeartRate: maxHr,
    laps: [],
    records,
    source: 'garmin',
  }
}

/**
 * Parse Polar JSON export format
 */
function parsePolarJson(content: string): Activity | null {
  try {
    const data = JSON.parse(content)

    if (!data.startTime) return null

    const startTime = new Date(data.startTime)
    const endTime = data.stopTime ? new Date(data.stopTime) : new Date(startTime.getTime() + (data.duration || 0))

    const records: ActivityRecord[] = []

    // Parse samples if available
    if (data.samples) {
      for (const sample of data.samples) {
        records.push({
          timestamp: new Date(sample.dateTime || startTime),
          heartRate: sample.heartRate,
          speed: sample.speed,
          cadence: sample.cadence,
          altitude: sample.altitude,
          distance: sample.distance,
          power: sample.power,
          position: sample.latitude && sample.longitude ? {
            lat: sample.latitude,
            lng: sample.longitude,
            altitude: sample.altitude,
          } : undefined,
        })
      }
    }

    // Parse laps
    const laps: ActivityLap[] = []
    if (data.laps) {
      for (const lap of data.laps) {
        laps.push({
          startTime: new Date(lap.startTime || startTime),
          endTime: new Date(lap.stopTime || endTime),
          totalElapsedTime: lap.duration || 0,
          totalTimerTime: lap.duration || 0,
          totalDistance: lap.distance || 0,
          totalCalories: lap.calories || 0,
          avgHeartRate: lap.heartRate?.average,
          maxHeartRate: lap.heartRate?.maximum,
          avgSpeed: lap.speed?.average,
          maxSpeed: lap.speed?.maximum,
          avgCadence: lap.cadence?.average,
          maxCadence: lap.cadence?.maximum,
        })
      }
    }

    return {
      id: `polar_${data.id || startTime.getTime()}`,
      name: data.name,
      sport: mapPolarSport(data.sport),
      startTime,
      endTime,
      totalElapsedTime: data.duration || (endTime.getTime() - startTime.getTime()) / 1000,
      totalTimerTime: data.duration || (endTime.getTime() - startTime.getTime()) / 1000,
      totalDistance: data.distance || 0,
      totalCalories: data.calories || 0,
      avgHeartRate: data.heartRate?.average,
      maxHeartRate: data.heartRate?.maximum,
      avgSpeed: data.speed?.average,
      maxSpeed: data.speed?.maximum,
      avgCadence: data.cadence?.average,
      maxCadence: data.cadence?.maximum,
      avgPower: data.power?.average,
      maxPower: data.power?.maximum,
      totalAscent: data.ascent,
      totalDescent: data.descent,
      laps,
      records,
      source: 'garmin',
    }
  } catch {
    return null
  }
}

function mapPolarSport(sport?: string): Activity['sport'] {
  if (!sport) return 'other'

  const sportMap: Record<string, Activity['sport']> = {
    RUNNING: 'running',
    CYCLING: 'cycling',
    SWIMMING: 'swimming',
    WALKING: 'walking',
    HIKING: 'hiking',
    STRENGTH_TRAINING: 'strength_training',
    OTHER: 'other',
  }

  return sportMap[sport.toUpperCase()] || 'other'
}

export class PolarDriver implements WatchDriver {
  readonly name = 'Polar'
  readonly type = 'polar' as const

  async detectDevices(): Promise<PolarDevice[]> {
    const devices: PolarDevice[] = []

    if (!existsSync(VOLUMES_PATH)) return devices

    const volumes = readdirSync(VOLUMES_PATH)

    for (const volume of volumes) {
      const volumePath = join(VOLUMES_PATH, volume)

      try {
        if (!statSync(volumePath).isDirectory()) continue
      } catch {
        continue
      }

      const upperVolume = volume.toUpperCase()
      const isPolar = POLAR_VOLUME_PATTERNS.some(p => upperVolume.includes(p))

      if (isPolar) {
        devices.push({
          name: volume,
          path: volumePath,
          type: 'polar',
          model: volume,
        })
      }
    }

    return devices
  }

  async downloadData(device: WatchDevice, options: DownloadOptions = {}): Promise<DownloadResult> {
    const {
      outputDir = './polar-data',
      copyRawFiles = true,
    } = options

    const result: DownloadResult = {
      device,
      activities: [],
      monitoring: new Map(),
      rawFiles: [],
      errors: [],
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const downloadPath = join(outputDir, timestamp)

    if (copyRawFiles) {
      mkdirSync(downloadPath, { recursive: true })
    }

    // Look for HRM files
    const hrmFiles = this.findFiles(device.path, '.hrm')
    for (const file of hrmFiles) {
      try {
        const content = readFileSync(file, 'utf-8')
        const activity = parseHrmFile(content)
        if (activity) {
          activity.rawFilePath = file
          result.activities.push(activity)
        }

        if (copyRawFiles) {
          const destPath = join(downloadPath, file.split('/').pop()!)
          copyFileSync(file, destPath)
          result.rawFiles.push(destPath)
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err : new Error(String(err)))
      }
    }

    // Look for JSON exports
    const jsonFiles = this.findFiles(device.path, '.json')
    for (const file of jsonFiles) {
      try {
        const content = readFileSync(file, 'utf-8')
        const activity = parsePolarJson(content)
        if (activity) {
          activity.rawFilePath = file
          result.activities.push(activity)
        }

        if (copyRawFiles) {
          const destPath = join(downloadPath, file.split('/').pop()!)
          copyFileSync(file, destPath)
          result.rawFiles.push(destPath)
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err : new Error(String(err)))
      }
    }

    result.activities.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

    return result
  }

  async parseActivityFile(filePath: string): Promise<Activity | null> {
    const ext = extname(filePath).toLowerCase()

    if (ext === '.hrm') {
      const content = readFileSync(filePath, 'utf-8')
      return parseHrmFile(content)
    }

    if (ext === '.json') {
      const content = readFileSync(filePath, 'utf-8')
      return parsePolarJson(content)
    }

    throw new Error(`Unsupported file format: ${ext}`)
  }

  async parseMonitoringFile(_filePath: string): Promise<MonitoringData> {
    // Polar doesn't typically store monitoring data in the same way as Garmin
    return {}
  }

  private findFiles(dir: string, ext: string): string[] {
    const files: string[] = []

    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        const entryPath = join(dir, entry)
        try {
          const stat = statSync(entryPath)
          if (stat.isDirectory()) {
            files.push(...this.findFiles(entryPath, ext))
          } else if (entry.toLowerCase().endsWith(ext)) {
            files.push(entryPath)
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }

    return files
  }
}

export function createPolarDriver(): PolarDriver {
  return new PolarDriver()
}
