import type { GeoPosition, ActivityRecord } from '../types'

export interface LiveTrackingSession {
  id: string
  name?: string
  startTime: Date
  lastUpdate: Date
  currentPosition?: GeoPosition
  totalDistance: number // meters
  elapsedTime: number // seconds
  currentSpeed?: number // m/s
  currentHeartRate?: number
  currentCadence?: number
  currentPower?: number
  status: 'active' | 'paused' | 'stopped'
  trackPoints: GeoPosition[]
}

export interface LiveTrackingConfig {
  updateInterval?: number // ms
  shareUrl?: string
  enableHeartRate?: boolean
  enablePower?: boolean
  onUpdate?: (session: LiveTrackingSession) => void
  onError?: (error: Error) => void
}

export type LiveTrackingEventHandler = {
  'position': (position: GeoPosition) => void
  'update': (session: LiveTrackingSession) => void
  'start': (session: LiveTrackingSession) => void
  'stop': (session: LiveTrackingSession) => void
  'pause': (session: LiveTrackingSession) => void
  'resume': (session: LiveTrackingSession) => void
  'error': (error: Error) => void
}

/**
 * Live tracking manager for real-time activity sharing
 */
export class LiveTrackingManager {
  private session: LiveTrackingSession | null = null
  private config: Required<LiveTrackingConfig>
  private handlers: Map<string, Set<(...args: any[]) => void>> = new Map()
  private updateInterval: NodeJS.Timeout | null = null
  private lastPosition: GeoPosition | null = null

  constructor(config: LiveTrackingConfig = {}) {
    this.config = {
      updateInterval: config.updateInterval || 5000,
      shareUrl: config.shareUrl || '',
      enableHeartRate: config.enableHeartRate ?? true,
      enablePower: config.enablePower ?? true,
      onUpdate: config.onUpdate || (() => {}),
      onError: config.onError || (() => {}),
    }
  }

  /**
   * Start a new live tracking session
   */
  start(name?: string): LiveTrackingSession {
    if (this.session && this.session.status === 'active') {
      throw new Error('Session already active')
    }

    this.session = {
      id: this.generateSessionId(),
      name,
      startTime: new Date(),
      lastUpdate: new Date(),
      totalDistance: 0,
      elapsedTime: 0,
      status: 'active',
      trackPoints: [],
    }

    // Start update interval
    this.updateInterval = setInterval(() => {
      this.tick()
    }, this.config.updateInterval)

    this.emit('start', this.session)
    return this.session
  }

  /**
   * Stop the current session
   */
  stop(): LiveTrackingSession | null {
    if (!this.session) return null

    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }

    this.session.status = 'stopped'
    this.session.lastUpdate = new Date()

