import type { Activity, ActivityRecord } from '../types'

export interface RunningDynamicsMetrics {
  groundContactTime?: {
    avg: number    // ms
    min: number
    max: number
  }
  groundContactBalance?: {
    avg: number    // percentage (50 = balanced)
    left: number
    right: number
  }
  strideLength?: {
    avg: number    // meters
    min: number
    max: number
  }
  verticalOscillation?: {
    avg: number    // cm
    min: number
    max: number
  }
  verticalRatio?: {
    avg: number    // percentage
    min: number
    max: number
  }
  cadence?: {
    avg: number    // steps per minute
    min: number
    max: number
  }
  stanceTimeBalance?: number
  runningPowerEstimate?: number
}

export interface RunningFormAnalysis {
  metrics: RunningDynamicsMetrics
  formScore: number // 0-100
  insights: FormInsight[]
  recommendations: string[]
}

export interface FormInsight {
  metric: string
  status: 'good' | 'warning' | 'needs_attention'
  message: string
  value: number
  optimalRange: { min: number; max: number }
}

export interface ExtendedActivityRecord extends ActivityRecord {
  groundContactTime?: number
  groundContactBalance?: number
  strideLength?: number
  verticalOscillation?: number
  verticalRatio?: number
  stanceTimePercent?: number
  stanceTime?: number
}

// Optimal ranges for running form metrics (elite to recreational runners)
const OPTIMAL_RANGES = {
  groundContactTime: { elite: { min: 180, max: 220 }, recreational: { min: 220, max: 280 } },
  groundContactBalance: { min: 48, max: 52 }, // percentage
  strideLength: { elite: { min: 1.4, max: 1.8 }, recreational: { min: 1.0, max: 1.4 } },
  verticalOscillation: { elite: { min: 6, max: 9 }, recreational: { min: 8, max: 12 } },
  verticalRatio: { elite: { min: 6, max: 8 }, recreational: { min: 8, max: 12 } },
  cadence: { elite: { min: 180, max: 200 }, recreational: { min: 160, max: 180 } },
}

export class RunningDynamicsAnalyzer {
  /**
   * Calculate running dynamics metrics from activity records
   */
  calculateMetrics(records: ExtendedActivityRecord[]): RunningDynamicsMetrics {
    const metrics: RunningDynamicsMetrics = {}

    // Ground contact time
    const gctValues = records.filter(r => r.groundContactTime != null).map(r => r.groundContactTime!)
    if (gctValues.length > 0) {
      metrics.groundContactTime = {
        avg: Math.round(this.average(gctValues)),
        min: Math.min(...gctValues),
        max: Math.max(...gctValues),
      }
    }

    // Ground contact balance
    const gcbValues = records.filter(r => r.groundContactBalance != null).map(r => r.groundContactBalance!)
    if (gcbValues.length > 0) {
      const avg = this.average(gcbValues)
      metrics.groundContactBalance = {
        avg: Math.round(avg * 10) / 10,
        left: Math.round(avg * 10) / 10,
        right: Math.round((100 - avg) * 10) / 10,
      }
    }

    // Stride length
    const slValues = records.filter(r => r.strideLength != null).map(r => r.strideLength!)
    if (slValues.length > 0) {
      metrics.strideLength = {
        avg: Math.round(this.average(slValues) * 100) / 100,
        min: Math.round(Math.min(...slValues) * 100) / 100,
        max: Math.round(Math.max(...slValues) * 100) / 100,
      }
    }

    // Vertical oscillation
    const voValues = records.filter(r => r.verticalOscillation != null).map(r => r.verticalOscillation!)
    if (voValues.length > 0) {
      metrics.verticalOscillation = {
        avg: Math.round(this.average(voValues) * 10) / 10,
        min: Math.round(Math.min(...voValues) * 10) / 10,
        max: Math.round(Math.max(...voValues) * 10) / 10,
      }
    }

    // Vertical ratio
    const vrValues = records.filter(r => r.verticalRatio != null).map(r => r.verticalRatio!)
    if (vrValues.length > 0) {
      metrics.verticalRatio = {
        avg: Math.round(this.average(vrValues) * 10) / 10,
        min: Math.round(Math.min(...vrValues) * 10) / 10,
        max: Math.round(Math.max(...vrValues) * 10) / 10,
      }
    }

    // Cadence
    const cadenceValues = records.filter(r => r.cadence != null).map(r => r.cadence!)
    if (cadenceValues.length > 0) {
      metrics.cadence = {
        avg: Math.round(this.average(cadenceValues)),
        min: Math.min(...cadenceValues),
        max: Math.max(...cadenceValues),
      }
    }

    // Estimate running power if we have enough data
    if (metrics.cadence && metrics.strideLength && metrics.verticalOscillation) {
      metrics.runningPowerEstimate = this.estimateRunningPower(
        metrics.cadence.avg,
        metrics.strideLength.avg,
        metrics.verticalOscillation.avg,
        70 // default weight in kg
      )
    }

    return metrics
  }

