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

const SUUNTO_VOLUME_PATTERNS = ['SUUNTO', 'AMBIT', 'SPARTAN', 'SUUNTO 9', 'SUUNTO 7', 'SUUNTO 5', 'VERTICAL', 'RACE']

export interface SuuntoDevice extends WatchDevice {
  type: 'suunto'
}

/**
 * Parse Suunto SML (Suunto Markup Language) file
 * SML is an XML-based format
 */
function parseSmlFile(content: string): Activity | null {
  // Basic XML parsing without external dependencies
  const getTagContent = (xml: string, tag: string): string | null => {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
    const match = xml.match(regex)
    return match ? match[1].trim() : null
  }

  const getAllTagContents = (xml: string, tag: string): string[] => {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
    const matches: string[] = []
    let match
    while ((match = regex.exec(xml)) !== null) {
      matches.push(match[1].trim())
    }
    return matches
  }

  const header = getTagContent(content, 'Header')
  if (!header) return null

  const startTimeStr = getTagContent(header, 'DateTime')
  const duration = parseFloat(getTagContent(header, 'Duration') || '0')
  const distance = parseFloat(getTagContent(header, 'Distance') || '0')
  const calories = parseInt(getTagContent(header, 'Energy') || '0', 10) / 4184 // Convert from J to kcal
  const ascent = parseFloat(getTagContent(header, 'Ascent') || '0')
  const descent = parseFloat(getTagContent(header, 'Descent') || '0')
  const activityType = getTagContent(header, 'ActivityType')

  if (!startTimeStr) return null

  const startTime = new Date(startTimeStr)
  const endTime = new Date(startTime.getTime() + duration * 1000)

  // Parse samples
  const records: ActivityRecord[] = []
  const samples = getAllTagContents(content, 'Sample')

  for (const sample of samples) {
    const timeStr = getTagContent(sample, 'UTC')
    const hr = parseInt(getTagContent(sample, 'HR') || '0', 10)
    const speed = parseFloat(getTagContent(sample, 'Speed') || '0')
    const cadence = parseInt(getTagContent(sample, 'Cadence') || '0', 10)
    const altitude = parseFloat(getTagContent(sample, 'Altitude') || '0')
    const lat = parseFloat(getTagContent(sample, 'Latitude') || '0')
    const lng = parseFloat(getTagContent(sample, 'Longitude') || '0')
    const power = parseInt(getTagContent(sample, 'BikePower') || '0', 10)

    if (timeStr) {
      records.push({
        timestamp: new Date(timeStr),
        heartRate: hr > 0 ? hr * 60 : undefined, // SML stores HR in Hz
        speed: speed > 0 ? speed : undefined,
        cadence: cadence > 0 ? cadence * 60 : undefined, // Convert from Hz
        altitude: altitude !== 0 ? altitude : undefined,
        power: power > 0 ? power : undefined,
        position: lat !== 0 && lng !== 0 ? {
          lat: lat * (180 / Math.PI), // Convert from radians
          lng: lng * (180 / Math.PI),
          altitude,
        } : undefined,
      })
    }
  }

  // Parse laps (marks in SML)
  const laps: ActivityLap[] = []
  const marks = getAllTagContents(content, 'Mark')

  for (const mark of marks) {
    const markTime = getTagContent(mark, 'Time')
    const markType = getTagContent(mark, 'Type')

    if (markType === 'lap' && markTime) {
      const lapTime = parseFloat(markTime)
      // Create basic lap structure
      laps.push({
        startTime: new Date(startTime.getTime() + lapTime * 1000),
        endTime: new Date(startTime.getTime() + lapTime * 1000),
        totalElapsedTime: 0,
        totalTimerTime: 0,
        totalDistance: 0,
        totalCalories: 0,
      })
    }
  }

  // Calculate HR stats
  const hrValues = records.filter(r => r.heartRate).map(r => r.heartRate!)
  const avgHr = hrValues.length > 0 ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : undefined
  const maxHr = hrValues.length > 0 ? Math.max(...hrValues) : undefined

  // Calculate speed stats
  const speedValues = records.filter(r => r.speed).map(r => r.speed!)
  const avgSpeed = speedValues.length > 0 ? speedValues.reduce((a, b) => a + b, 0) / speedValues.length : undefined
  const maxSpeed = speedValues.length > 0 ? Math.max(...speedValues) : undefined

  return {
    id: `suunto_${startTime.getTime()}`,
    sport: mapSuuntoSport(activityType),
    startTime,
    endTime,
    totalElapsedTime: duration,
    totalTimerTime: duration,
    totalDistance: distance,
    totalCalories: Math.round(calories),
    avgHeartRate: avgHr,
    maxHeartRate: maxHr,
    avgSpeed,
    maxSpeed,
    totalAscent: ascent,
    totalDescent: descent,
    laps,
    records,
    source: 'garmin',
  }
}

