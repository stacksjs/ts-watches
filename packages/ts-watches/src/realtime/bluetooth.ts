/**
 * Bluetooth Low Energy (BLE) Heart Rate and Fitness Device Support
 *
 * This module provides interfaces for connecting to BLE fitness devices.
 * Uses Web Bluetooth API when available, or can be integrated with noble/bleno
 * for Node.js native Bluetooth access.
 */

export type BleDeviceType =
  | 'heart_rate'
  | 'cycling_speed_cadence'
  | 'cycling_power'
  | 'running_speed_cadence'
  | 'fitness_machine'

export interface BleDevice {
  id: string
  name: string
  type: BleDeviceType
  rssi?: number
  connected: boolean
}

export interface BleHeartRateData {
  heartRate: number
  contactDetected?: boolean
  energyExpended?: number // kJ
  rrIntervals?: number[] // ms
}

export interface BleCyclingData {
  speed?: number // m/s
  cadence?: number // rpm
  wheelRevolutions?: number
  crankRevolutions?: number
}

export interface BlePowerData {
  instantPower: number // watts
  pedalPowerBalance?: number
  accumulatedTorque?: number
  wheelRevolutions?: number
  crankRevolutions?: number
  cadence?: number
}

export interface BleRunningData {
  speed: number // m/s
  cadence: number // steps per minute
  strideLength?: number // meters
  totalDistance?: number // meters
}

export interface BleFitnessMachineData {
  speed?: number // m/s
  cadence?: number // rpm
  power?: number // watts
  heartRate?: number
  distance?: number // meters
  elapsedTime?: number // seconds
  resistance?: number // 0-100
  incline?: number // percentage
  status: 'idle' | 'warmup' | 'workout' | 'cooldown' | 'paused'
}

export type BleData =
  | {
    type: 'heart_rate'
    data: BleHeartRateData
  }
  | {
    type: 'cycling'
    data: BleCyclingData
  }
  | {
    type: 'power'
    data: BlePowerData
  }
  | {
    type: 'running'
    data: BleRunningData
  }
  | {
    type: 'fitness_machine'
    data: BleFitnessMachineData
  }

// BLE GATT Service UUIDs
export const BLE_SERVICES = {
  HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
  CYCLING_SPEED_CADENCE: '00001816-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER: '00001818-0000-1000-8000-00805f9b34fb',
  RUNNING_SPEED_CADENCE: '00001814-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE: '00001826-0000-1000-8000-00805f9b34fb',
  DEVICE_INFORMATION: '0000180a-0000-1000-8000-00805f9b34fb',
  BATTERY: '0000180f-0000-1000-8000-00805f9b34fb',
} as const

// BLE GATT Characteristic UUIDs
export const BLE_CHARACTERISTICS = {
  HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',
  BODY_SENSOR_LOCATION: '00002a38-0000-1000-8000-00805f9b34fb',
  CSC_MEASUREMENT: '00002a5b-0000-1000-8000-00805f9b34fb',
  CSC_FEATURE: '00002a5c-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER_MEASUREMENT: '00002a63-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER_FEATURE: '00002a65-0000-1000-8000-00805f9b34fb',
  RSC_MEASUREMENT: '00002a53-0000-1000-8000-00805f9b34fb',
  RSC_FEATURE: '00002a54-0000-1000-8000-00805f9b34fb',
  FITNESS_MACHINE_FEATURE: '00002acc-0000-1000-8000-00805f9b34fb',
  TREADMILL_DATA: '00002acd-0000-1000-8000-00805f9b34fb',
  INDOOR_BIKE_DATA: '00002ad2-0000-1000-8000-00805f9b34fb',
  BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',
} as const

export type BleEventHandler = (_device: BleDevice, _data: BleData) => void

/**
 * BLE Scanner interface
 */
export interface BleScanner {
  /**
   * Start scanning for devices
   */
  startScanning(services?: string[]): Promise<void>

  /**
   * Stop scanning
   */
  stopScanning(): Promise<void>

  /**
   * Get discovered devices
   */
  getDevices(): BleDevice[]

