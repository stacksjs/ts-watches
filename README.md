<p align="center"><img src=".github/art/cover.jpg" alt="Social Card of this repo"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
<!-- [![Codecov][codecov-src]][codecov-href] -->

# ts-watches

A comprehensive TypeScript library for downloading, parsing, and analyzing data from smartwatches and fitness devices. Supports Garmin, Polar, Suunto, Coros, Wahoo, and Apple Watch with full FIT file parsing, cloud integrations, training analysis, and real-time data streaming.

## Features

### Device Support

- **Garmin** - Full FIT file parsing for activities, monitoring, sleep, stress, HRV
- **Polar** - HRM and JSON file format support
- **Suunto** - SML (XML) format parsing
- **Coros** - FIT file support with device detection
- **Wahoo** - FIT file support for ELEMNT devices
- **Apple Watch** - Health XML export parsing

### Data Parsing

- **FIT Protocol** - Complete binary parser for Garmin's FIT format
- **Activity Data** - Runs, rides, swims, hikes with full GPS and metrics
- **Health Monitoring** - Heart rate, sleep, stress, SpO2, HRV, respiration
- **Training Metrics** - TSS, IF, NP, training load calculations

### Data Export

- **GPX 1.1** - With Garmin TrackPoint extensions for heart rate, cadence, power
- **TCX** - Training Center XML format for Strava and other platforms
- **CSV** - Flexible export for activities and monitoring data
- **GeoJSON** - For mapping applications with Douglas-Peucker simplification

### Cloud Integrations

- **Garmin Connect** - Download activities, daily summaries, sleep, stress, body battery
- **Strava** - OAuth authentication, activity upload, stream data retrieval

### Training Analysis

- **Training Load** - TSS, ATL, CTL, TSB calculations with recommendations
- **Personal Records** - Track PRs for various distances and metrics
- **Heart Rate Zones** - Percentage, Karvonen (reserve), LTHR-based calculations
- **Power Zones** - FTP-based zone calculations
- **Race Predictor** - Riegel formula predictions, VO2max estimation, training paces
- **Running Dynamics** - Form analysis, ground contact time, vertical oscillation

### Workout Tools

- **Workout Builder** - Fluent API for creating structured workouts
- **Course Builder** - Create GPS courses with waypoints
- **Training Plans** - Generate marathon and 5K training plans
- **iCal Export** - Export training plans to calendar format

### Real-time Data

- **ANT+** - Heart rate, power, speed/cadence sensor protocols
- **Bluetooth LE** - BLE GATT services for fitness devices
- **Live Tracking** - Real-time position and metrics sharing

### Developer Experience

- **CLI Tool** - Download, parse, and analyze from command line
- **TypeScript** - Fully typed APIs with comprehensive type exports
- **Zero Dependencies** - Core FIT parser has no external dependencies

## Install

```bash
bun install ts-watches
```

## Quick Start

```typescript
import { createGarminDriver } from 'ts-watches'

const driver = createGarminDriver()

// Detect connected devices
const devices = await driver.detectDevices()
console.log('Found devices:', devices)

// Download data from a device
if (devices.length > 0) {
  const result = await driver.downloadData(devices[0], {
    outputDir: './my-watch-data',
    includeActivities: true,
    includeMonitoring: true,
  })

  console.log(`Downloaded ${result.activities.length} activities`)
  console.log(`Downloaded ${result.monitoring.size} days of monitoring data`)
}
```

## Usage Examples

### Parse FIT Files

```typescript
import { createGarminDriver } from 'ts-watches'

const driver = createGarminDriver()
const activity = await driver.parseActivityFile('/path/to/activity.fit')

console.log(`${activity.sport}: ${(activity.totalDistance / 1000).toFixed(2)}km`)
console.log(`Duration: ${Math.floor(activity.totalTime / 60)} minutes`)
console.log(`Avg HR: ${activity.avgHeartRate} bpm`)
```

### Export to GPX

```typescript
import { activityToGpx, activityToTcx, activityToCsv } from 'ts-watches'

// Export activity to GPX
const gpx = activityToGpx(activity)
await Bun.write('activity.gpx', gpx)

// Export to TCX for Strava upload
const tcx = activityToTcx(activity)
await Bun.write('activity.tcx', tcx)

// Export to CSV for analysis
const csv = activityToCsv(activity)
await Bun.write('activity.csv', csv)
```

### Training Analysis

```typescript
import { calculateTSS, ZoneCalculator, RacePredictor } from 'ts-watches'

// Calculate Training Stress Score
const tss = calculateTSS(activity, { ftp: 250 })

// Analyze zones
const zones = new ZoneCalculator({ maxHR: 185, restingHR: 50, ftp: 250 })
const zoneAnalysis = zones.analyzeActivity(activity)

// Predict race times
const predictor = new RacePredictor()
const predictions = predictor.predictFromPerformance(5000, 20 * 60) // 5K in 20min
console.log(`Predicted marathon: ${predictions.marathon}`)
```

