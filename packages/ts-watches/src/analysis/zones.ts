import type { Activity, ActivityRecord } from '../types'

export interface Zone {
  name: string
  min: number
  max: number
  color?: string
}

export interface ZoneConfig {
  heartRate?: {
    maxHr: number
    restingHr?: number
    method: 'percentage' | 'reserve' | 'lthr'
    lthr?: number
    zones?: Zone[]
  }
  power?: {
    ftp: number
    zones?: Zone[]
  }
  pace?: {
    thresholdPace: number // sec/km
    zones?: Zone[]
  }
}

export interface ZoneDistribution {
  zone: Zone
  seconds: number
  percentage: number
}

export interface ZoneAnalysis {
  heartRate?: ZoneDistribution[]
  power?: ZoneDistribution[]
  pace?: ZoneDistribution[]
  summary: {
    timeInZ1: number
    timeInZ2: number
    timeInZ3: number
    timeInZ4: number
    timeInZ5: number
    polarizedIndex?: number
    intensityDistribution: 'polarized' | 'pyramidal' | 'threshold' | 'unknown'
  }
}

// Default heart rate zones (percentage of max HR)
const DEFAULT_HR_ZONES: Zone[] = [
  { name: 'Z1 - Recovery', min: 50, max: 60, color: '#9CA3AF' },
  { name: 'Z2 - Aerobic', min: 60, max: 70, color: '#3B82F6' },
  { name: 'Z3 - Tempo', min: 70, max: 80, color: '#22C55E' },
  { name: 'Z4 - Threshold', min: 80, max: 90, color: '#F59E0B' },
  { name: 'Z5 - VO2max', min: 90, max: 100, color: '#EF4444' },
]

// Default power zones (percentage of FTP)
const DEFAULT_POWER_ZONES: Zone[] = [
  { name: 'Z1 - Active Recovery', min: 0, max: 55, color: '#9CA3AF' },
  { name: 'Z2 - Endurance', min: 55, max: 75, color: '#3B82F6' },
  { name: 'Z3 - Tempo', min: 75, max: 90, color: '#22C55E' },
  { name: 'Z4 - Threshold', min: 90, max: 105, color: '#F59E0B' },
  { name: 'Z5 - VO2max', min: 105, max: 120, color: '#EF4444' },
  { name: 'Z6 - Anaerobic', min: 120, max: 150, color: '#7C3AED' },
  { name: 'Z7 - Neuromuscular', min: 150, max: 300, color: '#EC4899' },
]

// Default pace zones (percentage of threshold pace)
const DEFAULT_PACE_ZONES: Zone[] = [
  { name: 'Z1 - Recovery', min: 130, max: 150, color: '#9CA3AF' },
  { name: 'Z2 - Easy', min: 115, max: 130, color: '#3B82F6' },
  { name: 'Z3 - Aerobic', min: 105, max: 115, color: '#22C55E' },
  { name: 'Z4 - Threshold', min: 95, max: 105, color: '#F59E0B' },
  { name: 'Z5 - Interval', min: 85, max: 95, color: '#EF4444' },
  { name: 'Z6 - Repetition', min: 0, max: 85, color: '#7C3AED' },
]

export class ZoneCalculator {
  private config: ZoneConfig

  constructor(config: ZoneConfig) {
    this.config = config
  }

  /**
   * Calculate heart rate zones based on config
   */
  getHeartRateZones(): Zone[] {
    if (!this.config.heartRate) return []

    const { maxHr, restingHr = 0, method, lthr, zones } = this.config.heartRate

    if (zones) return zones

    const baseZones = DEFAULT_HR_ZONES

    return baseZones.map(zone => {
      let min: number, max: number

      if (method === 'reserve' && restingHr) {
        // Karvonen formula
        const reserve = maxHr - restingHr
        min = Math.round(restingHr + (zone.min / 100) * reserve)
        max = Math.round(restingHr + (zone.max / 100) * reserve)
      } else if (method === 'lthr' && lthr) {
        // LTHR-based zones
        min = Math.round(lthr * (zone.min / 85))
        max = Math.round(lthr * (zone.max / 85))
      } else {
        // Simple percentage of max
        min = Math.round(maxHr * zone.min / 100)
        max = Math.round(maxHr * zone.max / 100)
      }

      return { ...zone, min, max }
    })
  }

  /**
   * Calculate power zones based on FTP
   */
  getPowerZones(): Zone[] {
    if (!this.config.power) return []

    const { ftp, zones } = this.config.power

    if (zones) return zones

    return DEFAULT_POWER_ZONES.map(zone => ({
      ...zone,
      min: Math.round(ftp * zone.min / 100),
      max: Math.round(ftp * zone.max / 100),
    }))
  }

  /**
   * Calculate pace zones based on threshold pace
   */
  getPaceZones(): Zone[] {
    if (!this.config.pace) return []

    const { thresholdPace, zones } = this.config.pace

    if (zones) return zones

    return DEFAULT_PACE_ZONES.map(zone => ({
      ...zone,
      min: Math.round(thresholdPace * zone.min / 100),
      max: Math.round(thresholdPace * zone.max / 100),
    }))
  }

  /**
   * Analyze time in zones for an activity
   */
  analyzeActivity(activity: Activity): ZoneAnalysis {
    const hrZones = this.getHeartRateZones()
    const powerZones = this.getPowerZones()
    const paceZones = this.getPaceZones()

    const hrDistribution = hrZones.length > 0
      ? this.calculateTimeInZones(activity.records, 'heartRate', hrZones)
      : undefined

    const powerDistribution = powerZones.length > 0
      ? this.calculateTimeInZones(activity.records, 'power', powerZones)
      : undefined

    const paceDistribution = paceZones.length > 0
      ? this.calculateTimeInPaceZones(activity.records, paceZones)
      : undefined

    // Use HR distribution for summary if available, otherwise power
    const primaryDistribution = hrDistribution || powerDistribution

    const summary = this.calculateSummary(primaryDistribution)

    return {
      heartRate: hrDistribution,
      power: powerDistribution,
      pace: paceDistribution,
      summary,
    }
  }