  /**
   * Connect to a device
   */
  connect(deviceId: string): Promise<void>

  /**
   * Disconnect from a device
   */
  disconnect(deviceId: string): Promise<void>

  /**
   * Subscribe to notifications from a device
   */
  subscribe(deviceId: string, characteristic: string): Promise<void>

  /**
   * Event handlers
   */
  on(event: 'data', handler: BleEventHandler): void
  on(event: 'device_found', handler: (_device: BleDevice) => void): void
  on(event: 'device_lost', handler: (_device: BleDevice) => void): void
  on(event: 'connected', handler: (_device: BleDevice) => void): void
  on(event: 'disconnected', handler: (_device: BleDevice) => void): void
  on(event: 'error', handler: (error: Error) => void): void

  off(event: string, handler: (...args: any[]) => void): void

  /**
   * Check if Bluetooth is available
   */
  isAvailable(): Promise<boolean>

  /**
   * Close and cleanup
   */
  close(): Promise<void>
}

/**
 * Parse heart rate measurement characteristic value
 */
export function parseHeartRateMeasurement(data: DataView): BleHeartRateData {
  const flags = data.getUint8(0)
  const is16Bit = (flags & 0x01) !== 0
  const hasContact = (flags & 0x02) !== 0
  const contactSupported = (flags & 0x04) !== 0
  const hasEnergyExpended = (flags & 0x08) !== 0
  const hasRrInterval = (flags & 0x10) !== 0

  let offset = 1
  const heartRate = is16Bit ? data.getUint16(offset, true) : data.getUint8(offset)
  offset += is16Bit ? 2 : 1

  let energyExpended: number | undefined
  if (hasEnergyExpended) {
    energyExpended = data.getUint16(offset, true)
    offset += 2
  }

  const rrIntervals: number[] = []
  if (hasRrInterval) {
    while (offset < data.byteLength) {
      // RR interval is in 1/1024 seconds
      const rr = data.getUint16(offset, true)
      rrIntervals.push(Math.round(rr * 1000 / 1024)) // Convert to ms
      offset += 2
    }
  }

  return {
    heartRate,
    contactDetected: contactSupported ? hasContact : undefined,
    energyExpended,
    rrIntervals: rrIntervals.length > 0 ? rrIntervals : undefined,
  }
}

/**
 * Parse cycling speed and cadence measurement
 */
export function parseCscMeasurement(
  data: DataView,
  prevWheelRevs?: number,
  prevWheelTime?: number,
  prevCrankRevs?: number,
  prevCrankTime?: number,
  wheelCircumference = 2.105 // meters (700x25c default)
): BleCyclingData {
  const flags = data.getUint8(0)
  const hasWheel = (flags & 0x01) !== 0
  const hasCrank = (flags & 0x02) !== 0

  let offset = 1
  let speed: number | undefined
  let cadence: number | undefined
  let wheelRevolutions: number | undefined
  let crankRevolutions: number | undefined

  if (hasWheel) {
    wheelRevolutions = data.getUint32(offset, true)
    offset += 4
    const wheelEventTime = data.getUint16(offset, true) // 1/1024 seconds
    offset += 2

    if (prevWheelRevs !== undefined && prevWheelTime !== undefined) {
      const revDiff = (wheelRevolutions - prevWheelRevs + 0x100000000) % 0x100000000
      const timeDiff = (wheelEventTime - prevWheelTime + 65536) % 65536

      if (timeDiff > 0) {
        const timeSeconds = timeDiff / 1024
        speed = (revDiff * wheelCircumference) / timeSeconds
      }
    }
  }

  if (hasCrank) {
    crankRevolutions = data.getUint16(offset, true)
    offset += 2
    const crankEventTime = data.getUint16(offset, true) // 1/1024 seconds

    if (prevCrankRevs !== undefined && prevCrankTime !== undefined) {
      const revDiff = (crankRevolutions - prevCrankRevs + 65536) % 65536
      const timeDiff = (crankEventTime - prevCrankTime + 65536) % 65536

      if (timeDiff > 0) {
        const timeMinutes = timeDiff / 1024 / 60
        cadence = revDiff / timeMinutes
      }
    }
  }

  return { speed, cadence, wheelRevolutions, crankRevolutions }
}

