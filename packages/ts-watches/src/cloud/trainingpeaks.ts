/**
 * TrainingPeaks Cloud Integration
 *
 * Re-exports from ts-trainingpeaks package which provides
 * browser-based authentication with the TrainingPeaks API.
 *
 * @example
 * ```typescript
 * import { TrainingPeaks } from 'ts-watches/cloud'
 *
 * const client = new TrainingPeaks({
 *   username: 'your-username',
 *   password: 'your-password',
 *   cookiePath: './tp-cookies.json', // Optional: persist session
 *   headless: true,                   // Run browser headlessly
 * })
 *
 * await client.login()
 *
 * // Get workouts for the current user
 * const workouts = await client.getWorkouts(startDate, endDate)
 *
 * // For coach accounts, get coached athletes
 * const athleteIds = await client.getCoachedAthleteIds()
 * const athleteWorkouts = await client.getWorkouts(startDate, endDate, athleteIds[0])
 * ```
 */

export {
  TrainingPeaks,
  type TrainingPeaksConfig,
} from 'ts-trainingpeaks'

export {
  type TPAthlete,
  type TPAthleteGroup,
  type TPCoachAthlete,
  type TPWorkout,
  type TPWorkoutStructureResponse,
  type TPWorkoutStructureStep,
  type TPWorkoutType,
  type TPWorkoutTypeId,
  type TPMetrics,
  type TPPerformanceChart,
  type TPUploadResult,
  type TPLibraryWorkout,
  type TPCookie,
  TPWorkoutTypeIds,
  getWorkoutTypeName,
} from 'ts-trainingpeaks'
