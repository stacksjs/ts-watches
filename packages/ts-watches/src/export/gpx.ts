import type { Activity, ActivityRecord } from '../types'

export interface GpxOptions {
  creator?: string
  includeHeartRate?: boolean
  includeCadence?: boolean
  includePower?: boolean
  includeTemperature?: boolean
}

const DEFAULT_OPTIONS: GpxOptions = {
  creator: 'ts-watches',
  includeHeartRate: true,
  includeCadence: true,
  includePower: true,
  includeTemperature: true,
}

export function activityToGpx(activity: Activity, options: GpxOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const trackpoints = activity.records
    .filter(r => r.position?.lat != null && r.position?.lng != null)
    .map(r => recordToTrackpoint(r, opts))
    .join('\n')

  const extensions = buildExtensions(activity, opts)

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${opts.creator}"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(activity.name || `${activity.sport} - ${activity.startTime.toISOString()}`)}</name>
    <time>${activity.startTime.toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(activity.name || activity.sport)}</name>
    <type>${mapSportToGpxType(activity.sport)}</type>${extensions}
    <trkseg>
${trackpoints}
    </trkseg>
  </trk>
</gpx>`
}

function recordToTrackpoint(record: ActivityRecord, opts: GpxOptions): string {
  const { position, timestamp, heartRate, cadence, power, temperature, altitude } = record

  if (!position) return ''

  const extensions: string[] = []

  if (opts.includeHeartRate && heartRate != null) {
    extensions.push(`        <gpxtpx:hr>${heartRate}</gpxtpx:hr>`)
  }
  if (opts.includeCadence && cadence != null) {
    extensions.push(`        <gpxtpx:cad>${cadence}</gpxtpx:cad>`)
  }
  if (opts.includePower && power != null) {
    extensions.push(`        <gpxtpx:power>${power}</gpxtpx:power>`)
  }
  if (opts.includeTemperature && temperature != null) {
    extensions.push(`        <gpxtpx:atemp>${temperature}</gpxtpx:atemp>`)
  }

  const extensionsXml = extensions.length > 0
    ? `
      <extensions>
        <gpxtpx:TrackPointExtension>
${extensions.join('\n')}
        </gpxtpx:TrackPointExtension>
      </extensions>`
    : ''

  const ele = altitude ?? position.altitude
  const eleXml = ele != null ? `\n        <ele>${ele.toFixed(1)}</ele>` : ''

  return `      <trkpt lat="${position.lat.toFixed(7)}" lon="${position.lng.toFixed(7)}">${eleXml}
        <time>${timestamp.toISOString()}</time>${extensionsXml}
      </trkpt>`
}

function buildExtensions(activity: Activity, _opts: GpxOptions): string {
  const stats: string[] = []

  if (activity.totalDistance) {
    stats.push(`      <gpxx:Distance>${activity.totalDistance.toFixed(0)}</gpxx:Distance>`)
  }
  if (activity.totalTimerTime) {
    stats.push(`      <gpxx:TimerTime>${activity.totalTimerTime.toFixed(0)}</gpxx:TimerTime>`)
  }
  if (activity.totalCalories) {
    stats.push(`      <gpxx:Calories>${activity.totalCalories}</gpxx:Calories>`)
  }
  if (activity.avgHeartRate) {
    stats.push(`      <gpxx:AvgHeartRate>${activity.avgHeartRate}</gpxx:AvgHeartRate>`)
  }
  if (activity.maxHeartRate) {
    stats.push(`      <gpxx:MaxHeartRate>${activity.maxHeartRate}</gpxx:MaxHeartRate>`)
  }
  if (activity.avgCadence) {
    stats.push(`      <gpxx:AvgCadence>${activity.avgCadence}</gpxx:AvgCadence>`)
  }
  if (activity.avgSpeed) {
    stats.push(`      <gpxx:AvgSpeed>${activity.avgSpeed.toFixed(2)}</gpxx:AvgSpeed>`)
  }

  if (stats.length === 0) return ''

  return `
    <extensions>
      <gpxx:TrackExtension>
${stats.join('\n')}
      </gpxx:TrackExtension>
    </extensions>`
}

function mapSportToGpxType(sport: string): string {
  const sportMap: Record<string, string> = {
    running: 'running',
    cycling: 'cycling',
    swimming: 'swimming',
    hiking: 'hiking',
    walking: 'walking',
    other: 'other',
  }
  return sportMap[sport] || 'other'
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function writeGpx(activity: Activity, filePath: string, options?: GpxOptions): Promise<void> {
  const gpx = activityToGpx(activity, options)
  await Bun.write(filePath, gpx)
}
