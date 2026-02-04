import { CLI } from '@stacksjs/clapp'
import { version } from '../package.json'
import { createGarminDriver } from '../src/drivers/garmin'
import type { DownloadOptions } from '../src/types'

const cli = new CLI('watch')

interface DetectOptions {
  verbose?: boolean
}

interface DownloadCliOptions {
  output?: string
  since?: string
  until?: string
  activities?: boolean
  monitoring?: boolean
  raw?: boolean
  verbose?: boolean
}

interface ParseOptions {
  output?: string
  format?: 'json' | 'summary'
  verbose?: boolean
}

// Detect command
cli
  .command('detect', 'Detect connected watch devices')
  .option('--verbose', 'Enable verbose output')
  .action(async (options: DetectOptions) => {
    const driver = createGarminDriver()

    if (options.verbose) {
      console.log('Searching for connected watch devices...\n')
    }

    const devices = await driver.detectDevices()

    if (devices.length === 0) {
      console.log('No watch devices found.')
      console.log('\nMake sure your watch is:')
      console.log('  1. Connected via USB')
      console.log('  2. In Mass Storage mode (Settings > System > USB Mode)')
      console.log('  3. Garmin Express is closed (it may lock the device)')
      return
    }

    console.log(`Found ${devices.length} device(s):\n`)

    for (const device of devices) {
      console.log(`  ${device.name}`)
      console.log(`    Type: ${device.type}`)
      console.log(`    Path: ${device.path}`)
      if (device.model) console.log(`    Model: ${device.model}`)
      if (device.serial) console.log(`    Serial: ${device.serial}`)
      console.log()
    }
  })

// Download command
cli
  .command('download', 'Download data from connected watch')
  .option('-o, --output <dir>', 'Output directory', { default: './watch-data' })
  .option('--since <date>', 'Only download data after this date (YYYY-MM-DD)')
  .option('--until <date>', 'Only download data before this date (YYYY-MM-DD)')
  .option('--activities', 'Download activity data only')
  .option('--monitoring', 'Download monitoring data only')
  .option('--no-raw', 'Do not copy raw FIT files')
  .option('--verbose', 'Enable verbose output')
  .action(async (options: DownloadCliOptions) => {
    const driver = createGarminDriver()

    console.log('Detecting devices...')
    const devices = await driver.detectDevices()

    if (devices.length === 0) {
      console.error('No watch devices found.')
      console.error('\nMake sure your watch is:')
      console.error('  1. Connected via USB')
      console.error('  2. In Mass Storage mode (Settings > System > USB Mode)')
      console.error('  3. Garmin Express is closed (it may lock the device)')
      process.exit(1)
    }

    // Use first device found
    const device = devices[0]
    console.log(`Found ${device.name} at ${device.path}\n`)

    const downloadOptions: DownloadOptions = {
      outputDir: options.output,
      includeActivities: options.monitoring !== true,
      includeMonitoring: options.activities !== true,
      copyRawFiles: options.raw !== false,
      since: options.since ? new Date(options.since) : undefined,
      until: options.until ? new Date(options.until) : undefined,
    }

    console.log('Downloading data...')
    const result = await driver.downloadData(device, downloadOptions)

    console.log('\nDownload complete!')
    console.log(`  Activities: ${result.activities.length}`)
    console.log(`  Monitoring days: ${result.monitoring.size}`)
    console.log(`  Raw files copied: ${result.rawFiles.length}`)

    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`)
      if (options.verbose) {
        for (const err of result.errors) {
          console.error(`    - ${err.message}`)
        }
      }
    }

    // Print activity summary
    if (result.activities.length > 0 && options.verbose) {
      console.log('\nActivities:')
      for (const activity of result.activities.slice(-10)) {
        const date = activity.startTime.toLocaleDateString()
        const duration = Math.round(activity.totalTimerTime / 60)
        const distance = (activity.totalDistance / 1000).toFixed(2)
        console.log(`  ${date} - ${activity.sport} - ${duration}min - ${distance}km`)
      }
      if (result.activities.length > 10) {
        console.log(`  ... and ${result.activities.length - 10} more`)
      }
    }
  })

// Parse command
cli
  .command('parse <file>', 'Parse a FIT file')
  .option('-o, --output <file>', 'Output file (defaults to stdout)')
  .option('-f, --format <format>', 'Output format: json, summary', { default: 'summary' })
  .option('--verbose', 'Enable verbose output')
  .action(async (file: string, options: ParseOptions) => {
    const driver = createGarminDriver()

    try {
      const activity = await driver.parseActivityFile(file)

      if (!activity) {
        // Try parsing as monitoring file
        const monitoring = await driver.parseMonitoringFile(file)

        if (options.format === 'json') {
          const output = JSON.stringify(monitoring, null, 2)
          if (options.output) {
            await Bun.write(options.output, output)
            console.log(`Written to ${options.output}`)
          } else {
            console.log(output)
          }
        } else {
          console.log('Monitoring Data:')
          if (monitoring.heartRate) {
            console.log(`  Heart Rate: avg ${monitoring.heartRate.avgHeartRate} bpm`)
          }
          if (monitoring.sleep) {
            console.log(`  Sleep: ${Math.round(monitoring.sleep.totalSleepTime)} minutes`)
          }
          if (monitoring.stress) {
            console.log(`  Stress: avg ${monitoring.stress.avgStressLevel}`)
          }
          if (monitoring.spO2) {
            console.log(`  SpO2: avg ${monitoring.spO2.avgSpO2}%`)
          }
        }
        return
      }

      if (options.format === 'json') {
        const output = JSON.stringify(activity, null, 2)
        if (options.output) {
          await Bun.write(options.output, output)
          console.log(`Written to ${options.output}`)
        } else {
          console.log(output)
        }
      } else {
        // Summary format
        console.log('Activity Summary:')
        console.log(`  Sport: ${activity.sport}${activity.subSport ? ` (${activity.subSport})` : ''}`)
        console.log(`  Date: ${activity.startTime.toLocaleString()}`)
        console.log(`  Duration: ${Math.round(activity.totalTimerTime / 60)} minutes`)
        console.log(`  Distance: ${(activity.totalDistance / 1000).toFixed(2)} km`)
        console.log(`  Calories: ${activity.totalCalories}`)

        if (activity.avgHeartRate) {
          console.log(`  Avg Heart Rate: ${activity.avgHeartRate} bpm`)
        }
        if (activity.maxHeartRate) {
          console.log(`  Max Heart Rate: ${activity.maxHeartRate} bpm`)
        }
        if (activity.avgSpeed) {
          const pace = 1000 / 60 / activity.avgSpeed // min/km
          console.log(`  Avg Pace: ${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} /km`)
        }
        if (activity.totalAscent) {
          console.log(`  Total Ascent: ${activity.totalAscent} m`)
        }
        if (activity.avgCadence) {
          console.log(`  Avg Cadence: ${activity.avgCadence} spm`)
        }
        if (activity.avgPower) {
          console.log(`  Avg Power: ${activity.avgPower} W`)
        }

        console.log(`\n  Laps: ${activity.laps.length}`)
        console.log(`  Data Points: ${activity.records.length}`)
      }
    } catch (err) {
      console.error(`Error parsing file: ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
  })

