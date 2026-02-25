import type { SportType } from '../types'

export type WorkoutStepType =
  | 'warmup'
  | 'cooldown'
  | 'interval'
  | 'recovery'
  | 'rest'
  | 'active'
  | 'repeat'

export type WorkoutTargetType =
  | 'open'
  | 'heart_rate_zone'
  | 'heart_rate'
  | 'power_zone'
  | 'power'
  | 'pace_zone'
  | 'pace'
  | 'cadence'
  | 'speed'

export type WorkoutDurationType =
  | 'time'
  | 'distance'
  | 'calories'
  | 'open'
  | 'lap_button'
  | 'heart_rate_less_than'
  | 'heart_rate_greater_than'
  | 'power_less_than'
  | 'power_greater_than'

export interface WorkoutTarget {
  type: WorkoutTargetType
  value?: number
  low?: number
  high?: number
  zone?: number
}

export interface WorkoutDuration {
  type: WorkoutDurationType
  value?: number // seconds, meters, calories, or HR/power threshold
}

export interface WorkoutStep {
  type: WorkoutStepType
  name?: string
  notes?: string
  duration: WorkoutDuration
  target: WorkoutTarget
  secondaryTarget?: WorkoutTarget
}

export interface WorkoutRepeatGroup {
  type: 'repeat'
  repeatCount: number
  steps: WorkoutStep[]
}

export interface Workout {
  id?: string
  name: string
  sport: SportType
  description?: string
  steps: (WorkoutStep | WorkoutRepeatGroup)[]
  estimatedDuration?: number // seconds
  estimatedDistance?: number // meters
  createdAt?: Date
  updatedAt?: Date
}

export class WorkoutBuilder {
  private workout: Workout
  private currentSteps: (WorkoutStep | WorkoutRepeatGroup)[] = []

  constructor(name: string, sport: SportType) {
    this.workout = {
      name,
      sport,
      steps: [],
      createdAt: new Date(),
    }
  }

  setDescription(description: string): this {
    this.workout.description = description
    return this
  }

  /**
   * Add a warmup step
   */
  warmup(duration: WorkoutDuration, target?: WorkoutTarget): this {
    this.currentSteps.push({
      type: 'warmup',
      duration,
      target: target || { type: 'open' },
    })
    return this
  }

  /**
   * Add a cooldown step
   */
  cooldown(duration: WorkoutDuration, target?: WorkoutTarget): this {
    this.currentSteps.push({
      type: 'cooldown',
      duration,
      target: target || { type: 'open' },
    })
    return this
  }

  /**
   * Add an interval step
   */
  interval(duration: WorkoutDuration, target: WorkoutTarget, name?: string): this {
    this.currentSteps.push({
      type: 'interval',
      name,
      duration,
      target,
    })
    return this
  }

  /**
   * Add a recovery step
   */
  recovery(duration: WorkoutDuration, target?: WorkoutTarget): this {
    this.currentSteps.push({
      type: 'recovery',
      duration,
      target: target || { type: 'open' },
    })
    return this
  }

  /**
   * Add a rest step
   */
  rest(duration: WorkoutDuration): this {
    this.currentSteps.push({
      type: 'rest',
      duration,
      target: { type: 'open' },
    })
    return this
  }

  /**
   * Add an active step
   */
  active(duration: WorkoutDuration, target: WorkoutTarget, name?: string): this {
    this.currentSteps.push({
      type: 'active',
      name,
      duration,
      target,
    })
    return this
  }

  /**
   * Add a repeat group
   */
  repeat(count: number, builderFn: (builder: WorkoutBuilder) => void): this {
    const innerBuilder = new WorkoutBuilder(this.workout.name, this.workout.sport)
    builderFn(innerBuilder)

    this.currentSteps.push({
      type: 'repeat',
      repeatCount: count,
      steps: innerBuilder.currentSteps as WorkoutStep[],
    })
    return this
  }

  /**
   * Build the workout
   */
  build(): Workout {
    this.workout.steps = this.currentSteps
    this.workout.estimatedDuration = this.calculateEstimatedDuration()
    this.workout.estimatedDistance = this.calculateEstimatedDistance()
    this.workout.updatedAt = new Date()
    return this.workout
  }