### Cloud Integration

```typescript
import { GarminConnectClient, StravaClient } from 'ts-watches'

// Garmin Connect
const garmin = new GarminConnectClient()
await garmin.login('email@example.com', 'password')
const activities = await garmin.getActivities(new Date('2024-01-01'))

// Strava
const strava = new StravaClient({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
})
const authUrl = strava.getAuthorizationUrl('http://localhost:3000/callback')
```

### Build Workouts

```typescript
import { WorkoutBuilder, workoutTemplates } from 'ts-watches'

// Use a template
const intervals = workoutTemplates.vo2maxIntervals({ ftp: 250 })

// Or build custom workout
const workout = new WorkoutBuilder('Custom Threshold')
  .warmup({ duration: 600, targetPower: { min: 100, max: 150 } })
  .interval({ duration: 1200, targetPower: { min: 240, max: 260 } })
  .recovery({ duration: 300, targetPower: { min: 100, max: 130 } })
  .repeat(4)
  .cooldown({ duration: 600, targetPower: { min: 100, max: 130 } })
  .build()
```

### Real-time Data

```typescript
import { createLiveTracking, createBleScanner } from 'ts-watches'

// Live tracking
const tracker = createLiveTracking({
  updateInterval: 5000,
  onUpdate: (session) => console.log(`Distance: ${session.totalDistance}m`),
})

tracker.start('Morning Run')
tracker.updatePosition({ lat: 37.7749, lng: -122.4194, altitude: 10 })

// BLE sensors
const ble = createBleScanner()
await ble.startScanning()
ble.on('data', (device, data) => {
  if (data.type === 'heart_rate') {
    console.log(`HR: ${data.data.heartRate} bpm`)
  }
})
```

## CLI

```bash
# Detect connected watches
watch detect

# Download all data from connected watch
watch download

# Download to specific directory
watch download --output ./my-data

# Download only activities from the last week
watch download --activities --since 2024-01-01

# Parse a single FIT file
watch parse /path/to/activity.fit

# Parse and output as JSON
watch parse /path/to/activity.fit --format json

# Watch for device connection and auto-download
watch watch
```

## Supported Data Types

### Activities

- Running (treadmill, trail, track)
- Cycling (road, mountain, gravel, indoor)
- Swimming (pool, open water)
- Hiking, Walking
- Strength training, Cardio, HIIT
- Multisport (triathlon)
- And 50+ more sport types

### Health Metrics

| Metric | Description |
|--------|-------------|
| Heart Rate | Continuous monitoring, resting HR, zones |
| Sleep | Duration, stages (light, deep, REM), score |
| Stress | Stress levels throughout the day |
| Body Battery | Energy levels based on HRV |
| SpO2 | Blood oxygen saturation |
| Respiration | Breathing rate |
| HRV | Heart rate variability (RMSSD, SDRR) |
| Steps | Daily count, goals, intensity minutes |

### Training Metrics

| Metric | Description |
|--------|-------------|
| TSS | Training Stress Score |
| IF | Intensity Factor |
| NP | Normalized Power |
| ATL | Acute Training Load |
| CTL | Chronic Training Load (Fitness) |
| TSB | Training Stress Balance (Form) |
| TRIMP | Training Impulse |

## Device Setup

### Garmin

1. Connect your watch via USB
2. On the watch: **Settings > System > USB Mode > Mass Storage**
3. Close Garmin Express (it locks the device)
4. The watch appears as `/Volumes/GARMIN` on macOS

### Polar

1. Export data from Polar Flow web interface
2. Or use Polar's data export feature on the device

### Apple Watch

1. Open Health app on iPhone
2. Tap profile > Export All Health Data
3. Extract the ZIP file

## API Reference

See the [full API documentation](./docs/api.md) for detailed type definitions and method signatures.

## Testing

```bash
bun test
```

## Changelog

Please see our [releases](https://github.com/stacksjs/ts-watches/releases) page for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](.github/CONTRIBUTING.md) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/ts-watches/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Postcardware

"Software that is free, but hopes for a postcard." We love receiving postcards from around the world showing where Stacks is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## License

The MIT License (MIT). Please see [LICENSE](LICENSE.md) for more information.

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/ts-watches?style=flat-square
[npm-version-href]: https://npmjs.com/package/ts-watches
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/ts-watches/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/ts-watches/actions?query=workflow%3Aci

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/ts-watches/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/ts-watches -->
