/**
 * ANT+ Protocol Implementation
 *
 * ANT+ is a wireless protocol used by fitness devices for real-time data transmission.
 * This module provides interfaces and utilities for ANT+ communication.
 *
 * Note: Actual ANT+ communication requires native USB access to an ANT+ stick.
 * This module provides the protocol layer - integration with ant-plus npm package
 * or native bindings is required for full functionality.
 */

export type AntPlusDeviceType =
  | 'heart_rate'
  | 'speed_cadence'
  | 'power_meter'
  | 'fitness_equipment'
  | 'running_dynamics'
  | 'environment'

export interface AntPlusDevice {
  deviceId: number
  deviceType: AntPlusDeviceType
  transmissionType: number
  name?: string
  batteryStatus?: 'new' | 'good' | 'ok' | 'low' | 'critical'
}

export interface HeartRateData {
  heartRate: number // bpm
  beatCount: number
  beatTime: number // ms
  rrIntervals?: number[] // ms
  operatingTime?: number // seconds
}

export interface SpeedCadenceData {
  speed?: number // m/s
  cadence?: number // rpm
  wheelRevolutions?: number
  crankRevolutions?: number
  wheelEventTime?: number
  crankEventTime?: number
}

export interface PowerData {
  instantPower: number // watts
  cadence?: number // rpm
  accumulatedPower?: number // watts
  pedalPowerBalance?: number // percentage left
  torqueEffectiveness?: { left: number; right: number }
  pedalSmoothness?: { left: number; right: number }
}

export interface RunningDynamicsData {
  cadence: number // steps per minute
  groundContactTime?: number // ms
  groundContactBalance?: number // percentage
  strideLength?: number // meters
  verticalOscillation?: number // cm
  verticalRatio?: number // percentage
  stanceTime?: number // ms
}

export interface FitnessEquipmentData {
  elapsedTime: number // seconds
  distance: number // meters
  speed: number // m/s
  heartRate?: number
  cadence?: number
  power?: number
  resistance?: number // 0-100 percentage
  incline?: number // percentage grade
  state: 'ready' | 'in_use' | 'finished' | 'paused'
}

export type AntPlusData =
  | { type: 'heart_rate'; data: HeartRateData }
  | { type: 'speed_cadence'; data: SpeedCadenceData }
  | { type: 'power_meter'; data: PowerData }
  | { type: 'running_dynamics'; data: RunningDynamicsData }
  | { type: 'fitness_equipment'; data: FitnessEquipmentData }

export type AntPlusEventHandler = (device: AntPlusDevice, data: AntPlusData) => void

/**
 * ANT+ Channel configuration
 */
export interface AntPlusChannelConfig {
  deviceType: AntPlusDeviceType
  deviceId?: number // 0 = wildcard (pair with any)
  transmissionType?: number
  frequency?: number
  period?: number
}

// ANT+ Device Profile Constants
export const ANT_PLUS_PROFILES = {
  HEART_RATE: {
    deviceType: 120,
    frequency: 57,
    period: 8070,
    searchTimeout: 30,
  },
  SPEED_CADENCE: {
    deviceType: 121,
    frequency: 57,
    period: 8086,
    searchTimeout: 30,
  },
  BIKE_SPEED: {
    deviceType: 123,
    frequency: 57,
    period: 8118,
    searchTimeout: 30,
  },
  BIKE_CADENCE: {
    deviceType: 122,
    frequency: 57,
    period: 8102,
    searchTimeout: 30,
  },
  POWER: {
    deviceType: 11,
    frequency: 57,
    period: 8182,
    searchTimeout: 30,
  },
  RUNNING_DYNAMICS: {
    deviceType: 26,
    frequency: 57,
    period: 8134,
    searchTimeout: 30,
  },
  FITNESS_EQUIPMENT: {
    deviceType: 17,
    frequency: 57,
    period: 8192,
    searchTimeout: 30,
  },
  ENVIRONMENT: {
    deviceType: 25,
    frequency: 57,
    period: 8070,
    searchTimeout: 30,
  },
} as const

/**
 * ANT+ Scanner interface
 *
 * Provides an interface for scanning and connecting to ANT+ devices.
 * Actual implementation requires native USB access via ant-plus package or similar.
 */
export interface AntPlusScanner {
  /**
   * Start scanning for devices
   */
  startScanning(deviceTypes?: AntPlusDeviceType[]): Promise<void>

  /**
   * Stop scanning
   */
  stopScanning(): Promise<void>

  /**
   * Get discovered devices
   */
  getDevices(): AntPlusDevice[]

  /**
   * Connect to a specific device
   */
  connect(deviceId: number): Promise<void>

  /**
   * Disconnect from a device
   */
  disconnect(deviceId: number): Promise<void>

