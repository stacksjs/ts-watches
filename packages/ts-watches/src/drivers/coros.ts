import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync, readFileSync } from 'fs'
import { join, extname } from 'path'
import type {
  WatchDriver,
  WatchDevice,
  DownloadOptions,
  DownloadResult,
  Activity,
  MonitoringData,
} from '../types'
import { FitParser, FitDecoder } from '../fit'

const VOLUMES_PATH = '/Volumes'

const COROS_VOLUME_PATTERNS = ['COROS', 'PACE', 'APEX', 'VERTIX', 'DURA']

export interface CorosDevice extends WatchDevice {
  type: 'coros'
}

export class CorosDriver implements WatchDriver {
  readonly name = 'Coros'
  readonly type = 'coros' as const

  async detectDevices(): Promise<CorosDevice[]> {
    const devices: CorosDevice[] = []

    if (!existsSync(VOLUMES_PATH)) return devices

    const volumes = readdirSync(VOLUMES_PATH)

    for (const volume of volumes) {
      const volumePath = join(VOLUMES_PATH, volume)

      try {
        if (!statSync(volumePath).isDirectory()) continue
      }
      catch {
        continue
      }

      const upperVolume = volume.toUpperCase()
      const isCoros = COROS_VOLUME_PATTERNS.some(p => upperVolume.includes(p))

      // Also check for COROS folder structure
      if (!isCoros) {
        const corosFolder = join(volumePath, 'COROS')
        if (existsSync(corosFolder)) {
          devices.push({
            name: volume,
            path: volumePath,
            type: 'coros',
            model: volume,
          })
          continue
        }
      }

      if (isCoros) {
        devices.push({
          name: volume,
          path: volumePath,
          type: 'coros',
          model: volume,
        })
      }
    }

    return devices
  }

  async downloadData(device: WatchDevice, options: DownloadOptions = {}): Promise<DownloadResult> {
    const {
      outputDir = './coros-data',
      includeActivities = true,
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

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const downloadPath = join(outputDir, timestamp)

    if (copyRawFiles) {
      mkdirSync(downloadPath, { recursive: true })
    }

    // Coros stores activities in FIT format
    // Common paths: /Activity, /COROS/Activity, /GARMIN/Activity (yes, some Coros use Garmin folder structure)
    const activityDirs = [
      join(device.path, 'Activity'),
      join(device.path, 'COROS', 'Activity'),
      join(device.path, 'GARMIN', 'Activity'),
    ]

    if (includeActivities) {
      for (const activityDir of activityDirs) {
        if (!existsSync(activityDir)) continue

        const files = readdirSync(activityDir).filter(f =>
          f.toLowerCase().endsWith('.fit')
        )

        for (const file of files) {
          const filePath = join(activityDir, file)
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
          }
          catch (err) {
            result.errors.push(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }
    }

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
    const parseResult = parser.parse()
    const decoder = new FitDecoder(parseResult)

    return decoder.decodeActivity()
  }

  async parseMonitoringFile(filePath: string): Promise<MonitoringData> {
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.fit') {
      throw new Error(`Unsupported file format: ${ext}`)
    }

    const data = readFileSync(filePath)
    const parser = new FitParser(data)
    const parseResult = parser.parse()
    const decoder = new FitDecoder(parseResult)

    return decoder.decodeMonitoring()
  }
}

export function createCorosDriver(): CorosDriver {
  return new CorosDriver()
}