  /**
   * Analyze running form and provide insights
   */
  analyzeForm(activity: Activity, athleteLevel: 'elite' | 'recreational' = 'recreational'): RunningFormAnalysis {
    const records = activity.records as ExtendedActivityRecord[]
    const metrics = this.calculateMetrics(records)

    const insights: FormInsight[] = []
    const recommendations: string[] = []
    let totalScore = 0
    let scoreCount = 0

    // Analyze ground contact time
    if (metrics.groundContactTime) {
      const range = OPTIMAL_RANGES.groundContactTime[athleteLevel]
      const score = this.scoreMetric(metrics.groundContactTime.avg, range.min, range.max)
      totalScore += score
      scoreCount++

      const insight = this.createInsight(
        'Ground Contact Time',
        metrics.groundContactTime.avg,
        range,
        'ms',
        score
      )
      insights.push(insight)

      if (insight.status !== 'good') {
        if (metrics.groundContactTime.avg > range.max) {
          recommendations.push('Work on increasing cadence and strengthening glutes to reduce ground contact time')
        } else {
          recommendations.push('Your ground contact time is excellent - maintain current form')
        }
      }
    }

    // Analyze vertical oscillation
    if (metrics.verticalOscillation) {
      const range = OPTIMAL_RANGES.verticalOscillation[athleteLevel]
      const score = this.scoreMetric(metrics.verticalOscillation.avg, range.min, range.max)
      totalScore += score
      scoreCount++

      const insight = this.createInsight(
        'Vertical Oscillation',
        metrics.verticalOscillation.avg,
        range,
        'cm',
        score
      )
      insights.push(insight)

      if (metrics.verticalOscillation.avg > range.max) {
        recommendations.push('Focus on running "light" - imagine a ceiling just above your head')
        recommendations.push('Strengthen hip flexors and glutes for better horizontal propulsion')
      }
    }

    // Analyze cadence
    if (metrics.cadence) {
      const range = OPTIMAL_RANGES.cadence[athleteLevel]
      const score = this.scoreMetric(metrics.cadence.avg, range.min, range.max, true)
      totalScore += score
      scoreCount++

      const insight = this.createInsight(
        'Cadence',
        metrics.cadence.avg,
        range,
        'spm',
        score
      )
      insights.push(insight)

      if (metrics.cadence.avg < range.min) {
        recommendations.push('Try to increase cadence by 5% - use a metronome app during training')
        recommendations.push('Higher cadence typically reduces injury risk and improves efficiency')
      }
    }

    // Analyze ground contact balance
    if (metrics.groundContactBalance) {
      const range = OPTIMAL_RANGES.groundContactBalance
      const imbalance = Math.abs(50 - metrics.groundContactBalance.avg)
      const score = Math.max(0, 100 - imbalance * 10)
      totalScore += score
      scoreCount++

      const status = imbalance < 2 ? 'good' : imbalance < 4 ? 'warning' : 'needs_attention'
      insights.push({
        metric: 'Ground Contact Balance',
        status,
        message: status === 'good'
          ? 'Your left/right balance is excellent'
          : `${imbalance.toFixed(1)}% imbalance detected - consider strength work`,
        value: metrics.groundContactBalance.avg,
        optimalRange: range,
      })

      if (imbalance >= 4) {
        recommendations.push('Significant left/right imbalance detected - consider a gait analysis')
        recommendations.push('Single-leg exercises may help correct the imbalance')
      }
    }

    // Analyze vertical ratio
    if (metrics.verticalRatio) {
      const range = OPTIMAL_RANGES.verticalRatio[athleteLevel]
      const score = this.scoreMetric(metrics.verticalRatio.avg, range.min, range.max)
      totalScore += score
      scoreCount++

      const insight = this.createInsight(
        'Vertical Ratio',
        metrics.verticalRatio.avg,
        range,
        '%',
        score
      )
      insights.push(insight)

      if (metrics.verticalRatio.avg > range.max) {
        recommendations.push('Vertical ratio is high - focus on forward lean from ankles')
      }
    }

    // Analyze stride length
    if (metrics.strideLength) {
      const range = OPTIMAL_RANGES.strideLength[athleteLevel]
      const score = this.scoreMetric(metrics.strideLength.avg, range.min, range.max, true)
      totalScore += score
      scoreCount++

      const insight = this.createInsight(
        'Stride Length',
        metrics.strideLength.avg,
        range,
        'm',
        score
      )
      insights.push(insight)
    }

    const formScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0

    return {
      metrics,
      formScore,
      insights,
      recommendations: [...new Set(recommendations)], // Remove duplicates
    }
  }

