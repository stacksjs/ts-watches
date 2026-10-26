export interface GarminLactateThreshold {
  speed: { calendarDate: string, metersPerSecond: number, secondsPerKilometer: number } | null
  heartRate: { calendarDate: string, bpm: number } | null
}

/**
 * Connect's biometric threshold endpoint uses units of 10 m/s, unlike activity
 * samples in m/s. 0.37222118 means 3.7222118 m/s, or 4:29/km, not 6:12/km.
 * Keep the original local measurement date and never infer a unit from magnitude.
 */
export function parseGarminLactateThreshold(value: unknown): GarminLactateThreshold {
  if (!Array.isArray(value)) throw new TypeError('Invalid Garmin lactate threshold response')
  const rows = value.filter(row => row && typeof row.calendarDate === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/.test(row.calendarDate) && Number.isFinite(Date.parse(row.calendarDate)))
    .sort((a, b) => b.calendarDate.localeCompare(a.calendarDate))
  const speed = rows.find(row => typeof row.speed === 'number' && Number.isFinite(row.speed) && row.speed > 0 && 100 / row.speed >= 120 && 100 / row.speed <= 900)
  // `hearRate` is Garmin's actual running field name; cycling/rowing stay separate.
  const heart = rows.find(row => typeof row.hearRate === 'number' && Number.isFinite(row.hearRate) && row.hearRate >= 30 && row.hearRate <= 250)
  return {
    speed: speed ? { calendarDate: speed.calendarDate, metersPerSecond: speed.speed * 10, secondsPerKilometer: 100 / speed.speed } : null,
    heartRate: heart ? { calendarDate: heart.calendarDate, bpm: heart.hearRate } : null,
  }
}
