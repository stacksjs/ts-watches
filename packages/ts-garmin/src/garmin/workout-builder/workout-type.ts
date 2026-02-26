export class WorkoutType {
  private constructor(
    private readonly sportTypeKey: string,
    private readonly sportTypeId: number,
  ) {}

  build(): { sportType: { sportTypeId: number, sportTypeKey: string, displayOrder: number } } {
    return {
      sportType: {
        sportTypeId: this.sportTypeId,
        sportTypeKey: this.sportTypeKey,
        displayOrder: this.sportTypeId,
      },
    }
  }

  static Running: WorkoutType = new WorkoutType('running', 1)
  static Cycling: WorkoutType = new WorkoutType('cycling', 2)
  static Swimming: WorkoutType = new WorkoutType('swimming', 4)
  static Strength: WorkoutType = new WorkoutType('strength_training', 5)
  static Cardio: WorkoutType = new WorkoutType('cardio_training', 6)
}