// Watch command (monitor for device connection)
cli
  .command('watch', 'Watch for device connection and auto-download')
  .option('-o, --output <dir>', 'Output directory', { default: './watch-data' })
  .option('--interval <ms>', 'Check interval in milliseconds', { default: 2000 })
  .action(async (options: { output: string; interval: number }) => {
    const driver = createGarminDriver()
    let lastDevicePath: string | null = null

    console.log('Watching for device connection...')
    console.log('Press Ctrl+C to stop\n')

    const check = async () => {
      const devices = await driver.detectDevices()

      if (devices.length > 0 && devices[0].path !== lastDevicePath) {
        const device = devices[0]
        lastDevicePath = device.path

        console.log(`\nDevice connected: ${device.name}`)
        console.log('Starting download...\n')

        const result = await driver.downloadData(device, {
          outputDir: options.output,
          copyRawFiles: true,
        })

        console.log('Download complete!')
        console.log(`  Activities: ${result.activities.length}`)
        console.log(`  Monitoring days: ${result.monitoring.size}`)
        console.log(`  Raw files: ${result.rawFiles.length}`)

        if (result.errors.length > 0) {
          console.log(`  Errors: ${result.errors.length}`)
        }

        console.log('\nContinuing to watch...')
      } else if (devices.length === 0 && lastDevicePath !== null) {
        console.log('Device disconnected')
        lastDevicePath = null
      }
    }

    // Initial check
    await check()

    // Set up interval
    setInterval(check, options.interval)
  })

// Version command
cli.command('version', 'Show the version').action(() => {
  console.log(version)
})

cli.version(version)
cli.help()
cli.parse()
