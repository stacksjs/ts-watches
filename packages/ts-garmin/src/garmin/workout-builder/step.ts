import type { Duration } from './duration'
import { NoDuration } from './duration'
import type { Target } from './target'
import { NoTarget } from './target'

export class Step {
  constructor(
    private stepType: StepType,
    private duration: Duration = new NoDuration(),
    private target: Target = new NoTarget(),
    private notes: string = '',
  ) {}

  build(index: number): Record<string, unknown> {
    return {
      category: null,
      childStepId: null,
      description: this.notes,
      equipmentType: {
        displayOrder: null,
        equipmentTypeId: null,
        equipmentTypeKey: null,
      },
      exerciseName: null,
      preferredEndConditionUnit: null,
      providerExerciseSourceId: null,
      secondaryTargetType: null,
      secondaryTargetValueOne: null,
      secondaryTargetValueTwo: null,
      secondaryTargetValueUnit: null,
      secondaryZoneNumber: null,
      stepAudioNote: null,
      stepId: index,
      stepOrder: index,
      strokeType: {},
      targetValueOne: null,
      targetValueTwo: null,
      targetValueUnit: null,
      type: 'ExecutableStepDTO',
      weightUnit: null,
      weightValue: null,
      workoutProvider: null,
      zoneNumber: null,

      ...this.stepType.build(),
      ...this.duration.build(),
      ...this.target.build(),
    }
  }
}

export class StepType {
  private constructor(private type: string, private stepId: number) {}

  build(): { stepType: { stepTypeId: number, stepTypeKey: string, displayOrder: number } } {
    return {
      stepType: {
        stepTypeId: this.stepId,
        stepTypeKey: this.type,
        displayOrder: this.stepId,
      },
    }
  }

  static WarmUp = new StepType('warmup', 1)
  static Run = new StepType('interval', 3)
  static Recovery = new StepType('recovery', 4)
  static Rest = new StepType('rest', 5)
  static Cooldown = new StepType('cooldown', 2)
  static Other = new StepType('other', 7)
}