  /**
   * Estimate running power using available metrics
   * This is a simplified model - real running power meters use accelerometers
   */
  private estimateRunningPower(
    cadence: number,
    strideLength: number,
    verticalOscillation: number,
    weightKg: number
  ): number {
    // Speed in m/s
    const speed = (cadence * strideLength) / 60

    // Horizontal power component
    const horizontalPower = 0.5 * weightKg * Math.pow(speed, 2) * 0.01 // Simplified

    // Vertical power component
    const verticalVelocity = verticalOscillation / 100 * cadence / 60 // Approximate
    const verticalPower = weightKg * 9.81 * verticalVelocity

    return Math.round(horizontalPower + verticalPower)
  }

  private scoreMetric(
    value: number,
    min: number,
    max: number,
    higherIsBetter = false
  ): number {
    if (value >= min && value <= max) {
      return 100
    }

    if (higherIsBetter) {
      if (value < min) {
        const diff = min - value
        return Math.max(0, 100 - diff * 5)
      }
      return 100 // Above max is fine if higher is better
    }

    if (value < min) {
      const diff = min - value
      return Math.max(0, 100 - diff * 5)
    }

    const diff = value - max
    return Math.max(0, 100 - diff * 5)
  }

  private createInsight(
    metric: string,
    value: number,
    range: { min: number; max: number },
    unit: string,
    score: number
  ): FormInsight {
    let status: 'good' | 'warning' | 'needs_attention'
    let message: string

    if (score >= 90) {
      status = 'good'
      message = `${metric} is in optimal range`
    } else if (score >= 70) {
      status = 'warning'
      message = `${metric} is slightly outside optimal range`
    } else {
      status = 'needs_attention'
      message = `${metric} needs improvement`
    }

    return {
      metric,
      status,
      message,
      value,
      optimalRange: range,
    }
  }

  private average(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  /**
   * Calculate efficiency index (speed / power estimate)
   */
  calculateEfficiency(activity: Activity): number | null {
    const records = activity.records as ExtendedActivityRecord[]
    const metrics = this.calculateMetrics(records)

    if (!metrics.runningPowerEstimate || !activity.avgSpeed) {
      return null
    }

    // Speed in m/s divided by power in watts
    return Math.round((activity.avgSpeed / metrics.runningPowerEstimate) * 1000) / 1000
  }
}

export function createRunningDynamicsAnalyzer(): RunningDynamicsAnalyzer {
  return new RunningDynamicsAnalyzer()
}
