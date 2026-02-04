import type { IWorkoutDetail } from '../types'
import type { Step } from './step'
import type { WorkoutType } from './workout-type'

export class WorkoutBuilder {
  private steps: Step[] = []

  constructor(
    private readonly workoutType: WorkoutType,
    private workoutName: string,
    private workoutDescription: string = '',
  ) {}

  addStep(step: Step): this {
    this.steps.push(step)
    return this
  }

  build(): IWorkoutDetail {
    return {
      ...this.workoutType.build(),
      subSportType: null,
      workoutName: this.workoutName,
      description: this.workoutDescription,
      estimatedDistanceUnit: { unitKey: null },
      workoutSegments: [
        {
          segmentOrder: 1,
          ...this.workoutType.build(),
          workoutSteps: this.steps.map((step, index) => step.build(index + 1)),
        },
      ],
      avgTrainingSpeed: null,
      estimatedDurationInSecs: 0,
      estimatedDistanceInMeters: null,
      estimateType: null,
      isWheelchair: false,
    } as unknown as IWorkoutDetail
  }
}
