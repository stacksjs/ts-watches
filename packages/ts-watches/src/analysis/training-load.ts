import type { Activity } from '../types'

export interface TrainingLoadMetrics {
  tss: number          // Training Stress Score
  atl: number          // Acute Training Load (fatigue)
  ctl: number          // Chronic Training Load (fitness)
  tsb: number          // Training Stress Balance (form)
  ifactor: number      // Intensity Factor
  rampRate: number     // Weekly ramp rate
}

export interface DailyTrainingLoad {
  date: Date
  tss: number
  atl: number
  ctl: number
  tsb: number
}

export interface TrainingLoadConfig {
  ftp?: number           // Functional Threshold Power (cycling)
  lthr?: number          // Lactate Threshold Heart Rate
  maxHr?: number         // Maximum Heart Rate
  restingHr?: number     // Resting Heart Rate
  atlDecay?: number      // ATL time constant (default: 7 days)
  ctlDecay?: number      // CTL time constant (default: 42 days)
}

const DEFAULT_CONFIG: Required<TrainingLoadConfig> = {
  ftp: 200,
  lthr: 165,
  maxHr: 190,
  restingHr: 50,
  atlDecay: 7,
  ctlDecay: 42,
}

export class TrainingLoadCalculator {
  private config: Required<TrainingLoadConfig>

  constructor(config: TrainingLoadConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Calculate Training Stress Score (TSS) for an activity
   */
  calculateTSS(activity: Activity): number {
    // If TSS is already calculated (from device), use it
    if (activity.trainingStressScore) {
      return activity.trainingStressScore
    }

    // Power-based TSS (most accurate for cycling)
    if (activity.avgPower && activity.normalizedPower) {
      return this.calculatePowerTSS(activity)
    }

    // Heart rate-based TSS (hrTSS)
    if (activity.avgHeartRate) {
      return this.calculateHrTSS(activity)
    }

    // Pace-based TSS for running (rTSS)
    if (activity.sport === 'running' && activity.avgSpeed) {
      return this.calculateRunningTSS(activity)
    }

    // Fallback: duration-based estimate
    return this.estimateTSSFromDuration(activity)
  }

  /**
   * Power-based TSS calculation
   */
  private calculatePowerTSS(activity: Activity): number {
    const np = activity.normalizedPower || activity.avgPower!
    const durationHours = activity.totalTimerTime / 3600
    const intensityFactor = np / this.config.ftp

    return (durationHours * np * intensityFactor / this.config.ftp) * 100
  }

  /**
   * Heart rate-based TSS (hrTSS)
   * Based on the TRIMP exponential model
   */
  private calculateHrTSS(activity: Activity): number {
    const avgHr = activity.avgHeartRate!
    const durationMinutes = activity.totalTimerTime / 60

    // Heart Rate Reserve (HRR)
    const hrReserve = this.config.maxHr - this.config.restingHr
    const avgHrReserve = (avgHr - this.config.restingHr) / hrReserve

    // TRIMP calculation
    const k = activity.sport === 'running' ? 1.92 : 1.67 // Gender-neutral average
    const trimp = durationMinutes * avgHrReserve * 0.64 * Math.exp(k * avgHrReserve)

    // Normalize to TSS scale (assuming 1 hour at LTHR = 100 TSS)
    const lthrReserve = (this.config.lthr - this.config.restingHr) / hrReserve
    const trimpAtLthr = 60 * lthrReserve * 0.64 * Math.exp(k * lthrReserve)

    return (trimp / trimpAtLthr) * 100
  }

  /**
   * Running TSS based on pace
   */
  private calculateRunningTSS(activity: Activity): number {
    const durationHours = activity.totalTimerTime / 3600

    // Estimate NGP (Normalized Graded Pace) - simplified without elevation data
    const avgPace = 1000 / activity.avgSpeed! / 60 // min/km

    // Estimate threshold pace from LTHR (rough approximation)
    const thresholdPace = 5.0 // min/km - should be configured per athlete

    const intensityFactor = thresholdPace / avgPace

    return durationHours * intensityFactor * intensityFactor * 100
  }

  /**
   * Fallback TSS estimation from duration and sport type
   */
  private estimateTSSFromDuration(activity: Activity): number {
    const durationHours = activity.totalTimerTime / 3600

    // Assume moderate intensity (IF ~0.7)
    const estimatedIF = 0.7

    return durationHours * estimatedIF * estimatedIF * 100
  }

  /**
   * Calculate Intensity Factor
   */
  calculateIntensityFactor(activity: Activity): number {
    if (activity.intensityFactor) {
      return activity.intensityFactor
    }

    if (activity.normalizedPower) {
      return activity.normalizedPower / this.config.ftp
    }

    if (activity.avgPower) {
      return activity.avgPower / this.config.ftp
    }

    if (activity.avgHeartRate) {
      return activity.avgHeartRate / this.config.lthr
    }

    return 0.7 // Default moderate intensity
  }

  /**
   * Calculate ATL, CTL, TSB over time
   */
  calculateTrainingLoad(
    activities: Activity[],
    startDate?: Date,
    endDate?: Date
  ): DailyTrainingLoad[] {
    // Sort activities by date
    const sorted = [...activities].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    )

    if (sorted.length === 0) return []

    // Determine date range
    const start = startDate || sorted[0].startTime
    const end = endDate || new Date()

    // Group activities by date and sum TSS
    const dailyTSS = new Map<string, number>()
    for (const activity of sorted) {
      const dateKey = activity.startTime.toISOString().slice(0, 10)
      const tss = this.calculateTSS(activity)
      dailyTSS.set(dateKey, (dailyTSS.get(dateKey) || 0) + tss)
    }

    // Calculate exponential moving averages
    const results: DailyTrainingLoad[] = []
    let atl = 0
    let ctl = 0

    const atlLambda = 1 - Math.exp(-1 / this.config.atlDecay)
    const ctlLambda = 1 - Math.exp(-1 / this.config.ctlDecay)

    const currentDate = new Date(start)
    while (currentDate <= end) {
      const dateKey = currentDate.toISOString().slice(0, 10)
      const tss = dailyTSS.get(dateKey) || 0

      // Exponential weighted moving average
      atl = atl + atlLambda * (tss - atl)
      ctl = ctl + ctlLambda * (tss - ctl)
      const tsb = ctl - atl

      results.push({
        date: new Date(currentDate),
        tss,
        atl: Math.round(atl * 10) / 10,
        ctl: Math.round(ctl * 10) / 10,
        tsb: Math.round(tsb * 10) / 10,
      })

      currentDate.setDate(currentDate.getDate() + 1)
    }

    return results
  }