/**
 * Parse Suunto JSON export format
 */
function parseSuuntoJson(content: string): Activity | null {
  try {
    const data = JSON.parse(content)

    const startTime = new Date(data.StartTime || data.startTime)
    const duration = data.Duration || data.duration || 0
    const endTime = new Date(startTime.getTime() + duration * 1000)

    const records: ActivityRecord[] = []

    // Parse track points
    const trackPoints = data.TrackPoints || data.trackPoints || data.Samples || data.samples || []
    for (const point of trackPoints) {
      records.push({
        timestamp: new Date(point.Time || point.time || point.Timestamp),
        heartRate: point.HR || point.hr || point.HeartRate,
        speed: point.Speed || point.speed,
        cadence: point.Cadence || point.cadence,
        altitude: point.Altitude || point.altitude,
        distance: point.Distance || point.distance,
        power: point.Power || point.power,
        position: (point.Latitude || point.latitude) && (point.Longitude || point.longitude) ? {
          lat: point.Latitude || point.latitude,
          lng: point.Longitude || point.longitude,
          altitude: point.Altitude || point.altitude,
        } : undefined,
      })
    }

    return {
      id: `suunto_${data.MoveId || data.moveId || startTime.getTime()}`,
      name: data.Name || data.name,
      sport: mapSuuntoSport(data.ActivityType || data.activityType || data.Sport || data.sport),
      startTime,
      endTime,
      totalElapsedTime: duration,
      totalTimerTime: duration,
      totalDistance: data.Distance || data.distance || 0,
      totalCalories: Math.round((data.Energy || data.energy || 0) / 4.184),
      avgHeartRate: data.AvgHR || data.avgHR || data.HeartRateAvg,
      maxHeartRate: data.MaxHR || data.maxHR || data.HeartRateMax,
      avgSpeed: data.AvgSpeed || data.avgSpeed,
      maxSpeed: data.MaxSpeed || data.maxSpeed,
      totalAscent: data.Ascent || data.ascent || data.AscentAltitude,
      totalDescent: data.Descent || data.descent || data.DescentAltitude,
      laps: [],
      records,
      source: 'garmin',
    }
  } catch {
    return null
  }
}

function mapSuuntoSport(sport?: string | number): Activity['sport'] {
  if (!sport) return 'other'

  const sportStr = typeof sport === 'number' ? sport.toString() : sport.toLowerCase()

  const sportMap: Record<string, Activity['sport']> = {
    running: 'running',
    run: 'running',
    '1': 'running',
    cycling: 'cycling',
    bike: 'cycling',
    '2': 'cycling',
    swimming: 'swimming',
    swim: 'swimming',
    '5': 'swimming',
    hiking: 'hiking',
    trekking: 'hiking',
    '11': 'hiking',
    walking: 'walking',
    '3': 'walking',
  }

  return sportMap[sportStr] || 'other'
}

export class SuuntoDriver implements WatchDriver {
  readonly name = 'Suunto'
  readonly type = 'suunto' as const

  async detectDevices(): Promise<SuuntoDevice[]> {
    const devices: SuuntoDevice[] = []

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
      const isSuunto = SUUNTO_VOLUME_PATTERNS.some(p => upperVolume.includes(p))

      if (isSuunto) {
        devices.push({
          name: volume,
          path: volumePath,
          type: 'suunto',
          model: volume,
        })
      }
    }

    return devices
  }

  async downloadData(device: WatchDevice, options: DownloadOptions = {}): Promise<DownloadResult> {
    const {
      outputDir = './suunto-data',
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

    // Look for SML files
    const smlFiles = this.findFiles(device.path, '.sml')
    for (const file of smlFiles) {
      try {
        const content = readFileSync(file, 'utf-8')
        const activity = parseSmlFile(content)
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
        const activity = parseSuuntoJson(content)
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

    if (ext === '.sml') {
      const content = readFileSync(filePath, 'utf-8')
      return parseSmlFile(content)
    }

    if (ext === '.json') {
      const content = readFileSync(filePath, 'utf-8')
      return parseSuuntoJson(content)
    }

    throw new Error(`Unsupported file format: ${ext}`)
  }

  async parseMonitoringFile(_filePath: string): Promise<MonitoringData> {
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

export function createSuuntoDriver(): SuuntoDriver {
  return new SuuntoDriver()
}
