import type { Activity, ActivityRecord, MonitoringData } from '../types'

export interface CsvOptions {
  delimiter?: string
  includeHeader?: boolean
  dateFormat?: 'iso' | 'unix' | 'locale'
}

const DEFAULT_OPTIONS: CsvOptions = {
  delimiter: ',',
  includeHeader: true,
  dateFormat: 'iso',
}

export function activityToCsv(activity: Activity, options: CsvOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const d = opts.delimiter!

  const headers = [
    'timestamp',
    'latitude',
    'longitude',
    'altitude',
    'distance',
    'speed',
    'heart_rate',
    'cadence',
    'power',
    'temperature',
    'grade',
    'calories',
  ]

  const rows = activity.records.map(record => recordToCsvRow(record, opts))

  if (opts.includeHeader) {
    return [headers.join(d), ...rows].join('\n')
  }
  return rows.join('\n')
}

function recordToCsvRow(record: ActivityRecord, opts: CsvOptions): string {
  const d = opts.delimiter!
  const formatDate = getDateFormatter(opts.dateFormat!)

  return [
    formatDate(record.timestamp),
    record.position?.lat?.toFixed(7) ?? '',
    record.position?.lng?.toFixed(7) ?? '',
    record.altitude?.toFixed(1) ?? record.position?.altitude?.toFixed(1) ?? '',
    record.distance?.toFixed(1) ?? '',
    record.speed?.toFixed(2) ?? '',
    record.heartRate ?? '',
    record.cadence ?? '',
    record.power ?? '',
    record.temperature ?? '',
    record.grade?.toFixed(2) ?? '',
    record.calories ?? '',
  ].join(d)
}

export function activitySummaryToCsv(activities: Activity[], options: CsvOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const d = opts.delimiter!
  const formatDate = getDateFormatter(opts.dateFormat!)

  const headers = [
    'id',
    'name',
    'sport',
    'sub_sport',
    'start_time',
    'end_time',
    'elapsed_time_sec',
    'timer_time_sec',
    'distance_m',
    'calories',
    'avg_heart_rate',
    'max_heart_rate',
    'avg_speed_mps',
    'max_speed_mps',
    'avg_cadence',
    'max_cadence',
    'avg_power',
    'max_power',
    'normalized_power',
    'total_ascent_m',
    'total_descent_m',
    'tss',
    'intensity_factor',
    'num_laps',
    'num_records',
  ]

  const rows = activities.map(a => [
    escapeForCsv(a.id),
    escapeForCsv(a.name || ''),
    a.sport,
    a.subSport || '',
    formatDate(a.startTime),
    formatDate(a.endTime),
    a.totalElapsedTime.toFixed(0),
    a.totalTimerTime.toFixed(0),
    a.totalDistance.toFixed(1),
    a.totalCalories,
    a.avgHeartRate ?? '',
    a.maxHeartRate ?? '',
    a.avgSpeed?.toFixed(2) ?? '',
    a.maxSpeed?.toFixed(2) ?? '',
    a.avgCadence ?? '',
    a.maxCadence ?? '',
    a.avgPower ?? '',
    a.maxPower ?? '',
    a.normalizedPower ?? '',
    a.totalAscent ?? '',
    a.totalDescent ?? '',
    a.trainingStressScore?.toFixed(1) ?? '',
    a.intensityFactor?.toFixed(3) ?? '',
    a.laps.length,
    a.records.length,
  ].join(d))

  if (opts.includeHeader) {
    return [headers.join(d), ...rows].join('\n')
  }
  return rows.join('\n')
}

export function lapsToCsv(activity: Activity, options: CsvOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const d = opts.delimiter!
  const formatDate = getDateFormatter(opts.dateFormat!)

  const headers = [
    'lap_number',
    'start_time',
    'end_time',
    'elapsed_time_sec',
    'timer_time_sec',
    'distance_m',
    'calories',
    'avg_heart_rate',
    'max_heart_rate',
    'avg_speed_mps',
    'max_speed_mps',
    'avg_cadence',
    'max_cadence',
    'avg_power',
    'max_power',
    'total_ascent_m',
    'total_descent_m',
  ]

  const rows = activity.laps.map((lap, i) => [
    i + 1,
    formatDate(lap.startTime),
    formatDate(lap.endTime),
    lap.totalElapsedTime.toFixed(0),
    lap.totalTimerTime.toFixed(0),
    lap.totalDistance.toFixed(1),
    lap.totalCalories,
    lap.avgHeartRate ?? '',
    lap.maxHeartRate ?? '',
    lap.avgSpeed?.toFixed(2) ?? '',
    lap.maxSpeed?.toFixed(2) ?? '',
    lap.avgCadence ?? '',
    lap.maxCadence ?? '',
    lap.avgPower ?? '',
    lap.maxPower ?? '',
    lap.totalAscent ?? '',
    lap.totalDescent ?? '',
  ].join(d))

  if (opts.includeHeader) {
    return [headers.join(d), ...rows].join('\n')
  }
  return rows.join('\n')
}

export function heartRateToCsv(data: MonitoringData, options: CsvOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const d = opts.delimiter!
  const formatDate = getDateFormatter(opts.dateFormat!)

  if (!data.heartRate?.samples) return ''

  const headers = ['timestamp', 'heart_rate']
  const rows = data.heartRate.samples.map(s => [
    formatDate(s.timestamp),
    s.heartRate,
  ].join(d))

  if (opts.includeHeader) {
    return [headers.join(d), ...rows].join('\n')
  }
  return rows.join('\n')
}

export function sleepToCsv(data: MonitoringData, options: CsvOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const d = opts.delimiter!
  const formatDate = getDateFormatter(opts.dateFormat!)

  if (!data.sleep?.stages) return ''

  const headers = ['start_time', 'end_time', 'stage', 'duration_min']
  const rows = data.sleep.stages.map(s => [
    formatDate(s.startTime),
    formatDate(s.endTime),
    s.stage,
    ((s.endTime.getTime() - s.startTime.getTime()) / 60000).toFixed(1),
  ].join(d))

  if (opts.includeHeader) {
    return [headers.join(d), ...rows].join('\n')
  }
  return rows.join('\n')
}

export function stressToCsv(data: MonitoringData, options: CsvOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const d = opts.delimiter!
  const formatDate = getDateFormatter(opts.dateFormat!)

  if (!data.stress?.samples) return ''

  const headers = ['timestamp', 'stress_level']
  const rows = data.stress.samples.map(s => [
    formatDate(s.timestamp),
    s.stressLevel,
  ].join(d))

  if (opts.includeHeader) {
    return [headers.join(d), ...rows].join('\n')
  }
  return rows.join('\n')
}

function getDateFormatter(format: 'iso' | 'unix' | 'locale'): (date: Date) => string {
  switch (format) {
    case 'unix':
      return (date: Date) => Math.floor(date.getTime() / 1000).toString()
    case 'locale':
      return (date: Date) => date.toLocaleString()
    case 'iso':
    default:
      return (date: Date) => date.toISOString()
  }
}

function escapeForCsv(_str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function writeCsv(
  data: string,
  filePath: string
): Promise<void> {
  await Bun.write(filePath, data)
}
