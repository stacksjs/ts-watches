# Showcase

Projects and tools built using `ts-watches`.

## Community Projects

- _Yours could be here!_

If you authored a project you'd like to showcase, please share it with us in any way _(on Discord, Social Media, or via a PR, etc.)_, and we'll add it here.

## Use Cases

### Fitness Data Analysis

```typescript
import { createGarminDriver, calculateTrainingLoad, ZoneCalculator } from 'ts-watches'

// Download and analyze training data
const driver = createGarminDriver()
const devices = await driver.detectDevices()
const result = await driver.downloadData(devices[0], { includeActivities: true })

// Calculate training load
const load = calculateTrainingLoad(result.activities, { ftp: 250, maxHR: 185 })
console.log(`Current fitness: ${load.ctl.toFixed(1)}`)
console.log(`Recommendation: ${load.recommendation}`)
```

### Activity Export

```typescript
import { createGarminDriver, activityToGpx } from 'ts-watches'

// Parse and export to GPX
const driver = createGarminDriver()
const activity = await driver.parseActivityFile('./morning-run.fit')
const gpx = activityToGpx(activity)
await Bun.write('morning-run.gpx', gpx)
```

### Race Time Prediction

```typescript
import { RacePredictor } from 'ts-watches'

// Predict race times from a 5K performance
const predictor = new RacePredictor()
const times = predictor.predictFromPerformance(5000, 20 * 60) // 20 minute 5K

console.log(`10K prediction: ${formatTime(times['10K'])}`)
console.log(`Marathon prediction: ${formatTime(times.marathon)}`)
```

### Real-time Heart Rate Display

```typescript
import { createBleScanner, BLE_SERVICES } from 'ts-watches'

const ble = createBleScanner()
await ble.startScanning([BLE_SERVICES.HEART_RATE])

ble.on('device_found', async (device) => {
  await ble.connect(device.id)
})

ble.on('data', (device, data) => {
  if (data.type === 'heart_rate') {
    console.log(`Heart Rate: ${data.data.heartRate} bpm`)
  }
})
```

We try to keep the list up-to-date, but it's possible that some packages are missing. If you find any, please let us know!
