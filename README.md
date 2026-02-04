<p align="center"><img src=".github/art/cover.jpg" alt="Social Card of this repo"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
<!-- [![Codecov][codecov-src]][codecov-href] -->

# ts-watches

A TypeScript library for downloading and parsing data from smartwatches. Currently supports Garmin devices with FIT file parsing.

## Features

- **Garmin Device Detection** - Automatically detect connected Garmin watches via USB
- **FIT File Parser** - Full support for Garmin's FIT protocol
- **Activity Data** - Parse runs, rides, swims, hikes, and more with full metrics
- **Health Monitoring** - Heart rate, sleep, stress, SpO2, HRV, respiration data
- **CLI Tool** - Download and parse data from the command line
- **TypeScript** - Fully typed APIs for excellent DX

## Install

```bash
bun install ts-watches
```

## Usage

### As a Library

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

// Parse a single FIT file
const activity = await driver.parseActivityFile('/path/to/activity.fit')
console.log(`${activity.sport}: ${activity.totalDistance / 1000}km`)
```

### CLI

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
- And many more...

### Activity Metrics

- Duration, distance, calories
- Heart rate (avg, max, zones)
- Pace/speed
- Cadence
- Power (for cycling)
- Elevation gain/loss
- GPS track with coordinates
- Lap splits
- Training metrics (TSS, IF, NP)

### Health & Monitoring

- **Heart Rate** - Continuous monitoring, resting HR
- **Sleep** - Duration, stages (light, deep, REM), sleep score
- **Stress** - Stress levels throughout the day
- **Body Battery** - Energy levels
- **SpO2** - Blood oxygen saturation
- **Respiration** - Breathing rate
- **HRV** - Heart rate variability
- **Steps** - Daily step count and goals

## API Reference

### `createGarminDriver()`

Creates a new Garmin driver instance.

```typescript
const driver = createGarminDriver()
```

### `driver.detectDevices()`

Detects connected Garmin devices.

```typescript
const devices: GarminDevice[] = await driver.detectDevices()
```

### `driver.downloadData(device, options)`

Downloads data from a connected device.

```typescript
const result = await driver.downloadData(device, {
  outputDir: './data',        // Output directory
  includeActivities: true,    // Download activities
  includeMonitoring: true,    // Download monitoring data
  since: new Date('2024-01-01'), // Filter by date
  until: new Date(),
  copyRawFiles: true,         // Copy original FIT files
})
```

### `driver.parseActivityFile(path)`

Parses a FIT activity file.

```typescript
const activity: Activity = await driver.parseActivityFile('/path/to/file.fit')
```

### `driver.parseMonitoringFile(path)`

Parses a FIT monitoring file.

```typescript
const data: MonitoringData = await driver.parseMonitoringFile('/path/to/file.fit')
```

## Device Setup

For the driver to detect your Garmin watch:

1. Connect your watch via USB
2. On the watch, go to **Settings > System > USB Mode**
3. Select **Mass Storage** (not "Garmin" or "Charging")
4. Close Garmin Express if it's running (it locks the device)

The watch should appear as a mounted drive (e.g., `/Volumes/GARMIN` on macOS).

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

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

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
