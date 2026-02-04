# Installation

Get ts-watches set up in your project.

[[toc]]

## Requirements

- **Bun** v1.0+ or **Node.js** v18+
- TypeScript 5.0+ (recommended)

## Package Manager

::: code-group

```bash [bun]
bun add ts-watches
```

```bash [npm]
npm install ts-watches
```

```bash [pnpm]
pnpm add ts-watches
```

```bash [yarn]
yarn add ts-watches
```

:::

## CLI Installation

For command-line usage, install globally:

::: code-group

```bash [bun]
bun add -g ts-watches
```

```bash [npm]
npm install -g ts-watches
```

:::

Then use the `watch` command:

```bash
watch detect
watch download --output ./data
watch parse ./activity.fit
```

## TypeScript Configuration

ts-watches is written in TypeScript and ships with full type definitions. No additional `@types` packages needed.

Recommended `tsconfig.json` settings:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  }
}
```

## Importing

### ES Modules

```typescript
import {
  createGarminDriver,
  activityToGpx,
  calculateTSS,
  ZoneCalculator,
} from 'ts-watches'
```

### Specific Modules

Import from specific subpaths for smaller bundles:

```typescript
// Just the FIT parser
import { FitParser, FitDecoder } from 'ts-watches/fit'

// Just export functions
import { activityToGpx, activityToTcx } from 'ts-watches/export'

// Just analysis tools
import { calculateTSS, RacePredictor } from 'ts-watches/analysis'
```

### Type Imports

```typescript
import type {
  Activity,
  ActivityRecord,
  GarminDevice,
  WatchDriver,
  SleepData,
  HRVData,
} from 'ts-watches'
```

## Verification

Verify installation with a simple test:

```typescript
import { createGarminDriver } from 'ts-watches'

const driver = createGarminDriver()
const devices = await driver.detectDevices()

console.log(`Found ${devices.length} devices`)
```

Or with the CLI:

```bash
watch --version
```

## Device Setup

### Garmin Watches

For ts-watches to detect your Garmin device:

1. **Connect via USB** - Use the charging cable
2. **Set USB Mode** - On watch: Settings > System > USB Mode > **Mass Storage**
3. **Close Garmin Express** - It locks the device for MTP access
4. **Verify mount** - Device appears as `/Volumes/GARMIN` (macOS) or `D:\GARMIN` (Windows)

> [!WARNING]
> Garmin Express uses MTP protocol which prevents mass storage access. Close it before using ts-watches.

### Polar Devices

Export data from Polar Flow:

1. Log in to [flow.polar.com](https://flow.polar.com)
2. Go to Training > Training sessions
3. Select activities and export

### Apple Watch

Export from the Health app:

1. Open Health app on iPhone
2. Tap your profile picture
3. Scroll down and tap **Export All Health Data**
4. Extract the ZIP file

## Binaries

Pre-compiled binaries for the CLI:

::: code-group

```bash [macOS (arm64)]
curl -L https://github.com/stacksjs/ts-watches/releases/download/v0.1.0/watch-darwin-arm64 -o watch
chmod +x watch
mv watch /usr/local/bin/watch
```

```bash [macOS (x64)]
curl -L https://github.com/stacksjs/ts-watches/releases/download/v0.1.0/watch-darwin-x64 -o watch
chmod +x watch
mv watch /usr/local/bin/watch
```

```bash [Linux (arm64)]
curl -L https://github.com/stacksjs/ts-watches/releases/download/v0.1.0/watch-linux-arm64 -o watch
chmod +x watch
mv watch /usr/local/bin/watch
```

```bash [Linux (x64)]
curl -L https://github.com/stacksjs/ts-watches/releases/download/v0.1.0/watch-linux-x64 -o watch
chmod +x watch
mv watch /usr/local/bin/watch
```

```bash [Windows (x64)]
curl -L https://github.com/stacksjs/ts-watches/releases/download/v0.1.0/watch-windows-x64.exe -o watch.exe
move watch.exe C:\Windows\System32\watch.exe
```

:::

## Troubleshooting

### Device Not Detected

- Ensure USB mode is set to Mass Storage
- Close Garmin Express or other sync software
- Try a different USB port or cable
- Check if device mounts in Finder/Explorer

### Permission Errors

On macOS, you may need to grant disk access:

```bash
# If you see permission errors
sudo chown -R $(whoami) /Volumes/GARMIN
```

### Module Not Found

Ensure you're using a compatible module system:

```json
{
  "type": "module"
}
```

Or use the CommonJS build:

```javascript
const { createGarminDriver } = require('ts-watches')
```
