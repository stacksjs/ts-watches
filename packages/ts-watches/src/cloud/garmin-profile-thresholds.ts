export interface GarminHeartRateThresholds {
  lthr: number | null
  maxHeartRate: number | null
  restingHeartRate: number | null
}

function profiles(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new TypeError('Invalid Garmin threshold profile response')
  return value.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object' && !Array.isArray(row))
}

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

/** Running overrides inherit absent fields from DEFAULT, never from cycling or rowing. */
export function parseGarminHeartRateThresholds(value: unknown): GarminHeartRateThresholds {
  const rows = profiles(value)
  const running = rows.find(row => row.sport === 'RUNNING')
  const defaults = rows.find(row => row.sport === 'DEFAULT')
  const read = (key: string, min: number) => integer(running?.[key], min, 250) ?? integer(defaults?.[key], min, 250)
  return {
    lthr: read('lactateThresholdHeartRateUsed', 30),
    maxHeartRate: read('maxHeartRateUsed', 30),
    restingHeartRate: read('restingHeartRateUsed', 20),
  }
}

/** Garmin's cycling FTP in watts; running threshold power is a different setting. */
export function parseGarminCyclingFtp(value: unknown): number | null {
  return integer(profiles(value).find(row => row.sport === 'CYCLING')?.functionalThresholdPower, 1, 2500)
}
