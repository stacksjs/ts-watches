import type { SportType } from '../types'
import type { Workout } from './builder'
import { createWorkout, duration, target, workoutTemplates } from './builder'

export interface TrainingWeek {
  weekNumber: number
  phase: TrainingPhase
  description?: string
  workouts: ScheduledWorkout[]
  targetTSS?: number
  targetDistance?: number // meters
  targetDuration?: number // seconds
}

export interface ScheduledWorkout {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday
  workout: Workout
  notes?: string
}

export type TrainingPhase =
  | 'base'
  | 'build'
  | 'peak'
  | 'taper'
  | 'recovery'

export interface TrainingPlan {
  id?: string
  name: string
  description?: string
  sport: SportType
  goalRace?: {
    name: string
    date: Date
    distance: number // meters
  }
  weeks: TrainingWeek[]
  startDate: Date
  endDate: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface TrainingPlanConfig {
  name: string
  sport: SportType
  goalRaceDate: Date
  goalRaceDistance: number // meters
  currentFitness: 'beginner' | 'intermediate' | 'advanced'
  weeklyHours: number
  longRunDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  restDays?: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>
}

export class TrainingPlanBuilder {
  private plan: TrainingPlan
  private weeks: TrainingWeek[] = []

  constructor(config: TrainingPlanConfig) {
    const weeksToRace = Math.ceil(
      (config.goalRaceDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
    )

    this.plan = {
      name: config.name,
      sport: config.sport,
      goalRace: {
        name: config.name,
        date: config.goalRaceDate,
        distance: config.goalRaceDistance,
      },
      weeks: [],
      startDate: new Date(),
      endDate: config.goalRaceDate,
      createdAt: new Date(),
    }
  }

  addWeek(week: TrainingWeek): this {
    this.weeks.push(week)
    return this
  }

  setDescription(description: string): this {
    this.plan.description = description
    return this
  }

  build(): TrainingPlan {
    this.plan.weeks = this.weeks
    this.plan.updatedAt = new Date()
    return this.plan
  }
}

/**
 * Generate a marathon training plan
 */
export function generateMarathonPlan(config: {
  raceDate: Date
  name?: string
  currentWeeklyMileage: number // km
  fitness: 'beginner' | 'intermediate' | 'advanced'
}): TrainingPlan {
  const { raceDate, name = 'Marathon Training', currentWeeklyMileage, fitness } = config

  const weeksToRace = Math.ceil(
    (raceDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
  )

  // Typical marathon plan is 16-20 weeks
  const planWeeks = Math.min(Math.max(weeksToRace, 12), 20)

  const weeks: TrainingWeek[] = []
  const peakMileage = fitness === 'beginner' ? 50 : fitness === 'intermediate' ? 70 : 90

  for (let i = 1; i <= planWeeks; i++) {
    const weeksRemaining = planWeeks - i
    let phase: TrainingPhase
    let weeklyMileage: number

    // Determine phase
    if (weeksRemaining <= 2) {
      phase = 'taper'
      weeklyMileage = peakMileage * (weeksRemaining === 2 ? 0.6 : 0.4)
    }
    else if (weeksRemaining <= 5) {
      phase = 'peak'
      weeklyMileage = peakMileage
    }
    else if (weeksRemaining <= 10) {
      phase = 'build'
      const buildProgress = (10 - weeksRemaining) / 5
      weeklyMileage = currentWeeklyMileage + (peakMileage - currentWeeklyMileage) * buildProgress
    }
    else {
      phase = 'base'
      const baseProgress = (planWeeks - 10 - weeksRemaining) / (planWeeks - 10)
      weeklyMileage = currentWeeklyMileage * (1 + baseProgress * 0.2)
    }

    // Recovery week every 4th week
    if (i % 4 === 0 && phase !== 'taper') {
      phase = 'recovery'
      weeklyMileage *= 0.7
    }

    const workouts: ScheduledWorkout[] = []

    // Monday - Rest or easy
    if (phase !== 'recovery') {
      workouts.push({
        dayOfWeek: 1,
        workout: createWorkout('Easy Run', 'running')
          .warmup(duration.minutes(5), target.hrZone(1))
          .active(duration.km(8), target.hrZone(2), 'Easy')
          .cooldown(duration.minutes(5), target.hrZone(1))
          .build(),
      })
    }

    // Tuesday - Speed work (except taper)
    if (phase !== 'taper' && phase !== 'recovery') {
      workouts.push({
        dayOfWeek: 2,
        workout: i % 2 === 0
          ? workoutTemplates.thirtyThirty(10)
          : workoutTemplates.fiveByOneK(),
      })
    }

    // Wednesday - Easy
    workouts.push({
      dayOfWeek: 3,
      workout: createWorkout('Easy Run', 'running')
        .active(duration.km(phase === 'taper' ? 5 : 8), target.hrZone(2))
        .build(),
    })

    // Thursday - Tempo or rest
    if (phase === 'build' || phase === 'peak') {
      workouts.push({
        dayOfWeek: 4,
        workout: workoutTemplates.tempoRun(phase === 'peak' ? 30 : 20),
      })
    }

    // Friday - Rest

    // Saturday - Easy/moderate
    if (phase !== 'taper') {
      workouts.push({
        dayOfWeek: 6,
        workout: createWorkout('Moderate Run', 'running')
          .active(duration.km(10), target.hrZone(2), 'Moderate')
          .build(),
      })
    }

    // Sunday - Long run
    const longRunDistance = phase === 'taper'
      ? (weeksRemaining === 2 ? 16 : 10)
      : Math.min(32, weeklyMileage * 0.35)

    workouts.push({
      dayOfWeek: 0,
      workout: createWorkout('Long Run', 'running')
        .warmup(duration.km(2), target.hrZone(2))
        .active(duration.km(longRunDistance - 4), target.hrZone(2), 'Long Run')
        .cooldown(duration.km(2), target.hrZone(1))
        .build(),
      notes: phase === 'peak' ? 'Include marathon pace miles in middle' : undefined,
    })

    weeks.push({
      weekNumber: i,
      phase,
      description: getPhaseDescription(phase, i, planWeeks),
      workouts,
      targetDistance: weeklyMileage * 1000,
    })
  }

  return {
    name,
    description: `${planWeeks}-week marathon training plan`,
    sport: 'running',
    goalRace: {
      name: 'Marathon',
      date: raceDate,
      distance: 42195,
    },
    weeks,
    startDate: new Date(),
    endDate: raceDate,
    createdAt: new Date(),
  }
}

/**
 * Generate a 5K training plan
 */
export function generate5kPlan(config: {
  raceDate: Date
  name?: string
  fitness: 'beginner' | 'intermediate' | 'advanced'
}): TrainingPlan {
  const { raceDate, name = '5K Training', fitness } = config

  const planWeeks = 8
  const weeks: TrainingWeek[] = []

  for (let i = 1; i <= planWeeks; i++) {
    const weeksRemaining = planWeeks - i
    let phase: TrainingPhase

    if (weeksRemaining === 0) {
      phase = 'taper'
    }
    else if (weeksRemaining <= 2) {
      phase = 'peak'
    }
    else {
      phase = 'build'
    }

    const workouts: ScheduledWorkout[] = []

    // Tuesday - Intervals
    if (phase !== 'taper') {
      workouts.push({
        dayOfWeek: 2,
        workout: createWorkout('Intervals', 'running')
          .warmup(duration.minutes(10), target.hrZone(2))
          .repeat(fitness === 'beginner' ? 4 : 6, b => {
            b.interval(duration.time(90), target.hrZone(4), '90s Hard')
              .recovery(duration.time(90), target.hrZone(2))
          })
          .cooldown(duration.minutes(10), target.hrZone(1))
          .build(),
      })
    }

    // Thursday - Tempo
    workouts.push({
      dayOfWeek: 4,
      workout: phase === 'taper'
        ? createWorkout('Easy Shakeout', 'running')
            .active(duration.km(3), target.hrZone(2))
            .build()
        : workoutTemplates.tempoRun(15),
    })

    // Sunday - Long run
    const longDistance = phase === 'taper' ? 5 : fitness === 'beginner' ? 8 : 10

    workouts.push({
      dayOfWeek: 0,
      workout: createWorkout('Long Run', 'running')
        .active(duration.km(longDistance), target.hrZone(2))
        .build(),
    })

    weeks.push({
      weekNumber: i,
      phase,
      description: getPhaseDescription(phase, i, planWeeks),
      workouts,
    })
  }

  return {
    name,
    description: '8-week 5K training plan',
    sport: 'running',
    goalRace: {
      name: '5K',
      date: raceDate,
      distance: 5000,
    },
    weeks,
    startDate: new Date(),
    endDate: raceDate,
    createdAt: new Date(),
  }
}

function getPhaseDescription(phase: TrainingPhase, week: number, totalWeeks: number): string {
  switch (phase) {
    case 'base':
      return `Base building - Week ${week} of ${totalWeeks}`
    case 'build':
      return `Building fitness - Week ${week} of ${totalWeeks}`
    case 'peak':
      return `Peak training - maximize fitness`
    case 'taper':
      return `Taper week - reduce volume, maintain intensity`
    case 'recovery':
      return `Recovery week - reduced volume`
    default:
      return `Week ${week}`
  }
}

/**
 * Export training plan to iCal format
 */
export function planToIcal(plan: TrainingPlan): string {
  const events: string[] = []
  const currentDate = new Date(plan.startDate)

  for (const week of plan.weeks) {
    for (const scheduled of week.workouts) {
      // Find the next occurrence of this day of week
      while (currentDate.getDay() !== scheduled.dayOfWeek) {
        currentDate.setDate(currentDate.getDate() + 1)
      }

      const dateStr = currentDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      const endDate = new Date(currentDate.getTime() + (scheduled.workout.estimatedDuration || 3600) * 1000)
      const endStr = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

      events.push(`BEGIN:VEVENT
DTSTART:${dateStr}
DTEND:${endStr}
SUMMARY:${scheduled.workout.name}
DESCRIPTION:${scheduled.workout.description || ''}${scheduled.notes ? `\\n${scheduled.notes}` : ''}
END:VEVENT`)
    }

    // Move to next week
    currentDate.setDate(currentDate.getDate() + 7 - currentDate.getDay())
  }

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ts-watches//Training Plan//EN
${events.join('\n')}
END:VCALENDAR`
}

export function createTrainingPlan(config: TrainingPlanConfig): TrainingPlanBuilder {
  return new TrainingPlanBuilder(config)
}
