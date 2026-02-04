# Usage Guide

Learn to use ts-watches for parsing, analyzing, and exporting fitness data.

[[toc]]

## Device Drivers

### Garmin

The Garmin driver supports all modern Garmin watches via USB mass storage:

```typescript
import { createGarminDriver } from 'ts-watches'

const driver = createGarminDriver()

// Detect connected devices
const devices = await driver.detectDevices()

for (const device of devices) {
  console.log(`${device.productName} (${device.serialNumber})`)
  console.log(`  Mounted at: ${device.mountPoint}`)
}
```

Download data from a device:

```typescript
const result = await driver.downloadData(devices[0], {
  outputDir: './garmin-data',
  includeActivities: true,
  includeMonitoring: true,
  since: new Date('2024-01-01'),
  copyRawFiles: true, // Keep original FIT files
})

console.log(`Activities: ${result.activities.length}`)
console.log(`Days of monitoring: ${result.monitoring.size}`)
```

### Other Devices

```typescript
import {
  createPolarDriver,
  createSuuntoDriver,
  createCorosDriver,
  createWahooDriver,
  createAppleHealthDriver,
} from 'ts-watches'

// Polar HRM files
const polar = createPolarDriver()
const hrData = await polar.parseHrmFile('./session.hrm')

// Suunto SML files
const suunto = createSuuntoDriver()
const activity = await suunto.parseSmlFile('./move.sml')

// Apple Health export
const apple = createAppleHealthDriver()
const healthData = await apple.parseExport('./apple_health_export')
```

## Parsing FIT Files

### Activities

Parse activity files for workouts:

```typescript
const activity = await driver.parseActivityFile('./running.fit')

// Basic info
console.log(`Sport: ${activity.sport}`)
console.log(`Start: ${activity.startTime}`)
console.log(`Distance: ${(activity.totalDistance / 1000).toFixed(2)} km`)
console.log(`Duration: ${Math.floor(activity.totalTime / 60)} min`)

// Heart rate
if (activity.avgHeartRate) {
  console.log(`Avg HR: ${activity.avgHeartRate} bpm`)
  console.log(`Max HR: ${activity.maxHeartRate} bpm`)
}

// Running metrics
if (activity.avgCadence) {
  console.log(`Cadence: ${activity.avgCadence * 2} spm`) // Double for running
}

// Cycling metrics
if (activity.avgPower) {
  console.log(`Avg Power: ${activity.avgPower} W`)
  console.log(`Normalized Power: ${activity.normalizedPower} W`)
}

// GPS data
for (const record of activity.records) {
  if (record.position) {
    console.log(`${record.position.lat}, ${record.position.lng}`)
  }
}
```

### Lap Data

Access lap splits:

```typescript
for (const lap of activity.laps) {
  const paceMin = Math.floor(lap.totalTime / lap.totalDistance * 1000 / 60)
  const paceSec = Math.round((lap.totalTime / lap.totalDistance * 1000) % 60)

  console.log(`Lap ${lap.lapIndex}: ${(lap.totalDistance / 1000).toFixed(2)} km`)
  console.log(`  Time: ${Math.floor(lap.totalTime / 60)}:${(lap.totalTime % 60).toFixed(0).padStart(2, '0')}`)
  console.log(`  Pace: ${paceMin}:${paceSec.toString().padStart(2, '0')} /km`)
  console.log(`  Avg HR: ${lap.avgHeartRate} bpm`)
}
```

### Monitoring Data

Parse daily health monitoring:

```typescript
const monitoring = await driver.parseMonitoringFile('./monitoring.fit')

// Daily heart rate
for (const hr of monitoring.heartRate) {
  console.log(`${hr.timestamp}: ${hr.heartRate} bpm`)
}

// Sleep data
if (monitoring.sleep) {
  console.log(`Sleep duration: ${monitoring.sleep.totalSleep / 60} hours`)
  console.log(`Deep sleep: ${monitoring.sleep.deepSleep / 60} hours`)
  console.log(`REM sleep: ${monitoring.sleep.remSleep / 60} hours`)
}

// Stress levels
for (const stress of monitoring.stress) {
  console.log(`${stress.timestamp}: ${stress.level}`)
}

// SpO2 readings
for (const spo2 of monitoring.spo2) {
  console.log(`${spo2.timestamp}: ${spo2.percentage}%`)
}
```

## Data Export

### GPX Format

Export with Garmin TrackPoint extensions:

```typescript
import { activityToGpx } from 'ts-watches'

const gpx = activityToGpx(activity, {
  creator: 'ts-watches',
  includeExtensions: true, // HR, cadence, power
})

await Bun.write('activity.gpx', gpx)
```

### TCX Format

For uploading to Strava or other platforms:

```typescript
import { activityToTcx } from 'ts-watches'

const tcx = activityToTcx(activity)
await Bun.write('activity.tcx', tcx)
```

### CSV Export

For spreadsheet analysis:

```typescript
import { activityToCsv, monitoringToCsv } from 'ts-watches'

// Activity records
const activityCsv = activityToCsv(activity, {
  columns: ['timestamp', 'heartRate', 'speed', 'power', 'cadence'],
})
await Bun.write('activity.csv', activityCsv)

// Daily monitoring
const monitoringCsv = monitoringToCsv(monitoring, {
  columns: ['timestamp', 'heartRate', 'stress', 'steps'],
})
await Bun.write('monitoring.csv', monitoringCsv)
```

### GeoJSON

For mapping applications:

```typescript
import { activityToGeoJson } from 'ts-watches'

const geojson = activityToGeoJson(activity, {
  simplify: true,
  tolerance: 0.0001, // Douglas-Peucker tolerance
  includeProperties: true,
})

await Bun.write('activity.geojson', JSON.stringify(geojson, null, 2))
```

## Training Analysis

### Training Stress Score

Calculate TSS for power or heart rate:

```typescript
import { calculateTSS, calculateHrTSS, calculateTrainingLoad } from 'ts-watches'

// Power-based TSS (cycling)
const powerTss = calculateTSS(activity, { ftp: 250 })

// Heart rate-based TSS (running)
const hrTss = calculateHrTSS(activity, {
  maxHR: 185,
  restingHR: 50,
  lthr: 165,
})

// Full training load analysis
const load = calculateTrainingLoad(activities, {
  ftp: 250,
  maxHR: 185,
  restingHR: 50,
})

console.log(`ATL (Fatigue): ${load.atl.toFixed(1)}`)
console.log(`CTL (Fitness): ${load.ctl.toFixed(1)}`)
console.log(`TSB (Form): ${load.tsb.toFixed(1)}`)
console.log(`Recommendation: ${load.recommendation}`)
```

### Zone Analysis

Analyze time in zones:

```typescript
import { ZoneCalculator } from 'ts-watches'

const zones = new ZoneCalculator({
  maxHR: 185,
  restingHR: 50,
  lthr: 165,
  ftp: 250,
})

// Get zone definitions
const hrZones = zones.getHeartRateZones('percentage') // or 'karvonen', 'lthr'
const powerZones = zones.getPowerZones()

// Analyze activity
const analysis = zones.analyzeActivity(activity)

for (const zone of analysis.heartRateZones) {
  console.log(`Zone ${zone.zone}: ${zone.timeInZone}s (${zone.percentTime.toFixed(1)}%)`)
}
```

### Race Predictions

Predict race times from recent performances:

```typescript
import { RacePredictor } from 'ts-watches'

const predictor = new RacePredictor()

// From a known performance (5K in 20 minutes)
const predictions = predictor.predictFromPerformance(5000, 20 * 60)

console.log(`10K: ${formatTime(predictions['10K'])}`)
console.log(`Half Marathon: ${formatTime(predictions.halfMarathon)}`)
console.log(`Marathon: ${formatTime(predictions.marathon)}`)

// VO2max estimation
const vo2max = predictor.estimateVO2max(5000, 20 * 60)
console.log(`Estimated VO2max: ${vo2max.toFixed(1)} ml/kg/min`)

// Training paces
const paces = predictor.getTrainingPaces(5000, 20 * 60)
console.log(`Easy pace: ${paces.easy} /km`)
console.log(`Tempo pace: ${paces.tempo} /km`)
console.log(`Interval pace: ${paces.interval} /km`)
```

### Personal Records

Track PRs across activities:

```typescript
import { PersonalRecordsTracker } from 'ts-watches'

const prTracker = new PersonalRecordsTracker()

// Process historical activities
for (const activity of activities) {
  const newPRs = prTracker.processActivity(activity)

  if (newPRs.length > 0) {
    console.log(`New PRs in ${activity.name}:`)
    for (const pr of newPRs) {
      console.log(`  ${pr.type}: ${pr.value}`)
    }
  }
}

// Get all PRs
const allPRs = prTracker.getAllRecords()
console.log(`Fastest 5K: ${formatTime(allPRs.running['5K']?.time)}`)
console.log(`Longest run: ${allPRs.running.longestDistance?.distance / 1000} km`)
```