  private calculateEstimatedDuration(): number {
    let total = 0

    const processSteps = (steps: (WorkoutStep | WorkoutRepeatGroup)[], multiplier = 1) => {
      for (const step of steps) {
        if (step.type === 'repeat') {
          processSteps((step as WorkoutRepeatGroup).steps, multiplier * (step as WorkoutRepeatGroup).repeatCount)
        }
        else {
          const workoutStep = step as WorkoutStep
          if (workoutStep.duration.type === 'time' && workoutStep.duration.value) {
            total += workoutStep.duration.value * multiplier
          }
        }
      }
    }

    processSteps(this.currentSteps)
    return total
  }

  private calculateEstimatedDistance(): number {
    let total = 0

    const processSteps = (steps: (WorkoutStep | WorkoutRepeatGroup)[], multiplier = 1) => {
      for (const step of steps) {
        if (step.type === 'repeat') {
          processSteps((step as WorkoutRepeatGroup).steps, multiplier * (step as WorkoutRepeatGroup).repeatCount)
        }
        else {
          const workoutStep = step as WorkoutStep
          if (workoutStep.duration.type === 'distance' && workoutStep.duration.value) {
            total += workoutStep.duration.value * multiplier
          }
        }
      }
    }

    processSteps(this.currentSteps)
    return total
  }
}

// Helper functions for common durations
export const duration = {
  time: (seconds: number): WorkoutDuration => ({ type: 'time', value: seconds }),
  minutes: (minutes: number): WorkoutDuration => ({ type: 'time', value: minutes * 60 }),
  distance: (meters: number): WorkoutDuration => ({ type: 'distance', value: meters }),
  km: (km: number): WorkoutDuration => ({ type: 'distance', value: km * 1000 }),
  miles: (miles: number): WorkoutDuration => ({ type: 'distance', value: miles * 1609.34 }),
  calories: (cal: number): WorkoutDuration => ({ type: 'calories', value: cal }),
  open: (): WorkoutDuration => ({ type: 'open' }),
  lapButton: (): WorkoutDuration => ({ type: 'lap_button' }),
  untilHrBelow: (hr: number): WorkoutDuration => ({ type: 'heart_rate_less_than', value: hr }),
  untilHrAbove: (hr: number): WorkoutDuration => ({ type: 'heart_rate_greater_than', value: hr }),
}

// Helper functions for common targets
export const target = {
  open: (): WorkoutTarget => ({ type: 'open' }),
  hrZone: (zone: number): WorkoutTarget => ({ type: 'heart_rate_zone', zone }),
  hrRange: (low: number, high: number): WorkoutTarget => ({ type: 'heart_rate', low, high }),
  hr: (bpm: number): WorkoutTarget => ({ type: 'heart_rate', value: bpm }),
  powerZone: (zone: number): WorkoutTarget => ({ type: 'power_zone', zone }),
  powerRange: (low: number, high: number): WorkoutTarget => ({ type: 'power', low, high }),
  power: (watts: number): WorkoutTarget => ({ type: 'power', value: watts }),
  paceZone: (zone: number): WorkoutTarget => ({ type: 'pace_zone', zone }),
  paceRange: (slowSecPerKm: number, fastSecPerKm: number): WorkoutTarget => ({
    type: 'pace',
    low: fastSecPerKm,
    high: slowSecPerKm,
  }),
  pace: (secPerKm: number): WorkoutTarget => ({ type: 'pace', value: secPerKm }),
  cadence: (spm: number): WorkoutTarget => ({ type: 'cadence', value: spm }),
  cadenceRange: (low: number, high: number): WorkoutTarget => ({ type: 'cadence', low, high }),
}

/**
 * Create a new workout builder
 */
export function createWorkout(name: string, sport: SportType): WorkoutBuilder {
  return new WorkoutBuilder(name, sport)
}

/**
 * Common workout templates
 */
