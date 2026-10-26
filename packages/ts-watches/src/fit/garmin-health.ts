import { readStrictFit } from './strict'
export interface GarminHealthDay { date: string, hrv?: number, sleep_hours?: number, sleep_score?: number, stress?: number, steps?: number, active_calories?: number, spo2?: number, respiration?: number, skin_temperature_deviation?: number }
export interface GarminHealthFile { fileType: number | null, deviceId: string | null, days: GarminHealthDay[], heartRate: { timestamp: number, bpm: number }[] }
/** Public FIT field layouts, independently encoded from Garmin's FIT profile.
 * Unknown/private fields remain in the retained raw FIT file for later decoding.
 * Live RR intervals and FIT HRV beat intervals are never treated as nightly HRV. */
// eslint-disable-next-line pickier/no-unused-vars -- Both inputs are read below; nested callback analysis misses them.
export function decodeGarminHealthFile(bytes: Uint8Array, timezone: string): GarminHealthFile {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const messages = readStrictFit(bytes)
  const days = new Map<string, GarminHealthDay>()
  const heartRate: GarminHealthFile['heartRate'] = []
  const stress = new Map<string, number[]>()
  const spo2 = new Map<string, number[]>()
  const respiration = new Map<string, number[]>()
  let deviceId: string | null = null
  let fileType: number | null = null
  const levels: { timestamp: number, level: number }[] = []
  for (const message of messages) {
    const f = message.fields
    const n = (field: number): number | null => typeof f[field] === 'number' ? f[field] as number : null
    if (message.number === 0) { fileType = n(0); const serial = n(3); if (serial !== null) deviceId = String(serial) }
    const rawTime = message.number === 227 ? n(1) : n(253)
    if (rawTime === null) continue
    const timestamp = (rawTime + 631065600) * 1000
    const key = date.format(timestamp)
    const day = days.get(key) ?? { date: key }
    days.set(key, day)
    if ([55, 20].includes(message.number)) {
      const hr = n(message.number === 55 ? 27 : 3)
      if (hr !== null && hr > 0 && hr < 255) heartRate.push({ timestamp, bpm: hr })
    }
    if (message.number === 55) {
      // cycles is cumulative, with a walking/running steps subfield. Never sum snapshots.
      const cycles = n(3)
      if (cycles !== null && [1, 6].includes(n(5) ?? -1)) day.steps = Math.max(day.steps ?? 0, cycles)
      const calories = n(19)
      if (calories !== null) day.active_calories = Math.max(day.active_calories ?? 0, calories)
    }
    if (message.number === 370 && n(1) !== null) day.hrv = n(1)! / 128
    if (message.number === 227 && n(0) !== null && n(0)! >= 0 && n(0)! <= 100) { const values = stress.get(key) ?? []; values.push(n(0)!); stress.set(key, values) }
    if (message.number === 269 && n(0) !== null && n(0)! > 0 && n(0)! <= 100) { const values = spo2.get(key) ?? []; values.push(n(0)!); spo2.set(key, values) }
    if (message.number === 297 && n(0) !== null && n(0)! > 0) { const values = respiration.get(key) ?? []; values.push(n(0)! / 100); respiration.set(key, values) }
    if (message.number === 398 && n(1) !== null) day.skin_temperature_deviation = n(1)!
    if (message.number === 275 && n(0) !== null) levels.push({ timestamp, level: n(0)! })
  }
  // A closed sleep episode belongs to its wake date. Leave an unterminated
  // final stage missing; it must not appear as a whole night's sleep.
  levels.sort((a, b) => a.timestamp - b.timestamp)
  let slept = 0
  for (let i = 0; i < levels.length - 1; i++) {
    const stage = levels[i]!
    const next = levels[i + 1]!
    const seconds = (next.timestamp - stage.timestamp) / 1000
    if ([2, 3, 4].includes(stage.level) && seconds > 0 && seconds <= 12 * 3600) slept += seconds
    if ((next.level === 0 || (i === levels.length - 2 && next.level === 1)) && slept) {
      const key = date.format(next.timestamp)
      const day = days.get(key) ?? { date: key }
      day.sleep_hours = (day.sleep_hours ?? 0) + slept / 3600
      days.set(key, day); slept = 0
    }
  }
  // sleep_assessment has no timestamp; only attach its score when this file
  // contains one unambiguous completed sleep episode/day.
  const sleepDays = [...days.values()].filter(day => day.sleep_hours !== undefined)
  const assessments = messages.filter(m => m.number === 346 && typeof m.fields[6] === 'number')
  if (sleepDays.length === 1 && assessments.length === 1) sleepDays[0]!.sleep_score = assessments[0]!.fields[6] as number
  for (const day of days.values()) {
    for (const [source, field] of [[stress, 'stress'], [spo2, 'spo2'], [respiration, 'respiration']] as const) {
      const values = source.get(day.date)
      if (values?.length) day[field] = values.reduce((sum, v) => sum + v, 0) / values.length
    }
  }
  return { fileType, deviceId, days: [...days.values()].filter(day => Object.keys(day).length > 1), heartRate }
}