## Cloud Integration

### Garmin Connect

Sync with Garmin Connect API:

```typescript
import { GarminConnectClient } from 'ts-watches'

const client = new GarminConnectClient()

// Login
await client.login('email@example.com', 'password')

// Get activities
const activities = await client.getActivities(new Date('2024-01-01'))

// Get daily summary
const summary = await client.getDailySummary(new Date())
console.log(`Steps: ${summary.steps}`)
console.log(`Calories: ${summary.calories}`)

// Get health data
const sleep = await client.getSleepData(new Date())
const stress = await client.getStressData(new Date())
const hrv = await client.getHRVData(new Date())
```

### Strava

Upload and sync with Strava:

```typescript
import { StravaClient } from 'ts-watches'

const strava = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
})

// OAuth flow
const authUrl = strava.getAuthorizationUrl('http://localhost:3000/callback')
// Redirect user to authUrl...

// After callback with code
await strava.exchangeToken(code)

// Upload activity
const tcx = activityToTcx(activity)
const result = await strava.uploadActivity(tcx, {
  name: 'Morning Run',
  description: 'Easy recovery run',
  sport: 'run',
})

// Get activity streams
const streams = await strava.getActivityStreams(activityId, [
  'heartrate',
  'watts',
  'cadence',
])
```

## Workout Builder

Create structured workouts:

```typescript
import { WorkoutBuilder, workoutTemplates } from 'ts-watches'

// Use a template
const vo2max = workoutTemplates.vo2maxIntervals({ ftp: 250 })
const sweetSpot = workoutTemplates.sweetSpot({ ftp: 250 })

// Build custom workout
const workout = new WorkoutBuilder('Threshold Intervals')
  .warmup({ duration: 600, targetPower: { min: 100, max: 150 } })
  .interval({ duration: 1200, targetPower: { min: 240, max: 260 } })
  .recovery({ duration: 300, targetPower: { min: 100, max: 130 } })
  .repeat(4)
  .cooldown({ duration: 600, targetPower: { min: 100, max: 130 } })
  .build()
```

## Real-time Data

### Live Tracking

Share position and metrics in real-time:

```typescript
import { createLiveTracking, formatLiveStats } from 'ts-watches'

const tracker = createLiveTracking({
  updateInterval: 5000,
  enableHeartRate: true,
  enablePower: true,
  onUpdate: (session) => {
    const stats = formatLiveStats(session)
    console.log(`Distance: ${stats.distance}`)
    console.log(`Duration: ${stats.duration}`)
    console.log(`Pace: ${stats.pace}`)
  },
})

// Start tracking
const session = tracker.start('Morning Run')

// Update position (from GPS)
tracker.updatePosition({ lat: 37.7749, lng: -122.4194, altitude: 10 })

// Update metrics (from sensors)
tracker.updateHeartRate(145)
tracker.updatePower(220)
tracker.updateCadence(88)

// Stop tracking
const finalSession = tracker.stop()
```

### Bluetooth Sensors

Connect to BLE heart rate monitors and power meters:

```typescript
import { createBleScanner, BLE_SERVICES } from 'ts-watches'

const ble = createBleScanner()

// Scan for devices
await ble.startScanning([BLE_SERVICES.HEART_RATE, BLE_SERVICES.CYCLING_POWER])

ble.on('device_found', (device) => {
  console.log(`Found: ${device.name} (${device.type})`)
})

// Connect to device
await ble.connect(deviceId)

// Receive data
ble.on('data', (device, data) => {
  if (data.type === 'heart_rate') {
    console.log(`HR: ${data.data.heartRate} bpm`)
    if (data.data.rrIntervals) {
      console.log(`RR: ${data.data.rrIntervals.join(', ')} ms`)
    }
  }

  if (data.type === 'power') {
    console.log(`Power: ${data.data.instantPower} W`)
  }
})
```

## CLI Usage

The `watch` CLI provides quick access to common operations:

```bash
# Detect devices
watch detect

# Download all data
watch download --output ./data

# Download activities only
watch download --activities --since 2024-01-01

# Parse and display FIT file
watch parse ./activity.fit

# Parse as JSON
watch parse ./activity.fit --format json

# Watch for device connections
watch watch --output ./auto-sync

# Show help
watch --help
```
