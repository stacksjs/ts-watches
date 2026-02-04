import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync, readFileSync } from 'fs'
import { join, basename, extname } from 'path'
import type {
  WatchDriver,
  GarminDevice,
  WatchDevice,
  DownloadOptions,
  DownloadResult,
  Activity,
  MonitoringData,
} from '../types'
import { FitParser, FitDecoder } from '../fit'

const VOLUMES_PATH = '/Volumes'

// Common Garmin device volume name patterns
const GARMIN_VOLUME_PATTERNS = [
  'GARMIN',
  'ENDURO',
  'FENIX',
  'FORERUNNER',
  'VENU',
  'INSTINCT',
  'VIVOACTIVE',
  'EPIX',
  'TACTIX',
  'MARQ',
  'QUATIX',
  'DESCENT',
  'APPROACH',
  'LILY',
  'VIVOSMART',
  'VIVOMOVE',
]

// Garmin directory structure
const GARMIN_DIRS = {
  ACTIVITY: 'GARMIN/Activity',
  MONITOR: 'GARMIN/Monitor',
  SPORTS: 'GARMIN/Sports',
  SETTINGS: 'GARMIN/Settings',
  TOTALS: 'GARMIN/Totals',
  RECORDS: 'GARMIN/Records',
  METRICS: 'GARMIN/Metrics',
  SLEEP: 'GARMIN/Sleep',
  WORKOUTS: 'GARMIN/Workouts',
  COURSES: 'GARMIN/Courses',
  LOCATIONS: 'GARMIN/Locations',
  GOALS: 'GARMIN/Goals',
  SCHEDULES: 'GARMIN/Schedules',
} as const

export class GarminDriver implements WatchDriver {
  readonly name = 'Garmin'
  readonly type = 'garmin' as const

  async detectDevices(): Promise<GarminDevice[]> {
    const devices: GarminDevice[] = []

    if (!existsSync(VOLUMES_PATH)) {
      return devices
    }

    const volumes = readdirSync(VOLUMES_PATH)

    for (const volume of volumes) {
      const volumePath = join(VOLUMES_PATH, volume)

      try {
        if (!statSync(volumePath).isDirectory()) continue
      } catch {
        continue
      }

      // Check if volume matches Garmin patterns or has GARMIN folder
      const upperVolume = volume.toUpperCase()
      let isGarmin = GARMIN_VOLUME_PATTERNS.some(pattern => upperVolume.includes(pattern))

      if (!isGarmin) {
        const garminFolder = join(volumePath, 'GARMIN')
        isGarmin = existsSync(garminFolder)
      }

      if (isGarmin) {
        const device = await this.getDeviceInfo(volumePath, volume)
        if (device) {
          devices.push(device)
        }
      }
    }

    return devices
  }

  private async getDeviceInfo(volumePath: string, volumeName: string): Promise<GarminDevice | null> {
    const garminFolder = join(volumePath, 'GARMIN')
    if (!existsSync(garminFolder)) {
      return null
    }

    // Try to read device info from GarminDevice.xml or similar files
    let model = volumeName
    let serial: string | undefined
    let unitId: string | undefined

    // Check for device info file
    const deviceXmlPath = join(garminFolder, 'GarminDevice.xml')
    if (existsSync(deviceXmlPath)) {
      try {
        const content = readFileSync(deviceXmlPath, 'utf8')
        const modelMatch = content.match(/<Model>([^<]+)<\/Model>/i)
        const idMatch = content.match(/<Id>([^<]+)<\/Id>/i)
        if (modelMatch) model = modelMatch[1]
        if (idMatch) unitId = idMatch[1]
      } catch {
        // Ignore XML parsing errors
      }
    }

    // Try to get more info from any FIT file in the device
    const activityDir = join(volumePath, GARMIN_DIRS.ACTIVITY)
    if (existsSync(activityDir)) {
      const files = readdirSync(activityDir).filter(f => f.toLowerCase().endsWith('.fit'))
      if (files.length > 0) {
        try {
          const fitPath = join(activityDir, files[0])
          const fitData = readFileSync(fitPath)
          const parser = new FitParser(fitData)
          const result = parser.parse()
          const decoder = new FitDecoder(result)
          const deviceInfo = decoder.getDeviceInfo()
          if (deviceInfo?.serialNumber) {
            serial = deviceInfo.serialNumber.toString()
          }
          if (deviceInfo?.productName) {
            model = deviceInfo.productName
          }
        } catch {
          // Ignore parsing errors
        }
      }
    }

    return {
      name: model,
      path: volumePath,
      type: 'garmin',
      model,
      serial,
      unitId,
    }
  }

