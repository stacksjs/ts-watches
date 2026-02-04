# API Reference

Complete API documentation for ts-watches.

[[toc]]

## Core Types

### Activity

Represents a parsed activity from a FIT file:

```typescript
interface Activity {
  name?: string
  sport: SportType
  subSport?: SubSportType
  startTime: Date
  endTime?: Date
  totalTime: number // seconds
  totalDistance: number // meters
  totalCalories?: number
  avgHeartRate?: number
  maxHeartRate?: number
  avgCadence?: number
  maxCadence?: number
  avgSpeed?: number // m/s
  maxSpeed?: number // m/s
  avgPower?: number // watts
  maxPower?: number // watts
  normalizedPower?: number
  totalAscent?: number // meters
  totalDescent?: number // meters
  avgTemperature?: number
  maxTemperature?: number
  trainingStressScore?: number
  intensityFactor?: number
  laps: ActivityLap[]
  records: ActivityRecord[]
  events?: ActivityEvent[]
  deviceInfo?: DeviceInfo
}
```

### ActivityRecord

Individual data points within an activity:

```typescript
interface ActivityRecord {
  timestamp: Date
  position?: GeoPosition
  altitude?: number // meters
  heartRate?: number // bpm
  cadence?: number // rpm or spm
  speed?: number // m/s
  power?: number // watts
  temperature?: number // celsius
  distance?: number // cumulative meters
  grade?: number // percentage
  verticalOscillation?: number // mm
  groundContactTime?: number // ms
  stanceTimePercent?: number
  strideLength?: number // meters
}
```

### GeoPosition

GPS coordinates:

```typescript
interface GeoPosition {
  lat: number // degrees
  lng: number // degrees
  altitude?: number // meters
  timestamp?: Date
}
```

### MonitoringData

Daily health monitoring data:

```typescript
interface MonitoringData {
  date: Date
  heartRate: DailyHeartRate[]
  steps: DailySteps[]
  stress: StressData[]
  sleep?: SleepData
  spo2: SpO2Data[]
  respiration: RespirationData[]
  hrv: HRVData[]
  bodyBattery: BodyBattery[]
}
```

### SleepData

Sleep tracking data:

```typescript
interface SleepData {
  startTime: Date
  endTime: Date
  totalSleep: number // seconds
  deepSleep: number // seconds
  lightSleep: number // seconds
  remSleep: number // seconds
  awakeTime: number // seconds
  sleepScore?: number // 0-100
  sleepLevels: SleepLevel[]
}
```

### HRVData

Heart rate variability data:

```typescript
interface HRVData {
  timestamp: Date
  rmssd: number // ms
  sdrr?: number // ms
  pnn50?: number // percentage
  hrvScore?: number // 0-100
}
```

## Device Drivers

### GarminDriver

```typescript
interface GarminDriver extends WatchDriver {
  detectDevices(): Promise<GarminDevice[]>
  downloadData(device: GarminDevice, options: DownloadOptions): Promise<DownloadResult>
  parseActivityFile(path: string): Promise<Activity>
  parseMonitoringFile(path: string): Promise<MonitoringData>
}

// Factory function
function createGarminDriver(): GarminDriver
```

### GarminDevice

```typescript
interface GarminDevice extends WatchDevice {
  serialNumber: string
  productName: string
  softwareVersion?: string
  hardwareVersion?: string
  mountPoint: string
  activityDir: string
  monitoringDir: string
}
```

### DownloadOptions

```typescript
interface DownloadOptions {
  outputDir: string
  includeActivities?: boolean
  includeMonitoring?: boolean
  since?: Date
  until?: Date
  copyRawFiles?: boolean
  onProgress?: (current: number, total: number) => void
}
```

### DownloadResult

```typescript
interface DownloadResult {
  activities: Activity[]
  monitoring: Map<string, MonitoringData>
  rawFiles?: string[]
  errors?: Error[]
}
```

## FIT Parser

### FitParser

Low-level FIT file parser:

```typescript
class FitParser {
  constructor(options?: FitParserOptions)
  parse(buffer: ArrayBuffer): FitFile
}

interface FitParserOptions {
  includeDeveloperFields?: boolean
  includeUnknownFields?: boolean
  verbose?: boolean
}

interface FitFile {
  header: FitHeader
  messages: FitMessage[]
  crc: number
}
```

### FitDecoder

High-level decoder for activities and monitoring:

```typescript
class FitDecoder {
  decodeActivity(messages: FitMessage[]): Activity
  decodeMonitoring(messages: FitMessage[]): MonitoringData
}
```

## Export Functions

### GPX Export

```typescript
function activityToGpx(activity: Activity, options?: GpxOptions): string

interface GpxOptions {
  creator?: string
  includeExtensions?: boolean
  includeHeartRate?: boolean
  includeCadence?: boolean
  includePower?: boolean
  includeElevation?: boolean
}
```

### TCX Export

```typescript
function activityToTcx(activity: Activity, options?: TcxOptions): string

interface TcxOptions {
  includeLaps?: boolean
  includeTrackPoints?: boolean
  includeExtensions?: boolean
}
```

### CSV Export