/**
 * Parse cycling power measurement
 */
export function parsePowerMeasurement(data: DataView): BlePowerData {
  const flags = data.getUint16(0, true)
  const instantPower = data.getInt16(2, true)

  let offset = 4
  let pedalPowerBalance: number | undefined
  let cadence: number | undefined

  // Check for pedal power balance
  if (flags & 0x01) {
    pedalPowerBalance = data.getUint8(offset)
    offset += 1
  }

  // Check for accumulated torque
  if (flags & 0x04) {
    offset += 2 // Skip accumulated torque
  }

  // Check for wheel revolution data
  if (flags & 0x10) {
    offset += 6 // Skip wheel data
  }

  // Check for crank revolution data
  if (flags & 0x20) {
    // Crank revolutions and last event time
    offset += 4
  }

  return {
    instantPower,
    pedalPowerBalance,
    cadence,
  }
}

/**
 * Mock BLE Scanner for testing
 */
export class MockBleScanner implements BleScanner {
  private devices: BleDevice[] = []
  private handlers: Map<string, Set<(...args: any[]) => void>> = new Map()
  private isRunning = false
  private intervals: NodeJS.Timeout[] = []

  async startScanning(_services?: string[]): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    // Simulate finding a heart rate monitor
    setTimeout(() => {
      const hrDevice: BleDevice = {
        id: 'mock-hr-001',
        name: 'Mock HR Monitor',
        type: 'heart_rate',
        rssi: -65,
        connected: false,
      }
      this.devices.push(hrDevice)
      this.emit('device_found', hrDevice)
    }, 300)

    // Simulate finding a power meter
    setTimeout(() => {
      const powerDevice: BleDevice = {
        id: 'mock-power-001',
        name: 'Mock Power Meter',
        type: 'cycling_power',
        rssi: -70,
        connected: false,
      }
      this.devices.push(powerDevice)
      this.emit('device_found', powerDevice)
    }, 600)
  }

  async stopScanning(): Promise<void> {
    this.isRunning = false
  }

  getDevices(): BleDevice[] {
    return [...this.devices]
  }

  async connect(deviceId: string): Promise<void> {
    const device = this.devices.find(d => d.id === deviceId)
    if (!device) throw new Error('Device not found')

    device.connected = true
    this.emit('connected', device)

    // Start simulating data
    if (device.type === 'heart_rate') {
      const interval = setInterval(() => {
        if (!device.connected) return
        const hrData: BleHeartRateData = {
          heartRate: 70 + Math.floor(Math.random() * 30),
          contactDetected: true,
          rrIntervals: [800 + Math.floor(Math.random() * 100)],
        }
        this.emit('data', device, { type: 'heart_rate', data: hrData })
      }, 1000)
      this.intervals.push(interval)
    }

    if (device.type === 'cycling_power') {
      const interval = setInterval(() => {
        if (!device.connected) return
        const powerData: BlePowerData = {
          instantPower: 150 + Math.floor(Math.random() * 100),
          cadence: 80 + Math.floor(Math.random() * 20),
          pedalPowerBalance: 48 + Math.random() * 4,
        }
        this.emit('data', device, { type: 'power', data: powerData })
      }, 1000)
      this.intervals.push(interval)
    }
  }

  async disconnect(deviceId: string): Promise<void> {
    const device = this.devices.find(d => d.id === deviceId)
    if (device) {
      device.connected = false
      this.emit('disconnected', device)
    }
  }

  async subscribe(_deviceId: string, _characteristic: string): Promise<void> {
    // Mock - already subscribed on connect
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

  async isAvailable(): Promise<boolean> {
    return true
  }

  async close(): Promise<void> {
    this.intervals.forEach(i => clearInterval(i))
    this.intervals = []
    this.devices.forEach(d => (d.connected = false))
    this.devices = []
    this.handlers.clear()
  }
}

/**
 * Create a BLE scanner
 */
export function createBleScanner(): BleScanner {
  return new MockBleScanner()
}
