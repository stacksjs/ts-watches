import type { Activity } from '../types'

export interface RacePrediction {
  distance: number
  distanceName: string
  predictedTime: number // seconds
  predictedPace: number // seconds per km
  confidence: 'high' | 'medium' | 'low'
}

export interface PredictorInput {
  recentActivities: Activity[]
  personalRecords?: Map<number, number> // distance -> time
  vo2max?: number
  age?: number
  gender?: 'male' | 'female'
}

export interface FitnessEstimate {
  vo2max: number
  vdot: number
  equivalentMarathon: number // seconds
  fitnessAge: number
}

// Standard race distances in meters
export const RACE_DISTANCES = {
  '1K': 1000,
  '1 Mile': 1609.34,
  '5K': 5000,
  '10K': 10000,
  '15K': 15000,
  'Half Marathon': 21097.5,
  'Marathon': 42195,
  '50K': 50000,
  '100K': 100000,
} as const

export class RacePredictor {
  /**
   * Predict race times based on a recent performance
   * Uses Riegel formula: T2 = T1 × (D2/D1)^1.06
   */
  predictFromPerformance(
    distance: number, // meters
    time: number, // seconds
    targetDistances: number[] = Object.values(RACE_DISTANCES)
  ): RacePrediction[] {
    const predictions: RacePrediction[] = []

    // Riegel exponent (varies by fitness level, using standard 1.06)
    const exponent = this.calculateRiegelExponent(distance, time)

    for (const targetDistance of targetDistances) {
      const predictedTime = time * Math.pow(targetDistance / distance, exponent)
      const predictedPace = predictedTime / (targetDistance / 1000)

      // Confidence based on how far we're extrapolating
      const ratio = targetDistance / distance
      let confidence: 'high' | 'medium' | 'low'
      if (ratio >= 0.5 && ratio <= 2) {
        confidence = 'high'
      } else if (ratio >= 0.25 && ratio <= 4) {
        confidence = 'medium'
      } else {
        confidence = 'low'
      }

      predictions.push({
        distance: targetDistance,
        distanceName: this.getDistanceName(targetDistance),
        predictedTime: Math.round(predictedTime),
        predictedPace: Math.round(predictedPace),
        confidence,
      })
    }

    return predictions.sort((a, b) => a.distance - b.distance)
  }

  /**
   * Predict race times from multiple recent performances
   * Uses weighted average based on recency and distance similarity
   */
  predictFromActivities(
    activities: Activity[],
    targetDistances: number[] = Object.values(RACE_DISTANCES)
  ): RacePrediction[] {
    // Filter to running activities with sufficient distance
    const runningActivities = activities.filter(
      a => a.sport === 'running' && a.totalDistance >= 1000
    )

    if (runningActivities.length === 0) {
      return []
    }

    // Sort by date (most recent first)
    const sorted = [...runningActivities].sort(
      (a, b) => b.startTime.getTime() - a.startTime.getTime()
    )

    // Take up to 10 most recent activities
    const recent = sorted.slice(0, 10)

    // Calculate weighted predictions
    const predictions: Map<number, { totalTime: number; totalWeight: number }> = new Map()

    for (const activity of recent) {
      // Weight based on recency (exponential decay)
      const daysAgo = (Date.now() - activity.startTime.getTime()) / (1000 * 60 * 60 * 24)
      const recencyWeight = Math.exp(-daysAgo / 30) // 30-day half-life

      // Weight based on activity quality (longer is better for prediction)
      const distanceWeight = Math.min(1, activity.totalDistance / 10000)

      const weight = recencyWeight * distanceWeight

      const activityPredictions = this.predictFromPerformance(
        activity.totalDistance,
        activity.totalTimerTime,
        targetDistances
      )

      for (const pred of activityPredictions) {
        const existing = predictions.get(pred.distance) || { totalTime: 0, totalWeight: 0 }
        existing.totalTime += pred.predictedTime * weight
        existing.totalWeight += weight
        predictions.set(pred.distance, existing)
      }
    }

    // Calculate weighted average predictions
    const result: RacePrediction[] = []

    for (const [distance, data] of predictions) {
      const avgTime = data.totalTime / data.totalWeight
      const avgPace = avgTime / (distance / 1000)

      // Confidence based on data quality
      let confidence: 'high' | 'medium' | 'low'
      if (data.totalWeight > 3) {
        confidence = 'high'
      } else if (data.totalWeight > 1) {
        confidence = 'medium'
      } else {
        confidence = 'low'
      }

      result.push({
        distance,
        distanceName: this.getDistanceName(distance),
        predictedTime: Math.round(avgTime),
        predictedPace: Math.round(avgPace),
        confidence,
      })
    }

    return result.sort((a, b) => a.distance - b.distance)
  }

  /**
   * Estimate VO2max from a running performance
   * Uses Jack Daniels' formula
   */
  estimateVO2max(distance: number, time: number): number {
    // Convert to velocity in meters per minute
    const velocity = distance / (time / 60)

    // Percent of VO2max based on duration
    const percentVO2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * (time / 60)) +
      0.2989558 * Math.exp(-0.1932605 * (time / 60))

