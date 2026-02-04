import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync, readFileSync } from 'fs'
import { join, basename, extname } from 'path'
import { homedir } from 'os'
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

// Garmin Express cache path (macOS)
const GARMIN_EXPRESS_PATH = join(homedir(), 'Library/Application Support/Garmin/Express/RegisteredDevices')

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

  /**
   * Detect devices from both USB mass storage and Garmin Express cache
   */
  async detectDevices(): Promise<GarminDevice[]> {
    const devices: GarminDevice[] = []

    // First, try USB mass storage devices
    if (existsSync(VOLUMES_PATH)) {
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
    }

    // Also check Garmin Express cache (for MTP-only devices)
    const expressDevices = await this.detectGarminExpressDevices()
    devices.push(...expressDevices)

    return devices
  }

  /**
   * Detect devices synced via Garmin Express (MTP mode)
   */
  async detectGarminExpressDevices(): Promise<GarminDevice[]> {
    const devices: GarminDevice[] = []

    if (!existsSync(GARMIN_EXPRESS_PATH)) {
      return devices
    }

    const deviceFolders = readdirSync(GARMIN_EXPRESS_PATH)

    for (const folder of deviceFolders) {
      const devicePath = join(GARMIN_EXPRESS_PATH, folder)

      try {
        if (!statSync(devicePath).isDirectory()) continue
      } catch {
        continue
      }

      // Read device info from GarminDevice.xml
      const deviceXmlPath = join(devicePath, 'GarminDevice.xml')
      if (!existsSync(deviceXmlPath)) continue

      try {
        const content = readFileSync(deviceXmlPath, 'utf8')

        // Parse device info from XML
        const descriptionMatch = content.match(/<Description>([^<]+)<\/Description>/i)
        const idMatch = content.match(/<Id>([^<]+)<\/Id>/i)
        const displayNameMatch = content.match(/<DisplayName>([^<]+)<\/DisplayName>/i)
        const partNumberMatch = content.match(/<PartNumber>([^<]+)<\/PartNumber>/i)
        const softwareVersionMatch = content.match(/<SoftwareVersion>([^<]+)<\/SoftwareVersion>/i)

        const model = displayNameMatch?.[1] || descriptionMatch?.[1] || folder
        const unitId = idMatch?.[1] || folder
        const firmware = softwareVersionMatch?.[1]

        // Check if this device has synced data
        const syncPath = join(devicePath, 'PendingSyncUploads/Garmin')
        if (!existsSync(syncPath)) continue

        devices.push({
          name: model,
          path: devicePath,
          type: 'garmin',
          model,
          serial: folder,
          unitId,
          firmware,
          partNumber: partNumberMatch?.[1],
          isGarminExpress: true,
          garminExpressPath: syncPath,
        } as GarminDevice)
      } catch {
        // Ignore parsing errors
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
    const garminDevice = device as GarminDevice
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

    // Handle Garmin Express cache devices
    if (garminDevice.isGarminExpress && garminDevice.garminExpressPath) {
      return this.downloadFromGarminExpress(garminDevice, options, result, downloadPath)
    }

    // Download activities from USB mass storage
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

  /**
   * Download data from Garmin Express cache (for MTP-only devices)
   */
  private async downloadFromGarminExpress(
    device: GarminDevice,
    options: DownloadOptions,
    result: DownloadResult,
    downloadPath: string
  ): Promise<DownloadResult> {
    const {
      includeActivities = true,
      includeMonitoring = true,
      since,
      until,
      copyRawFiles = true,
    } = options

    const basePath = device.garminExpressPath!

    // Garmin Express cache directory structure
    const EXPRESS_DIRS = {
      Activity: join(basePath, 'Activity'),
      Monitor: join(basePath, 'Monitor'),
      Sleep: join(basePath, 'Sleep'),
      HRVStatus: join(basePath, 'HRVStatus'),
      SkinTemp: join(basePath, 'SkinTemp'),
      Metrics: join(basePath, 'Metrics'),
      Coach: join(basePath, 'Coach'),
    }

    // Helper to process FIT files in a directory
    const processFitFiles = async (
      dir: string,
      handler: (filePath: string, monitoring: MonitoringData) => void,
      destSubdir: string
    ) => {
      if (!existsSync(dir)) return

      const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.fit'))

      for (const file of files) {
        const filePath = join(dir, file)
        try {
          const stat = statSync(filePath)
          const fileDate = stat.mtime

          if (since && fileDate < since) continue
          if (until && fileDate > until) continue

          const monitoring = await this.parseMonitoringFile(filePath)
          if (monitoring) {
            handler(filePath, monitoring)
          }

          if (copyRawFiles) {
            const destDir = join(downloadPath, destSubdir)
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

    // Process activities
    if (includeActivities && existsSync(EXPRESS_DIRS.Activity)) {
      const files = readdirSync(EXPRESS_DIRS.Activity).filter(f =>
        f.toLowerCase().endsWith('.fit')
      )

      for (const file of files) {
        const filePath = join(EXPRESS_DIRS.Activity, file)
        try {
          const stat = statSync(filePath)
          const fileDate = stat.mtime

          if (since && fileDate < since) continue
          if (until && fileDate > until) continue

          const activity = await this.parseActivityFile(filePath)
          if (activity) {
            activity.rawFilePath = filePath
            result.activities.push(activity)
          }

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

    // Process monitoring data
    if (includeMonitoring) {
      // Monitor files
      await processFitFiles(EXPRESS_DIRS.Monitor, (filePath, monitoring) => {
        const dateKey = new Date().toISOString().slice(0, 10)
        const existing = result.monitoring.get(dateKey) || {}
        result.monitoring.set(dateKey, { ...existing, ...monitoring })
      }, 'Monitor')

      // HRV Status files
      await processFitFiles(EXPRESS_DIRS.HRVStatus, (filePath, monitoring) => {
        if (monitoring.hrv && monitoring.hrv.length > 0) {
          const dateKey = monitoring.hrv[0].timestamp.toISOString().slice(0, 10)
          const existing = result.monitoring.get(dateKey) || {}
          result.monitoring.set(dateKey, {
            ...existing,
            hrv: [...(existing.hrv || []), ...monitoring.hrv],
          })
        }
      }, 'HRVStatus')

      // Skin Temperature files
      await processFitFiles(EXPRESS_DIRS.SkinTemp, (filePath, monitoring) => {
        const stat = statSync(filePath)
        const dateKey = stat.mtime.toISOString().slice(0, 10)
        const existing = result.monitoring.get(dateKey) || {}
        result.monitoring.set(dateKey, { ...existing, skinTemp: monitoring })
      }, 'SkinTemp')

      // Sleep files
      await processFitFiles(EXPRESS_DIRS.Sleep, (filePath, monitoring) => {
        if (monitoring.sleep) {
          const dateKey = monitoring.sleep.date?.toISOString().slice(0, 10) ||
            new Date().toISOString().slice(0, 10)
          const existing = result.monitoring.get(dateKey) || {}
          result.monitoring.set(dateKey, { ...existing, sleep: monitoring.sleep })
        }
      }, 'Sleep')
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