  private calculateTimeInZones(
    records: ActivityRecord[],
    field: 'heartRate' | 'power',
    zones: Zone[]
  ): ZoneDistribution[] {
    const zoneTimes = new Array(zones.length).fill(0)
    let totalTime = 0

    for (let i = 1; i < records.length; i++) {
      const value = records[i][field]
      if (value == null) continue

      const duration = (records[i].timestamp.getTime() - records[i - 1].timestamp.getTime()) / 1000
      totalTime += duration

      for (let z = 0; z < zones.length; z++) {
        if (value >= zones[z].min && value < zones[z].max) {
          zoneTimes[z] += duration
          break
        }
        // Handle values above the highest zone
        if (z === zones.length - 1 && value >= zones[z].max) {
          zoneTimes[z] += duration
        }
      }
    }

    return zones.map((zone, i) => ({
      zone,
      seconds: Math.round(zoneTimes[i]),
      percentage: totalTime > 0 ? Math.round((zoneTimes[i] / totalTime) * 100) : 0,
    }))
  }

  private calculateTimeInPaceZones(
    records: ActivityRecord[],
    zones: Zone[]
  ): ZoneDistribution[] {
    const zoneTimes = new Array(zones.length).fill(0)
    let totalTime = 0

    for (let i = 1; i < records.length; i++) {
      const speed = records[i].speed
      if (speed == null || speed === 0) continue

      const pace = 1000 / speed // seconds per km
      const duration = (records[i].timestamp.getTime() - records[i - 1].timestamp.getTime()) / 1000
      totalTime += duration

      for (let z = 0; z < zones.length; z++) {
        // Note: For pace, lower is faster (Z6 has lowest min)
        if (pace <= zones[z].max && pace > zones[z].min) {
          zoneTimes[z] += duration
          break
        }
      }
    }

    return zones.map((zone, i) => ({
      zone,
      seconds: Math.round(zoneTimes[i]),
      percentage: totalTime > 0 ? Math.round((zoneTimes[i] / totalTime) * 100) : 0,
    }))
  }

  private calculateSummary(distribution?: ZoneDistribution[]): ZoneAnalysis['summary'] {
    if (!distribution || distribution.length < 5) {
      return {
        timeInZ1: 0,
        timeInZ2: 0,
        timeInZ3: 0,
        timeInZ4: 0,
        timeInZ5: 0,
        intensityDistribution: 'unknown',
      }
    }

    const z1 = distribution[0]?.percentage || 0
    const z2 = distribution[1]?.percentage || 0
    const z3 = distribution[2]?.percentage || 0
    const z4 = distribution[3]?.percentage || 0
    const z5 = distribution[4]?.percentage || 0

    // Polarized index: ratio of Z1+Z2 to Z4+Z5
    const lowIntensity = z1 + z2
    const highIntensity = z4 + z5
    const polarizedIndex = highIntensity > 0 ? lowIntensity / highIntensity : 0

    // Determine distribution type
    let intensityDistribution: 'polarized' | 'pyramidal' | 'threshold' | 'unknown'

    if (lowIntensity > 70 && highIntensity > 15 && z3 < 15) {
      intensityDistribution = 'polarized'
    } else if (z1 >= z2 && z2 >= z3 && z3 >= z4 && z4 >= z5) {
      intensityDistribution = 'pyramidal'
    } else if (z3 + z4 > 50) {
      intensityDistribution = 'threshold'
    } else {
      intensityDistribution = 'unknown'
    }

    return {
      timeInZ1: distribution[0]?.seconds || 0,
      timeInZ2: distribution[1]?.seconds || 0,
      timeInZ3: distribution[2]?.seconds || 0,
      timeInZ4: distribution[3]?.seconds || 0,
      timeInZ5: distribution[4]?.seconds || 0,
      polarizedIndex: Math.round(polarizedIndex * 100) / 100,
      intensityDistribution,
    }
  }

  /**
   * Get zone for a specific value
   */
  getZoneForValue(value: number, type: 'heartRate' | 'power' | 'pace'): Zone | null {
    const zones = type === 'heartRate'
      ? this.getHeartRateZones()
      : type === 'power'
        ? this.getPowerZones()
        : this.getPaceZones()

    for (const zone of zones) {
      if (value >= zone.min && value < zone.max) {
        return zone
      }
    }

    return zones[zones.length - 1] || null
  }

  /**
   * Format time for display
   */
  formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.round(seconds % 60)

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }
}

export function createZoneCalculator(config: ZoneConfig): ZoneCalculator {
  return new ZoneCalculator(config)
}

/**
 * Estimate max heart rate by age
 */
export function estimateMaxHrByAge(age: number): number {
  // Tanaka formula (more accurate than 220-age)
  return Math.round(208 - 0.7 * age)
}

/**
 * Estimate LTHR from max HR
 */
export function estimateLthrFromMaxHr(maxHr: number): number {
  return Math.round(maxHr * 0.85)
}

/**
 * Calculate heart rate reserve
 */
export function calculateHrReserve(maxHr: number, restingHr: number): number {
  return maxHr - restingHr
}

/**
 * Calculate target HR using Karvonen formula
 */
export function calculateTargetHr(maxHr: number, restingHr: number, intensity: number): number {
  const reserve = calculateHrReserve(maxHr, restingHr)
  return Math.round(restingHr + reserve * intensity)
}
