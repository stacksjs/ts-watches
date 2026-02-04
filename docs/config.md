# Configuration

Configure ts-watches behavior for your needs.

[[toc]]

## Driver Configuration

### Download Options

Control what data gets downloaded from devices:

```typescript
import { createGarminDriver } from 'ts-watches'

const driver = createGarminDriver()

const result = await driver.downloadData(device, {
  // Output directory for downloaded files
  outputDir: './data',

  // Include activity FIT files
  includeActivities: true,

  // Include daily monitoring data
  includeMonitoring: true,

  // Only download data after this date
  since: new Date('2024-01-01'),

  // Only download data before this date
  until: new Date(),

  // Copy original FIT files (not just parsed data)
  copyRawFiles: true,

  // Callback for progress updates
  onProgress: (current, total) => {
    console.log(`Processing ${current}/${total}`)
  },
})
```

### Parse Options

Configure FIT file parsing:

```typescript
import { FitParser } from 'ts-watches/fit'

const parser = new FitParser({
  // Include developer fields
  includeDeveloperFields: true,

  // Include unknown fields
  includeUnknownFields: false,

  // Verbose logging
  verbose: false,
})
```

## Export Configuration

### GPX Options

```typescript
import { activityToGpx } from 'ts-watches'

const gpx = activityToGpx(activity, {
  // Creator application name
  creator: 'ts-watches',

  // Include Garmin TrackPoint extensions
  includeExtensions: true,

  // Include heart rate data
  includeHeartRate: true,

  // Include cadence data
  includeCadence: true,

  // Include power data
  includePower: true,

  // Include elevation data
  includeElevation: true,
})
```

### TCX Options

```typescript
import { activityToTcx } from 'ts-watches'

const tcx = activityToTcx(activity, {
  // Include lap data
  includeLaps: true,

  // Include track points
  includeTrackPoints: true,

  // Include extensions
  includeExtensions: true,
})
```

### CSV Options

```typescript
import { activityToCsv } from 'ts-watches'

const csv = activityToCsv(activity, {
  // Columns to include
  columns: [
    'timestamp',
    'lat',
    'lng',
    'altitude',
    'heartRate',
    'speed',
    'power',
    'cadence',
    'temperature',
  ],

  // Column delimiter
  delimiter: ',',

  // Include header row
  includeHeader: true,

  // Date format
  dateFormat: 'ISO', // or 'UNIX'
})
```

### GeoJSON Options

```typescript
import { activityToGeoJson } from 'ts-watches'

const geojson = activityToGeoJson(activity, {
  // Simplify the track using Douglas-Peucker
  simplify: true,

  // Simplification tolerance (degrees)
  tolerance: 0.0001,

  // Include activity properties
  includeProperties: true,

  // Include per-point properties
  includePointProperties: false,
})
```

## Analysis Configuration

### Training Load

```typescript
import { calculateTrainingLoad } from 'ts-watches'

const load = calculateTrainingLoad(activities, {
  // Functional Threshold Power (cycling)
  ftp: 250,

  // Maximum heart rate
  maxHR: 185,

  // Resting heart rate
  restingHR: 50,

  // Lactate threshold heart rate
  lthr: 165,

  // ATL time constant (days)
  atlTimeConstant: 7,

  // CTL time constant (days)
  ctlTimeConstant: 42,
})
```

### Zone Calculator

```typescript
import { ZoneCalculator } from 'ts-watches'

const zones = new ZoneCalculator({
  // Heart rate settings
  maxHR: 185,
  restingHR: 50,
  lthr: 165, // Lactate threshold HR

  // Power settings
  ftp: 250, // Functional threshold power

  // Zone model
  zoneModel: 'coggan', // or 'british-cycling', 'polarized'
})
```

### Race Predictor

```typescript
import { RacePredictor } from 'ts-watches'

const predictor = new RacePredictor({
  // Riegel exponent (default: 1.06)
  exponent: 1.06,

  // Fatigue factor for longer distances
  fatigueFactor: 1.0,
})
```

## Cloud Configuration

### Garmin Connect

```typescript
import { GarminConnectClient } from 'ts-watches'

const client = new GarminConnectClient({
  // Request timeout (ms)
  timeout: 30000,

  // Retry failed requests
  retries: 3,

  // User agent string
  userAgent: 'ts-watches/1.0',
})
```

### Strava

```typescript
import { StravaClient } from 'ts-watches'

const strava = new StravaClient({
  // OAuth credentials
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,

  // Access token (if already authenticated)
  accessToken: process.env.STRAVA_ACCESS_TOKEN,

  // Refresh token (if already authenticated)
  refreshToken: process.env.STRAVA_REFRESH_TOKEN,

  // Request timeout (ms)
  timeout: 30000,
})
```

## Real-time Configuration

### Live Tracking

```typescript
import { createLiveTracking } from 'ts-watches'

const tracker = createLiveTracking({
  // Update interval (ms)
  updateInterval: 5000,

  // Share URL base
  shareUrl: 'https://example.com/live',

  // Enable heart rate recording
  enableHeartRate: true,

  // Enable power recording
  enablePower: true,

  // Update callback
  onUpdate: (session) => {
    console.log(session)
  },

  // Error callback
  onError: (error) => {
    console.error(error)
  },
})
```

### Bluetooth Scanner

```typescript
import { createBleScanner } from 'ts-watches'

const ble = createBleScanner({
  // Scan duration (ms)
  scanDuration: 10000,

  // Auto-reconnect on disconnect
  autoReconnect: true,

  // Reconnect delay (ms)
  reconnectDelay: 5000,
})
```

## Environment Variables

ts-watches supports configuration via environment variables:

```bash
# Garmin Connect credentials
GARMIN_EMAIL=your@email.com
GARMIN_PASSWORD=your-password

# Strava OAuth
STRAVA_CLIENT_ID=your-client-id
STRAVA_CLIENT_SECRET=your-client-secret
STRAVA_ACCESS_TOKEN=your-access-token
STRAVA_REFRESH_TOKEN=your-refresh-token

# Default output directory
TS_WATCHES_OUTPUT_DIR=./data

# Verbose logging
TS_WATCHES_VERBOSE=true
```

Use in code:

```typescript
import { GarminConnectClient } from 'ts-watches'

const client = new GarminConnectClient()
await client.login(
  process.env.GARMIN_EMAIL!,
  process.env.GARMIN_PASSWORD!
)
```

## CLI Configuration

The CLI can be configured via command-line flags or a config file.

### Config File

Create `watch.config.ts` in your project root:

```typescript
export default {
  // Default output directory
  outputDir: './data',

  // Device settings
  device: {
    // Auto-detect devices
    autoDetect: true,

    // Preferred device type
    preferredType: 'garmin',
  },

  // Download settings
  download: {
    includeActivities: true,
    includeMonitoring: true,
    copyRawFiles: true,
  },

  // Export settings
  export: {
    format: 'gpx', // or 'tcx', 'csv', 'geojson'
    includeExtensions: true,
  },
}
```

### Command-Line Flags

```bash
# Override output directory
watch download --output ./my-data

# Specify date range
watch download --since 2024-01-01 --until 2024-12-31

# Activities only
watch download --activities

# Monitoring only
watch download --monitoring

# Verbose output
watch download --verbose

# Specify format
watch parse activity.fit --format json
```