  /**
   * Get current training metrics
   */
  getCurrentMetrics(activities: Activity[]): TrainingLoadMetrics {
    const loads = this.calculateTrainingLoad(activities)

    if (loads.length === 0) {
      return { tss: 0, atl: 0, ctl: 0, tsb: 0, ifactor: 0, rampRate: 0 }
    }

    const current = loads[loads.length - 1]
    const weekAgo = loads.length > 7 ? loads[loads.length - 8] : loads[0]

    // Calculate weekly TSS
    const weeklyTSS = loads.slice(-7).reduce((sum, d) => sum + d.tss, 0)
    const prevWeeklyTSS = loads.slice(-14, -7).reduce((sum, d) => sum + d.tss, 0)

    // Ramp rate (change in CTL per week)
    const rampRate = current.ctl - weekAgo.ctl

    // Calculate average IF from recent activities
    const recentActivities = activities
      .filter(a => a.startTime >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

    const avgIF = recentActivities.length > 0
      ? recentActivities.reduce((sum, a) => sum + this.calculateIntensityFactor(a), 0) / recentActivities.length
      : 0

    return {
      tss: weeklyTSS,
      atl: current.atl,
      ctl: current.ctl,
      tsb: current.tsb,
      ifactor: Math.round(avgIF * 100) / 100,
      rampRate: Math.round(rampRate * 10) / 10,
    }
  }

  /**
   * Get training recommendations based on current metrics
   */
  getTrainingRecommendation(metrics: TrainingLoadMetrics): {
    status: 'fresh' | 'optimal' | 'tired' | 'overtrained'
    recommendation: string
    suggestedTSS: { min: number; max: number }
  } {
    const { tsb, rampRate, ctl } = metrics

    let status: 'fresh' | 'optimal' | 'tired' | 'overtrained'
    let recommendation: string
    let suggestedTSS: { min: number; max: number }

    if (tsb > 25) {
      status = 'fresh'
      recommendation = 'You are well rested. Good time for a race or hard workout.'
      suggestedTSS = { min: Math.round(ctl * 1.2), max: Math.round(ctl * 1.5) }
    } else if (tsb >= -10 && tsb <= 25) {
      status = 'optimal'
      recommendation = 'You are in the optimal training zone. Maintain consistency.'
      suggestedTSS = { min: Math.round(ctl * 0.8), max: Math.round(ctl * 1.2) }
    } else if (tsb >= -30) {
      status = 'tired'
      recommendation = 'You are accumulating fatigue. Consider easier sessions or rest.'
      suggestedTSS = { min: Math.round(ctl * 0.4), max: Math.round(ctl * 0.7) }
    } else {
      status = 'overtrained'
      recommendation = 'High fatigue detected. Take a rest day or very easy session.'
      suggestedTSS = { min: 0, max: Math.round(ctl * 0.3) }
    }

    // Adjust for ramp rate
    if (rampRate > 7) {
      recommendation += ' Warning: Training load is increasing rapidly.'
    }

    return { status, recommendation, suggestedTSS }
  }
}

export function createTrainingLoadCalculator(config?: TrainingLoadConfig): TrainingLoadCalculator {
  return new TrainingLoadCalculator(config)
}