```typescript
function activityToCsv(activity: Activity, options?: CsvOptions): string
function monitoringToCsv(data: MonitoringData, options?: CsvOptions): string

interface CsvOptions {
  columns?: string[]
  delimiter?: string
  includeHeader?: boolean
  dateFormat?: 'ISO' | 'UNIX'
}
```

### GeoJSON Export

```typescript
function activityToGeoJson(activity: Activity, options?: GeoJsonOptions): GeoJSON.FeatureCollection

interface GeoJsonOptions {
  simplify?: boolean
  tolerance?: number
  includeProperties?: boolean
  includePointProperties?: boolean
}
```

## Training Analysis

### Training Load

```typescript
function calculateTSS(activity: Activity, options: TssOptions): number
function calculateHrTSS(activity: Activity, options: HrTssOptions): number
function calculateTrainingLoad(activities: Activity[], options: TrainingLoadOptions): TrainingLoadResult

interface TssOptions {
  ftp: number // Functional Threshold Power
}

interface HrTssOptions {
  maxHR: number
  restingHR: number
  lthr: number // Lactate Threshold HR
  gender?: 'male' | 'female'
}

interface TrainingLoadOptions {
  ftp?: number
  maxHR?: number
  restingHR?: number
  lthr?: number
  atlTimeConstant?: number // default: 7
  ctlTimeConstant?: number // default: 42
}

interface TrainingLoadResult {
  atl: number // Acute Training Load (fatigue)
  ctl: number // Chronic Training Load (fitness)
  tsb: number // Training Stress Balance (form)
  rampRate: number
  recommendation: string
  dailyLoads: DailyLoad[]
}
```

### Zone Calculator

```typescript
class ZoneCalculator {
  constructor(options: ZoneCalculatorOptions)
  getHeartRateZones(method?: 'percentage' | 'karvonen' | 'lthr'): Zone[]
  getPowerZones(): Zone[]
  analyzeActivity(activity: Activity): ZoneAnalysis
}

interface ZoneCalculatorOptions {
  maxHR?: number
  restingHR?: number
  lthr?: number
  ftp?: number
}

interface Zone {
  zone: number
  name: string
  min: number
  max: number
  description: string
}

interface ZoneAnalysis {
  heartRateZones: ZoneTime[]
  powerZones?: ZoneTime[]
  intensityFactor?: number
}

interface ZoneTime {
  zone: number
  timeInZone: number // seconds
  percentTime: number
}
```

### Race Predictor

```typescript
class RacePredictor {
  constructor(options?: RacePredictorOptions)
  predictFromPerformance(distance: number, time: number): RacePredictions
  estimateVO2max(distance: number, time: number): number
  calculateVDOT(distance: number, time: number): number
  getTrainingPaces(distance: number, time: number): TrainingPaces
}

interface RacePredictions {
  '5K': number
  '10K': number
  halfMarathon: number
  marathon: number
  [key: string]: number
}

interface TrainingPaces {
  easy: string
  marathon: string
  tempo: string
  interval: string
  repetition: string
}
```

### Personal Records

```typescript
class PersonalRecordsTracker {
  processActivity(activity: Activity): PersonalRecord[]
  getRecord(type: string, sport: SportType): PersonalRecord | null
  getAllRecords(): AllRecords
}

interface PersonalRecord {
  type: string
  value: number
  activity: Activity
  date: Date
  sport: SportType
}
```

### Running Dynamics

```typescript
class RunningDynamicsAnalyzer {
  analyzeForm(activity: Activity): RunningFormAnalysis
  calculateEfficiency(activity: Activity): number
  getRecommendations(analysis: RunningFormAnalysis): string[]
}

interface RunningFormAnalysis {
  avgCadence: number
  avgGroundContactTime: number
  avgVerticalOscillation: number
  avgStrideLength: number
  verticalRatio: number
  formScore: number
  recommendations: string[]
}
```

## Cloud Clients

### Garmin Connect

```typescript
class GarminConnectClient {
  constructor(options?: GarminConnectOptions)
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
  getActivities(since?: Date, limit?: number): Promise<GarminActivity[]>
  getActivity(activityId: string): Promise<GarminActivity>
  getDailySummary(date: Date): Promise<DailySummary>
  getSleepData(date: Date): Promise<SleepData>
  getStressData(date: Date): Promise<StressData[]>
  getHRVData(date: Date): Promise<HRVData[]>
  getBodyBattery(date: Date): Promise<BodyBattery[]>
}
```

### Strava

```typescript
class StravaClient {
  constructor(options: StravaOptions)
  getAuthorizationUrl(redirectUri: string, scope?: string[]): string
  exchangeToken(code: string): Promise<StravaTokens>
  refreshAccessToken(): Promise<StravaTokens>
  getAthlete(): Promise<StravaAthlete>
  getActivities(page?: number, perPage?: number): Promise<StravaActivity[]>
  getActivity(activityId: string): Promise<StravaActivity>
  getActivityStreams(activityId: string, types: string[]): Promise<StravaStreams>
  uploadActivity(file: string, options: UploadOptions): Promise<UploadResult>
}

interface StravaOptions {
  clientId: string
  clientSecret: string
  accessToken?: string
  refreshToken?: string
}
```

