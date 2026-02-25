# Introduction

ts-watches is a comprehensive TypeScript library for downloading, parsing, and analyzing data from smartwatches and fitness devices.

[[toc]]

## Why ts-watches

Working with fitness device data is challenging:

- **Proprietary formats** - Each manufacturer uses different file formats (FIT, HRM, SML, XML)
- **Complex protocols** - Binary FIT files require careful parsing of headers, definitions, and data messages
- **Fragmented APIs** - Cloud services like Garmin Connect and Strava have different authentication flows
- **Missing tooling** - Most existing libraries are incomplete or lack TypeScript support

ts-watches solves these problems with:

- **Unified API** - One consistent interface across all device manufacturers
- **Complete FIT parser** - Full implementation of Garmin's FIT protocol with zero dependencies
- **Type safety** - Comprehensive TypeScript types for excellent developer experience
- **Batteries included** - Export, analysis, cloud sync, and real-time streaming built-in

## Supported Devices

| Manufacturer | Formats | Features |
|--------------|---------|----------|
| Garmin | FIT | Activities, monitoring, sleep, stress, HRV |
| Polar | HRM, JSON | Heart rate, activities |
| Suunto | SML (XML) | Activities with GPS |
| Coros | FIT | Activities, running power |
| Wahoo | FIT | Cycling activities |
| Apple Watch | Health XML | Workouts, health metrics |

## Core Features

### Device Detection & Download

Automatically detect connected devices and download data:

```typescript
import { createGarminDriver } from 'ts-watches'

const driver = createGarminDriver()
const devices = await driver.detectDevices()

if (devices.length > 0) {
  const result = await driver.downloadData(devices[0], {
    outputDir: './data',
    includeActivities: true,
    includeMonitoring: true,
  })
}
```

### FIT File Parsing

Parse any FIT file with full field support:

```typescript
const activity = await driver.parseActivityFile('./activity.fit')

console.log(`Sport: ${activity.sport}`)
console.log(`Distance: ${(activity.totalDistance / 1000).toFixed(2)} km`)
console.log(`Duration: ${Math.floor(activity.totalTime / 60)} min`)
console.log(`Avg HR: ${activity.avgHeartRate} bpm`)
console.log(`Calories: ${activity.calories}`)
```

### Data Export

Export to multiple formats:

```typescript
import { activityToGpx, activityToTcx, activityToCsv } from 'ts-watches'

// GPX with extensions
const gpx = activityToGpx(activity)

// TCX for Strava
const tcx = activityToTcx(activity)

// CSV for spreadsheets
const csv = activityToCsv(activity)
```

### Training Analysis

Calculate training metrics and predict race times:

```typescript
import { calculateTSS, RacePredictor, ZoneCalculator } from 'ts-watches'

// Training Stress Score
const tss = calculateTSS(activity, { ftp: 250 })

// Race predictions
const predictor = new RacePredictor()
const times = predictor.predictFromPerformance(5000, 20 * 60) // 5K in 20:00

// Zone analysis
const zones = new ZoneCalculator({ maxHR: 185, restingHR: 50 })
const analysis = zones.analyzeActivity(activity)
```

## Architecture

ts-watches is organized into modules:

```
ts-watches/
├── fit/          # FIT protocol parser
├── drivers/      # Device-specific drivers
├── export/       # GPX, TCX, CSV, GeoJSON
├── cloud/        # Garmin Connect, Strava
├── analysis/     # Training metrics, zones
├── workouts/     # Workout builder, courses
├── realtime/     # ANT+, BLE, live tracking
└── types.ts      # Core type definitions
```

## Next Steps

- [Installation](./install.md) - Get ts-watches set up in your project
- [Usage Guide](./usage.md) - Learn the core APIs
- [Configuration](./config.md) - Customize behavior
- [API Reference](./api.md) - Full type documentation