    this.emit('stop', this.session)
    const finalSession = { ...this.session }
    this.session = null
    return finalSession
  }

  /**
   * Pause the current session
   */
  pause(): void {
    if (!this.session || this.session.status !== 'active') return

    this.session.status = 'paused'
    this.session.lastUpdate = new Date()
    this.emit('pause', this.session)
  }

  /**
   * Resume a paused session
   */
  resume(): void {
    if (!this.session || this.session.status !== 'paused') return

    this.session.status = 'active'
    this.session.lastUpdate = new Date()
    this.emit('resume', this.session)
  }

  /**
   * Update position
   */
  updatePosition(position: GeoPosition): void {
    if (!this.session || this.session.status !== 'active') return

    // Calculate distance from last position
    if (this.lastPosition) {
      const distance = this.haversineDistance(this.lastPosition, position)
      this.session.totalDistance += distance

      // Calculate speed
      const timeDiff = (Date.now() - this.session.lastUpdate.getTime()) / 1000
      if (timeDiff > 0) {
        this.session.currentSpeed = distance / timeDiff
      }
    }

    this.session.currentPosition = position
    this.session.trackPoints.push(position)
    this.session.lastUpdate = new Date()
    this.lastPosition = position

    this.emit('position', position)
  }

  /**
   * Update heart rate
   */
  updateHeartRate(heartRate: number): void {
    if (!this.session || !this.config.enableHeartRate) return
    this.session.currentHeartRate = heartRate
  }

  /**
   * Update power
   */
  updatePower(power: number): void {
    if (!this.session || !this.config.enablePower) return
    this.session.currentPower = power
  }

  /**
   * Update cadence
   */
  updateCadence(cadence: number): void {
    if (!this.session) return
    this.session.currentCadence = cadence
  }

  /**
   * Get current session
   */
  getSession(): LiveTrackingSession | null {
    return this.session ? { ...this.session } : null
  }

  /**
   * Get share URL for the session
   */
  getShareUrl(): string | null {
    if (!this.session || !this.config.shareUrl) return null
    return `${this.config.shareUrl}/${this.session.id}`
  }

  /**
   * Event handlers
   */
  on<K extends keyof LiveTrackingEventHandler>(
    event: K,
    handler: LiveTrackingEventHandler[K]
  ): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
  }

  off<K extends keyof LiveTrackingEventHandler>(
    event: K,
    handler: LiveTrackingEventHandler[K]
  ): void {
    this.handlers.get(event)?.delete(handler)
  }

  private emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(...args)
      }
      catch (err) {
        this.config.onError(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  private tick(): void {
    if (!this.session || this.session.status !== 'active') return

    // Update elapsed time
    this.session.elapsedTime = Math.floor(
      (Date.now() - this.session.startTime.getTime()) / 1000
    )

    this.emit('update', this.session)
    this.config.onUpdate(this.session)
  }

  private generateSessionId(): string {
    return `live_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private haversineDistance(p1: GeoPosition, p2: GeoPosition): number {
    const R = 6371000
    const lat1 = p1.lat * Math.PI / 180
    const lat2 = p2.lat * Math.PI / 180
    const dLat = (p2.lat - p1.lat) * Math.PI / 180
    const dLng = (p2.lng - p1.lng) * Math.PI / 180

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }
}

/**
 * Create a live tracking manager
 */
export function createLiveTracking(config?: LiveTrackingConfig): LiveTrackingManager {
  return new LiveTrackingManager(config)
}

/**
 * Convert live tracking session to activity records
 */
export function sessionToRecords(session: LiveTrackingSession): ActivityRecord[] {
  const startTime = session.startTime.getTime()
  const intervalMs = session.trackPoints.length > 1
    ? (session.lastUpdate.getTime() - startTime) / (session.trackPoints.length - 1)
    : 1000

  return session.trackPoints.map((position, index) => ({
    timestamp: new Date(startTime + index * intervalMs),
    position,
    altitude: position.altitude,
    heartRate: session.currentHeartRate,
    cadence: session.currentCadence,
    power: session.currentPower,
  }))
}

/**
 * Format live tracking stats for display
 */
export function formatLiveStats(session: LiveTrackingSession): {
  distance: string
  duration: string
  pace: string
  speed: string
  heartRate: string
  power: string
} {
  const h = Math.floor(session.elapsedTime / 3600)
  const m = Math.floor((session.elapsedTime % 3600) / 60)
  const s = session.elapsedTime % 60

  const duration = h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`

  const distanceKm = session.totalDistance / 1000
  const distance = distanceKm >= 10
    ? `${distanceKm.toFixed(1)} km`
    : `${distanceKm.toFixed(2)} km`

  let pace = '--:--'
  let speed = '-- km/h'

  if (session.currentSpeed && session.currentSpeed > 0) {
    const paceSecPerKm = 1000 / session.currentSpeed
    const paceMin = Math.floor(paceSecPerKm / 60)
    const paceSec = Math.round(paceSecPerKm % 60)
    pace = `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`

    speed = `${(session.currentSpeed * 3.6).toFixed(1)} km/h`
  }

  return {
    distance,
    duration,
    pace,
    speed,
    heartRate: session.currentHeartRate ? `${session.currentHeartRate} bpm` : '-- bpm',
    power: session.currentPower ? `${session.currentPower} W` : '-- W',
  }
}