## Workout Builder

### WorkoutBuilder

```typescript
class WorkoutBuilder {
  constructor(name: string)
  warmup(step: WorkoutStep): this
  interval(step: WorkoutStep): this
  recovery(step: WorkoutStep): this
  cooldown(step: WorkoutStep): this
  repeat(times: number): this
  rest(duration: number): this
  build(): Workout
}

interface WorkoutStep {
  duration: number // seconds
  targetPower?: { min: number; max: number }
  targetHeartRate?: { min: number; max: number }
  targetCadence?: { min: number; max: number }
  notes?: string
}

interface Workout {
  name: string
  steps: WorkoutStep[]
  totalDuration: number
  estimatedTSS?: number
}
```

### Workout Templates

```typescript
const workoutTemplates = {
  vo2maxIntervals(options: { ftp: number }): Workout
  sweetSpot(options: { ftp: number }): Workout
  threshold(options: { ftp: number }): Workout
  endurance(options: { ftp: number }): Workout
  recovery(options: { ftp: number }): Workout
}
```

### Course Builder

```typescript
class CourseBuilder {
  constructor(name: string)
  addPoint(point: GeoPosition, name?: string): this
  addWaypoint(point: GeoPosition, name: string): this
  setDescription(description: string): this
  build(): Course
}

function courseToGpx(course: Course): string
function courseToTcx(course: Course): string
```

### Training Plans

```typescript
function generateMarathonPlan(options: MarathonPlanOptions): TrainingPlan
function generate5kPlan(options: PlanOptions): TrainingPlan
function planToIcal(plan: TrainingPlan): string

interface TrainingPlan {
  name: string
  weeks: TrainingWeek[]
  startDate: Date
  endDate: Date
  goalRace?: string
}
```

## Real-time

### Live Tracking

```typescript
class LiveTrackingManager {
  constructor(config?: LiveTrackingConfig)
  start(name?: string): LiveTrackingSession
  stop(): LiveTrackingSession | null
  pause(): void
  resume(): void
  updatePosition(position: GeoPosition): void
  updateHeartRate(heartRate: number): void
  updatePower(power: number): void
  updateCadence(cadence: number): void
  getSession(): LiveTrackingSession | null
  getShareUrl(): string | null
  on<K extends keyof LiveTrackingEventHandler>(event: K, handler: LiveTrackingEventHandler[K]): void
  off<K extends keyof LiveTrackingEventHandler>(event: K, handler: LiveTrackingEventHandler[K]): void
}

function createLiveTracking(config?: LiveTrackingConfig): LiveTrackingManager
function formatLiveStats(session: LiveTrackingSession): FormattedStats
```

### Bluetooth LE

```typescript
interface BleScanner {
  startScanning(services?: string[]): Promise<void>
  stopScanning(): Promise<void>
  getDevices(): BleDevice[]
  connect(deviceId: string): Promise<void>
  disconnect(deviceId: string): Promise<void>
  subscribe(deviceId: string, characteristic: string): Promise<void>
  on(event: 'data', handler: BleEventHandler): void
  on(event: 'device_found', handler: (device: BleDevice) => void): void
  on(event: 'connected', handler: (device: BleDevice) => void): void
  on(event: 'disconnected', handler: (device: BleDevice) => void): void
  on(event: 'error', handler: (error: Error) => void): void
  isAvailable(): Promise<boolean>
  close(): Promise<void>
}

function createBleScanner(): BleScanner
function parseHeartRateMeasurement(data: DataView): BleHeartRateData
function parsePowerMeasurement(data: DataView): BlePowerData
```

### ANT+

```typescript
interface AntPlusScanner {
  startScanning(): Promise<void>
  stopScanning(): Promise<void>
  getDevices(): AntPlusDevice[]
  connect(deviceId: string): Promise<void>
  disconnect(deviceId: string): Promise<void>
  on(event: 'data', handler: AntPlusEventHandler): void
  on(event: 'device_found', handler: (device: AntPlusDevice) => void): void
  isAvailable(): Promise<boolean>
  close(): Promise<void>
}

function createAntPlusScanner(): AntPlusScanner
```

## Constants

### BLE Services

```typescript
const BLE_SERVICES = {
  HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
  CYCLING_SPEED_CADENCE: '00001816-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER: '00001818-0000-1000-8000-00805f9b34fb',
  RUNNING_SPEED_CADENCE: '00001814-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE: '00001826-0000-1000-8000-00805f9b34fb',
}
```

### Sport Types

```typescript
type SportType =
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'hiking'
  | 'walking'
  | 'strength_training'
  | 'cardio'
  | 'multisport'
  // ... 50+ more
```

### FIT Constants

```typescript
const MESG_NUM = {
  FILE_ID: 0,
  CAPABILITIES: 1,
  DEVICE_SETTINGS: 2,
  USER_PROFILE: 3,
  // ... many more
}

const FIELD_DEF = {
  TIMESTAMP: 253,
  MESSAGE_INDEX: 254,
  // ... many more
}
```