  async downloadData(device: WatchDevice, options: DownloadOptions = {}): Promise<DownloadResult> {
    const {
      outputDir = './garmin-data',
      includeActivities = true,
      includeMonitoring = true,
      since,
      until,
      copyRawFiles = true,
    } = options

    const result: DownloadResult = {
      device,
      activities: [],
      monitoring: new Map(),
      rawFiles: [],
      errors: [],
    }

    // Create output directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const downloadPath = join(outputDir, timestamp)
    if (copyRawFiles) {
      mkdirSync(downloadPath, { recursive: true })
    }

    // Download activities
    if (includeActivities) {
      const activityDir = join(device.path, GARMIN_DIRS.ACTIVITY)
      if (existsSync(activityDir)) {
        const files = readdirSync(activityDir).filter(f =>
          f.toLowerCase().endsWith('.fit')
        )

        for (const file of files) {
          const filePath = join(activityDir, file)
          try {
            const stat = statSync(filePath)
            const fileDate = stat.mtime

            // Apply date filters
            if (since && fileDate < since) continue
            if (until && fileDate > until) continue

            // Parse activity
            const activity = await this.parseActivityFile(filePath)
            if (activity) {
              activity.rawFilePath = filePath
              result.activities.push(activity)
            }

            // Copy raw file
            if (copyRawFiles) {
              const destDir = join(downloadPath, 'Activity')
              mkdirSync(destDir, { recursive: true })
              const destPath = join(destDir, file)
              copyFileSync(filePath, destPath)
              result.rawFiles.push(destPath)
            }
          } catch (err) {
            result.errors.push(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }
    }

    // Download monitoring data
    if (includeMonitoring) {
      const monitorDir = join(device.path, GARMIN_DIRS.MONITOR)
      if (existsSync(monitorDir)) {
        const files = readdirSync(monitorDir).filter(f =>
          f.toLowerCase().endsWith('.fit')
        )

        for (const file of files) {
          const filePath = join(monitorDir, file)
          try {
            const stat = statSync(filePath)
            const fileDate = stat.mtime

            // Apply date filters
            if (since && fileDate < since) continue
            if (until && fileDate > until) continue

            // Parse monitoring data
            const monitoring = await this.parseMonitoringFile(filePath)
            if (monitoring) {
              const dateKey = fileDate.toISOString().slice(0, 10)

              // Merge with existing data for that day
              const existing = result.monitoring.get(dateKey) || {}
              result.monitoring.set(dateKey, { ...existing, ...monitoring })
            }

            // Copy raw file
            if (copyRawFiles) {
              const destDir = join(downloadPath, 'Monitor')
              mkdirSync(destDir, { recursive: true })
              const destPath = join(destDir, file)
              copyFileSync(filePath, destPath)
              result.rawFiles.push(destPath)
            }
          } catch (err) {
            result.errors.push(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }

      // Also check Sleep directory
      const sleepDir = join(device.path, 'GARMIN/Sleep')
      if (existsSync(sleepDir)) {
        const files = readdirSync(sleepDir).filter(f =>
          f.toLowerCase().endsWith('.fit')
        )

        for (const file of files) {
          const filePath = join(sleepDir, file)
          try {
            const monitoring = await this.parseMonitoringFile(filePath)
            if (monitoring?.sleep) {
              const dateKey = monitoring.sleep.date.toISOString().slice(0, 10)
              const existing = result.monitoring.get(dateKey) || {}
              result.monitoring.set(dateKey, { ...existing, sleep: monitoring.sleep })
            }

            if (copyRawFiles) {
              const destDir = join(downloadPath, 'Sleep')
              mkdirSync(destDir, { recursive: true })
              const destPath = join(destDir, file)
              copyFileSync(filePath, destPath)
              result.rawFiles.push(destPath)
            }
          } catch (err) {
            result.errors.push(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }
    }

    // Sort activities by start time
    result.activities.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

    return result
  }

  async parseActivityFile(filePath: string): Promise<Activity | null> {
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.fit') {
      throw new Error(`Unsupported file format: ${ext}`)
    }

    const data = readFileSync(filePath)
    const parser = new FitParser(data)
    const result = parser.parse()
    const decoder = new FitDecoder(result)

    return decoder.decodeActivity()
  }

  async parseMonitoringFile(filePath: string): Promise<MonitoringData> {
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.fit') {
      throw new Error(`Unsupported file format: ${ext}`)
    }

    const data = readFileSync(filePath)
    const parser = new FitParser(data)
    const result = parser.parse()
    const decoder = new FitDecoder(result)

    return decoder.decodeMonitoring()
  }
}

// Factory function
export function createGarminDriver(): GarminDriver {
  return new GarminDriver()
}
