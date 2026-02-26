import type { Activity, ActivityRecord, GeoPosition } from '../types'

export interface GeoJsonFeature {
  type: 'Feature'
  geometry: {
    type: 'LineString' | 'Point'
    coordinates: number[][]  | number[]
  }
  properties: Record<string, unknown>
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

export interface GeoJsonOptions {
  includeElevation?: boolean
  includeTimestamps?: boolean
  includeMetrics?: boolean
  simplifyTolerance?: number
}

const DEFAULT_OPTIONS: GeoJsonOptions = {
  includeElevation: true,
  includeTimestamps: true,
  includeMetrics: true,
  simplifyTolerance: 0,
}

export function activityToGeoJson(activity: Activity, options: GeoJsonOptions = {}): GeoJsonFeatureCollection {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  let records = activity.records.filter(r => r.position?.lat != null && r.position?.lng != null)

  // Apply simplification if requested
  if (opts.simplifyTolerance && opts.simplifyTolerance > 0) {
    records = simplifyPath(records, opts.simplifyTolerance)
  }

  const coordinates = records.map(r => {
    const coord: number[] = [r.position!.lng, r.position!.lat]
    if (opts.includeElevation && (r.altitude != null || r.position!.altitude != null)) {
      coord.push(r.altitude ?? r.position!.altitude!)
    }
    return coord
  })

  const properties: Record<string, unknown> = {
    id: activity.id,
    sport: activity.sport,
    subSport: activity.subSport,
    startTime: activity.startTime.toISOString(),
    endTime: activity.endTime.toISOString(),
    totalDistance: activity.totalDistance,
    totalTimerTime: activity.totalTimerTime,
    totalCalories: activity.totalCalories,
  }

  if (opts.includeMetrics) {
    if (activity.avgHeartRate) properties.avgHeartRate = activity.avgHeartRate
    if (activity.maxHeartRate) properties.maxHeartRate = activity.maxHeartRate
    if (activity.avgSpeed) properties.avgSpeed = activity.avgSpeed
    if (activity.maxSpeed) properties.maxSpeed = activity.maxSpeed
    if (activity.avgCadence) properties.avgCadence = activity.avgCadence
    if (activity.avgPower) properties.avgPower = activity.avgPower
    if (activity.totalAscent) properties.totalAscent = activity.totalAscent
    if (activity.totalDescent) properties.totalDescent = activity.totalDescent
  }

  if (opts.includeTimestamps) {
    properties.timestamps = records.map(r => r.timestamp.toISOString())
  }

  const trackFeature: GeoJsonFeature = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates,
    },
    properties,
  }

  const features: GeoJsonFeature[] = [trackFeature]

  // Add start point
  if (records.length > 0) {
    const start = records[0]
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [start.position!.lng, start.position!.lat],
      },
      properties: {
        type: 'start',
        time: start.timestamp.toISOString(),
      },
    })
  }

  // Add end point
  if (records.length > 1) {
    const end = records[records.length - 1]
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [end.position!.lng, end.position!.lat],
      },
      properties: {
        type: 'end',
        time: end.timestamp.toISOString(),
      },
    })
  }

  // Add lap markers
  for (let i = 0; i < activity.laps.length; i++) {
    const lap = activity.laps[i]
    if (lap.startPosition) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lap.startPosition.lng, lap.startPosition.lat],
        },
        properties: {
          type: 'lap',
          lapNumber: i + 1,
          time: lap.startTime.toISOString(),
          distance: lap.totalDistance,
          duration: lap.totalTimerTime,
        },
      })
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

export function recordsToGeoJsonPoints(records: ActivityRecord[], options: GeoJsonOptions = {}): GeoJsonFeatureCollection {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const features: GeoJsonFeature[] = records
    .filter(r => r.position?.lat != null && r.position?.lng != null)
    .map(r => {
      const coord: number[] = [r.position!.lng, r.position!.lat]
      if (opts.includeElevation && (r.altitude != null || r.position!.altitude != null)) {
        coord.push(r.altitude ?? r.position!.altitude!)
      }

      const properties: Record<string, unknown> = {
        time: r.timestamp.toISOString(),
      }

      if (opts.includeMetrics) {
        if (r.heartRate != null) properties.heartRate = r.heartRate
        if (r.cadence != null) properties.cadence = r.cadence
        if (r.speed != null) properties.speed = r.speed
        if (r.power != null) properties.power = r.power
        if (r.temperature != null) properties.temperature = r.temperature
        if (r.distance != null) properties.distance = r.distance
      }

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: coord,
        },
        properties,
      }
    })

  return {
    type: 'FeatureCollection',
    features,
  }
}

export function activitiesToGeoJson(activities: Activity[], options: GeoJsonOptions = {}): GeoJsonFeatureCollection {
  const allFeatures: GeoJsonFeature[] = []

  for (const activity of activities) {
    const geoJson = activityToGeoJson(activity, options)
    allFeatures.push(...geoJson.features)
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  }
}

// Douglas-Peucker simplification algorithm
function simplifyPath(records: ActivityRecord[], tolerance: number): ActivityRecord[] {
  if (records.length <= 2) return records

  const points = records.map(r => ({
    record: r,
    x: r.position!.lng,
    y: r.position!.lat,
  }))

  const simplified = douglasPeucker(points, tolerance)
  return simplified.map(p => p.record)
}

// eslint-disable-next-line pickier/no-unused-vars
function douglasPeucker(
  points: Array<{
    record: ActivityRecord
    x: number
    y: number
  }>,
  tolerance: number
): Array<{
  record: ActivityRecord
  x: number
  y: number
}> {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIndex = 0

  const first = points[0]
  const last = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last)
    if (dist > maxDist) {
      maxDist = dist
      maxIndex = i
    }
  }

  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance)
    const right = douglasPeucker(points.slice(maxIndex), tolerance)
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}

function perpendicularDistance(
  point: {
    x: number
    y: number
  },
  lineStart: {
    x: number
    y: number
  },
  lineEnd: {
    x: number
    y: number
  }
): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y

  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2)
    )
  }

  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy)
  const nearestX = lineStart.x + t * dx
  const nearestY = lineStart.y + t * dy

  return Math.sqrt(Math.pow(point.x - nearestX, 2) + Math.pow(point.y - nearestY, 2))
}

export async function writeGeoJson(
  geoJson: GeoJsonFeatureCollection,
  filePath: string,
  pretty = true
): Promise<void> {
  const content = pretty ? JSON.stringify(geoJson, null, 2) : JSON.stringify(geoJson)
  await Bun.write(filePath, content)
}