  /**
   * Register event handler for data updates
   */
  on(event: 'data', handler: AntPlusEventHandler): void
  on(event: 'device_found', handler: (device: AntPlusDevice) => void): void
  on(event: 'device_lost', handler: (device: AntPlusDevice) => void): void
  on(event: 'error', handler: (error: Error) => void): void

  /**
   * Remove event handler
   */
  off(event: string, handler: (...args: any[]) => void): void

  /**
   * Check if ANT+ stick is available
   */
  isAvailable(): boolean

  /**
   * Close and cleanup
   */
  close(): Promise<void>
}

/**
 * Mock ANT+ Scanner for testing
 */
export class MockAntPlusScanner implements AntPlusScanner {
  private devices: AntPlusDevice[] = []
  private handlers: Map<string, Set<(...args: any[]) => void>> = new Map()
  private isRunning = false
  private intervals: NodeJS.Timeout[] = []

  async startScanning(_deviceTypes?: AntPlusDeviceType[]): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    // Simulate finding devices
    setTimeout(() => {
      const hrDevice: AntPlusDevice = {
        deviceId: 12345,
        deviceType: 'heart_rate',
        transmissionType: 1,
        name: 'Mock HR Sensor',
        batteryStatus: 'good',
      }
      this.devices.push(hrDevice)
      this.emit('device_found', hrDevice)

      // Start simulating data
      const hrInterval = setInterval(() => {
        if (!this.isRunning) return
        const data: HeartRateData = {
          heartRate: 70 + Math.floor(Math.random() * 30),
          beatCount: Math.floor(Math.random() * 255),
          beatTime: Date.now(),
        }
        this.emit('data', hrDevice, { type: 'heart_rate', data })
      }, 1000)
      this.intervals.push(hrInterval)
    }, 500)

    setTimeout(() => {
      const powerDevice: AntPlusDevice = {
        deviceId: 67890,
        deviceType: 'power_meter',
        transmissionType: 5,
        name: 'Mock Power Meter',
        batteryStatus: 'ok',
      }
      this.devices.push(powerDevice)
      this.emit('device_found', powerDevice)

      const powerInterval = setInterval(() => {
        if (!this.isRunning) return
        const data: PowerData = {
          instantPower: 150 + Math.floor(Math.random() * 100),
          cadence: 80 + Math.floor(Math.random() * 20),
          pedalPowerBalance: 48 + Math.random() * 4,
        }
        this.emit('data', powerDevice, { type: 'power_meter', data })
      }, 1000)
      this.intervals.push(powerInterval)
    }, 1000)
  }

  async stopScanning(): Promise<void> {
    this.isRunning = false
  }

  getDevices(): AntPlusDevice[] {
    return [...this.devices]
  }

  async connect(_deviceId: number): Promise<void> {
    // Mock connect - already receiving data
  }

  async disconnect(_deviceId: number): Promise<void> {
    // Mock disconnect
  }

  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
  }

  off(event: string, handler: (...args: any[]) => void): void {
    this.handlers.get(event)?.delete(handler)
  }

  private emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach(handler => handler(...args))
  }

  isAvailable(): boolean {
    return true
  }

  async close(): Promise<void> {
    this.isRunning = false
    this.intervals.forEach(i => clearInterval(i))
    this.intervals = []
    this.devices = []
    this.handlers.clear()
  }
}

/**
 * Create an ANT+ scanner
 * Returns a mock scanner - integrate with ant-plus package for real hardware
 */
export function createAntPlusScanner(): AntPlusScanner {
  return new MockAntPlusScanner()
}

/**
 * Calculate wheel speed from ANT+ speed sensor data
 */
export function calculateWheelSpeed(
  currentRevolutions: number,
  currentEventTime: number,
  previousRevolutions: number,
  previousEventTime: number,
  wheelCircumference: number // meters
): number {
  const revDiff = (currentRevolutions - previousRevolutions + 65536) % 65536
  const timeDiff = (currentEventTime - previousEventTime + 65536) % 65536

  if (timeDiff === 0) return 0

  // Event time is in 1/1024 seconds
  const timeSeconds = timeDiff / 1024
  const distance = revDiff * wheelCircumference

  return distance / timeSeconds // m/s
}

/**
 * Calculate cadence from ANT+ cadence sensor data
 */
export function calculateCadence(
  currentRevolutions: number,
  currentEventTime: number,
  previousRevolutions: number,
  previousEventTime: number
): number {
  const revDiff = (currentRevolutions - previousRevolutions + 65536) % 65536
  const timeDiff = (currentEventTime - previousEventTime + 65536) % 65536

  if (timeDiff === 0) return 0

  // Event time is in 1/1024 seconds
  const timeMinutes = timeDiff / 1024 / 60

  return revDiff / timeMinutes // rpm
}