export const workoutTemplates = {
  /**
   * Classic 5x1km intervals for running
   */
  fiveByOneK: () => createWorkout('5x1K Intervals', 'running')
    .setDescription('Classic interval workout: 5x1km with recovery jogs')
    .warmup(duration.minutes(10), target.hrZone(2))
    .repeat(5, b => {
      b.interval(duration.km(1), target.hrZone(4), '1K Fast')
        .recovery(duration.minutes(2), target.hrZone(2))
    })
    .cooldown(duration.minutes(10), target.hrZone(1))
    .build(),

  /**
   * 30/30 intervals
   */
  thirtyThirty: (sets: number = 10) => createWorkout('30/30 Intervals', 'running')
    .setDescription(`${sets}x 30 seconds hard / 30 seconds easy`)
    .warmup(duration.minutes(10), target.hrZone(2))
    .repeat(sets, b => {
      b.interval(duration.time(30), target.hrZone(5), '30s Hard')
        .recovery(duration.time(30), target.hrZone(2))
    })
    .cooldown(duration.minutes(10), target.hrZone(1))
    .build(),

  /**
   * Tempo run
   */
  tempoRun: (tempoMinutes: number = 20) => createWorkout('Tempo Run', 'running')
    .setDescription(`${tempoMinutes} minutes at tempo pace`)
    .warmup(duration.minutes(10), target.hrZone(2))
    .interval(duration.minutes(tempoMinutes), target.hrZone(3), 'Tempo')
    .cooldown(duration.minutes(10), target.hrZone(1))
    .build(),

  /**
   * Cycling sweet spot
   */
  sweetSpot: (intervals: number = 3, minutes: number = 10) => createWorkout('Sweet Spot', 'cycling')
    .setDescription(`${intervals}x${minutes}min at 88-93% FTP`)
    .warmup(duration.minutes(10), target.powerZone(2))
    .repeat(intervals, b => {
      b.interval(duration.minutes(minutes), target.powerRange(88, 93), 'Sweet Spot')
        .recovery(duration.minutes(5), target.powerZone(1))
    })
    .cooldown(duration.minutes(10), target.powerZone(1))
    .build(),

  /**
   * VO2max intervals for cycling
   */
  vo2maxIntervals: () => createWorkout('VO2max Intervals', 'cycling')
    .setDescription('5x3min at 105-120% FTP')
    .warmup(duration.minutes(15), target.powerZone(2))
    .repeat(5, b => {
      b.interval(duration.minutes(3), target.powerRange(105, 120), 'VO2max')
        .recovery(duration.minutes(3), target.powerZone(1))
    })
    .cooldown(duration.minutes(10), target.powerZone(1))
    .build(),
}

/**
 * Format workout duration for display
 */
export function formatWorkoutDuration(duration: WorkoutDuration): string {
  switch (duration.type) {
    case 'time':
      if (!duration.value) return 'Open'
      const mins = Math.floor(duration.value / 60)
      const secs = duration.value % 60
      if (mins === 0) return `${secs}s`
      if (secs === 0) return `${mins}min`
      return `${mins}:${secs.toString().padStart(2, '0')}`
    case 'distance':
      if (!duration.value) return 'Open'
      if (duration.value >= 1000) return `${(duration.value / 1000).toFixed(1)}km`
      return `${duration.value}m`
    case 'calories':
      return `${duration.value} cal`
    case 'open':
      return 'Open'
    case 'lap_button':
      return 'Lap Button'
    case 'heart_rate_less_than':
      return `Until HR < ${duration.value}`
    case 'heart_rate_greater_than':
      return `Until HR > ${duration.value}`
    default:
      return 'Unknown'
  }
}

/**
 * Format workout target for display
 */
export function formatWorkoutTarget(workoutTarget: WorkoutTarget): string {
  switch (workoutTarget.type) {
    case 'open':
      return 'No target'
    case 'heart_rate_zone':
      return `HR Zone ${workoutTarget.zone}`
    case 'heart_rate':
      if (workoutTarget.low && workoutTarget.high) {
        return `${workoutTarget.low}-${workoutTarget.high} bpm`
      }
      return `${workoutTarget.value} bpm`
    case 'power_zone':
      return `Power Zone ${workoutTarget.zone}`
    case 'power':
      if (workoutTarget.low && workoutTarget.high) {
        return `${workoutTarget.low}-${workoutTarget.high}W`
      }
      return `${workoutTarget.value}W`
    case 'pace_zone':
      return `Pace Zone ${workoutTarget.zone}`
    case 'pace':
      const formatPace = (sec: number) => {
        const m = Math.floor(sec / 60)
        const s = Math.round(sec % 60)
        return `${m}:${s.toString().padStart(2, '0')}`
      }
      if (workoutTarget.low && workoutTarget.high) {
        return `${formatPace(workoutTarget.low)}-${formatPace(workoutTarget.high)}/km`
      }
      return `${formatPace(workoutTarget.value!)}/km`
    case 'cadence':
      if (workoutTarget.low && workoutTarget.high) {
        return `${workoutTarget.low}-${workoutTarget.high} spm`
      }
      return `${workoutTarget.value} spm`
    default:
      return 'Unknown'
  }
}