    // VO2 at this velocity
    const vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity

    // Estimated VO2max
    return vo2 / percentVO2max
  }

  /**
   * Estimate VDOT (Jack Daniels' running score)
   */
  estimateVDOT(distance: number, time: number): number {
    // VDOT is essentially VO2max adjusted for running economy
    return this.estimateVO2max(distance, time)
  }

  /**
   * Get fitness estimate from recent activities
   */
  estimateFitness(activities: Activity[], age?: number): FitnessEstimate {
    const runningActivities = activities.filter(
      a => a.sport === 'running' && a.totalDistance >= 3000
    )

    if (runningActivities.length === 0) {
      return {
        vo2max: 0,
        vdot: 0,
        equivalentMarathon: 0,
        fitnessAge: age || 0,
      }
    }

    // Use best effort for VO2max estimation
    let bestVo2max = 0
    let bestActivity: Activity | null = null

    for (const activity of runningActivities) {
      const vo2max = this.estimateVO2max(activity.totalDistance, activity.totalTimerTime)
      if (vo2max > bestVo2max) {
        bestVo2max = vo2max
        bestActivity = activity
      }
    }

    const vdot = bestActivity
      ? this.estimateVDOT(bestActivity.totalDistance, bestActivity.totalTimerTime)
      : 0

    // Predict marathon time
    const marathonPrediction = bestActivity
      ? this.predictFromPerformance(
          bestActivity.totalDistance,
          bestActivity.totalTimerTime,
          [42195]
        )[0]
      : null

    // Estimate fitness age based on VO2max
    // Using Cooper Institute norms
    const fitnessAge = age
      ? this.estimateFitnessAge(bestVo2max, age)
      : 0

    return {
      vo2max: Math.round(bestVo2max * 10) / 10,
      vdot: Math.round(vdot * 10) / 10,
      equivalentMarathon: marathonPrediction?.predictedTime || 0,
      fitnessAge,
    }
  }

  /**
   * Calculate training paces based on VDOT
   */
  getTrainingPaces(vdot: number): {
    easy: { min: number; max: number }
    marathon: number
    threshold: number
    interval: number
    repetition: number
  } {
    // Based on Jack Daniels' training tables
    // These are pace in seconds per km

    // Easy pace: 59-74% of vdot pace
    const vdotPace = this.vdotToPace(vdot)
    const easyMin = vdotPace / 0.59
    const easyMax = vdotPace / 0.74

    return {
      easy: {
        min: Math.round(easyMin),
        max: Math.round(easyMax),
      },
      marathon: Math.round(vdotPace / 0.79),
      threshold: Math.round(vdotPace / 0.88),
      interval: Math.round(vdotPace / 0.98),
      repetition: Math.round(vdotPace / 1.05),
    }
  }

  private vdotToPace(vdot: number): number {
    // Approximate conversion from VDOT to pace (sec/km)
    // Higher VDOT = faster pace
    return 29.54 + 5.000663 * Math.exp(-0.007546 * vdot) * 60
  }

  private calculateRiegelExponent(distance: number, time: number): number {
    // Standard exponent is 1.06, but can vary:
    // - Better trained athletes: closer to 1.04
    // - Less trained: closer to 1.08
    // Use time per km as a rough fitness proxy
    const pacePerKm = time / (distance / 1000)

    if (pacePerKm < 210) return 1.04 // Elite (<3:30/km)
    if (pacePerKm < 270) return 1.05 // Advanced (<4:30/km)
    if (pacePerKm < 330) return 1.06 // Intermediate (<5:30/km)
    if (pacePerKm < 390) return 1.07 // Recreational (<6:30/km)
    return 1.08 // Beginner
  }

  private estimateFitnessAge(vo2max: number, chronologicalAge: number): number {
    // Very rough approximation based on VO2max decline with age
    // Average decline is about 1% per year after age 25
    // VO2max of 45 at age 30 is average

    const averageVo2maxAt30 = 45
    const vo2maxDifference = vo2max - averageVo2maxAt30
    const yearsYounger = vo2maxDifference / 0.45 // ~0.45 ml/kg/min per year

    const fitnessAge = 30 - yearsYounger

    // Clamp to reasonable values
    return Math.max(15, Math.min(90, Math.round(fitnessAge)))
  }

  private getDistanceName(distance: number): string {
    for (const [name, d] of Object.entries(RACE_DISTANCES)) {
      if (Math.abs(d - distance) < 10) return name
    }
    return `${(distance / 1000).toFixed(1)}K`
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

  /**
   * Format pace for display
   */
  formatPace(secondsPerKm: number): string {
    const m = Math.floor(secondsPerKm / 60)
    const s = Math.round(secondsPerKm % 60)
    return `${m}:${s.toString().padStart(2, '0')}/km`
  }
}

export function createRacePredictor(): RacePredictor {
  return new RacePredictor()
}
