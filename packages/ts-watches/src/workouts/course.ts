import type { GeoPosition, Activity } from '../types'

export interface CoursePoint {
  position: GeoPosition
  distance: number // meters from start
  name?: string
  type?: CoursePointType
  notes?: string
}

export type CoursePointType =
  | 'generic'
  | 'summit'
  | 'valley'
  | 'water'
  | 'food'
  | 'danger'
  | 'left'
  | 'right'
  | 'straight'
  | 'first_aid'
  | 'fourth_category'
  | 'third_category'
  | 'second_category'
  | 'first_category'
  | 'hors_category'
  | 'sprint'

export interface Course {
  id?: string
  name: string
  description?: string
  sport: 'running' | 'cycling' | 'hiking' | 'walking'
  trackPoints: GeoPosition[]
  coursePoints: CoursePoint[]
  totalDistance: number // meters
  totalAscent: number // meters
  totalDescent: number // meters
  createdAt?: Date
  updatedAt?: Date
}

export class CourseBuilder {
  private course: Course
  private trackPoints: GeoPosition[] = []
  private coursePoints: CoursePoint[] = []
  private totalAscent = 0
  private totalDescent = 0
  private lastAltitude: number | null = null

  constructor(name: string, sport: Course['sport'] = 'running') {
    this.course = {
      name,
      sport,
      trackPoints: [],
      coursePoints: [],
      totalDistance: 0,
      totalAscent: 0,
      totalDescent: 0,
      createdAt: new Date(),
    }
  }

  setDescription(description: string): this {
    this.course.description = description
    return this
  }

  setSport(sport: Course['sport']): this {
    this.course.sport = sport
    return this
  }

  /**
   * Add a track point
   */
  addPoint(lat: number, lng: number, altitude?: number): this {
    const point: GeoPosition = { lat, lng, altitude }
    this.trackPoints.push(point)

    // Track elevation changes
    if (altitude !== undefined && this.lastAltitude !== null) {
      const elevChange = altitude - this.lastAltitude
      if (elevChange > 0) {
        this.totalAscent += elevChange
      }
      else {
        this.totalDescent += Math.abs(elevChange)
      }
    }
    if (altitude !== undefined) {
      this.lastAltitude = altitude
    }

    return this
  }

  /**
   * Add multiple track points
   */
  addPoints(points: Array<{
    lat: number
    lng: number
    altitude?: number
  }>): this {
    for (const point of points) {
      this.addPoint(point.lat, point.lng, point.altitude)
    }
    return this
  }

  /**
   * Add a course point (POI)
   */
  addCoursePoint(
    lat: number,
    lng: number,
    type: CoursePointType,
    name?: string,
    notes?: string
  ): this {
    // Find nearest track point to calculate distance
    const distance = this.calculateDistanceToPoint(lat, lng)

    this.coursePoints.push({
      position: { lat, lng },
      distance,
      type,
      name,
      notes,
    })

    return this
  }

  /**
   * Add a water station
   */
  addWaterStation(lat: number, lng: number, name?: string): this {
    return this.addCoursePoint(lat, lng, 'water', name || 'Water Station')
  }

  /**
   * Add a food station
   */
  addFoodStation(lat: number, lng: number, name?: string): this {
    return this.addCoursePoint(lat, lng, 'food', name || 'Food Station')
  }

  /**
   * Add a turn instruction
   */
  addTurn(lat: number, lng: number, direction: 'left' | 'right' | 'straight', notes?: string): this {
    return this.addCoursePoint(lat, lng, direction, undefined, notes)
  }

  /**
   * Add a climb category marker (cycling)
   */
  addClimbCategory(
    lat: number,
    lng: number,
    category: 1 | 2 | 3 | 4 | 'hors',
    name?: string
  ): this {
    const typeMap: Record<string | number, CoursePointType> = {
      1: 'first_category',
      2: 'second_category',
      3: 'third_category',
      4: 'fourth_category',
      hors: 'hors_category',
    }
    return this.addCoursePoint(lat, lng, typeMap[category], name)
  }

  /**
   * Add a sprint point (cycling)
   */
  addSprint(lat: number, lng: number, name?: string): this {
    return this.addCoursePoint(lat, lng, 'sprint', name || 'Sprint')
  }

  /**
   * Add a summit marker
   */
  addSummit(lat: number, lng: number, name?: string): this {
    return this.addCoursePoint(lat, lng, 'summit', name || 'Summit')
  }

  /**
   * Import track from an activity
   */
  fromActivity(activity: Activity): this {
    for (const record of activity.records) {
      if (record.position) {
        this.addPoint(record.position.lat, record.position.lng, record.position.altitude)
      }
    }
    return this
  }

  /**
   * Import from GeoJSON LineString
   */
  fromGeoJson(geoJson: {
    type: string
    coordinates: number[][]
  }): this {
    if (geoJson.type !== 'LineString') {
      throw new Error('Expected GeoJSON LineString')
    }

    for (const coord of geoJson.coordinates) {
      const [lng, lat, altitude] = coord
      this.addPoint(lat, lng, altitude)
    }

    return this
  }

  /**
   * Reverse the course direction
   */
  reverse(): this {
    this.trackPoints.reverse()

    // Recalculate course point distances
    for (const cp of this.coursePoints) {
      cp.distance = this.course.totalDistance - cp.distance
    }
    this.coursePoints.sort((a, b) => a.distance - b.distance)

    // Swap ascent/descent
    const temp = this.totalAscent
    this.totalAscent = this.totalDescent
    this.totalDescent = temp

    return this
  }

  /**
   * Build the course
   */
  build(): Course {
    this.course.trackPoints = this.trackPoints
    this.course.coursePoints = this.coursePoints.sort((a, b) => a.distance - b.distance)
    this.course.totalDistance = this.calculateTotalDistance()
    this.course.totalAscent = Math.round(this.totalAscent)
    this.course.totalDescent = Math.round(this.totalDescent)
    this.course.updatedAt = new Date()
    return this.course
  }

  private calculateTotalDistance(): number {
    let distance = 0
    for (let i = 1; i < this.trackPoints.length; i++) {
      distance += this.haversineDistance(
        this.trackPoints[i - 1],
        this.trackPoints[i]
      )
    }
    return Math.round(distance)
  }

  private calculateDistanceToPoint(lat: number, lng: number): number {
    if (this.trackPoints.length === 0) return 0

    let minDistance = Infinity
    let distanceAlongCourse = 0
    let resultDistance = 0

    for (let i = 0; i < this.trackPoints.length; i++) {
      const point = this.trackPoints[i]
      const distToPoint = this.haversineDistance({ lat, lng }, point)

      if (distToPoint < minDistance) {
        minDistance = distToPoint
        resultDistance = distanceAlongCourse
      }

      if (i > 0) {
        distanceAlongCourse += this.haversineDistance(this.trackPoints[i - 1], point)
      }
    }

    return Math.round(resultDistance)
  }

  private haversineDistance(p1: GeoPosition, p2: GeoPosition): number {
    const R = 6371000 // Earth radius in meters
    const lat1 = p1.lat * Math.PI / 180
    const lat2 = p2.lat * Math.PI / 180
    const dLat = (p2.lat - p1.lat) * Math.PI / 180
    const dLng = (p2.lng - p1.lng) * Math.PI / 180

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }
}

/**
 * Create a new course builder
 */
export function createCourse(name: string, sport: Course['sport'] = 'running'): CourseBuilder {
  return new CourseBuilder(name, sport)
}

/**
 * Export course to GPX format
 */
export function courseToGpx(course: Course): string {
  const trackpoints = course.trackPoints
    .map(p => {
      const ele = p.altitude !== undefined ? `\n        <ele>${p.altitude.toFixed(1)}</ele>` : ''
      return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">${ele}
      </trkpt>`
    })
    .join('\n')

  const waypoints = course.coursePoints
    .map(cp => {
      const name = cp.name ? `\n    <name>${escapeXml(cp.name)}</name>` : ''
      const desc = cp.notes ? `\n    <desc>${escapeXml(cp.notes)}</desc>` : ''
      const sym = `\n    <sym>${cp.type || 'Flag'}</sym>`
      return `  <wpt lat="${cp.position.lat.toFixed(7)}" lon="${cp.position.lng.toFixed(7)}">${name}${desc}${sym}
  </wpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ts-watches"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(course.name)}</name>${course.description ? `\n    <desc>${escapeXml(course.description)}</desc>` : ''}
  </metadata>
${waypoints}
  <trk>
    <name>${escapeXml(course.name)}</name>
    <trkseg>
${trackpoints}
    </trkseg>
  </trk>
</gpx>`
}

/**
 * Export course to TCX course format
 */
export function courseToTcx(course: Course): string {
  const trackpoints = course.trackPoints
    .map((p, i) => {
      const distance = i > 0
        ? course.trackPoints.slice(0, i).reduce((d, _, j, arr) =>
            j > 0 ? d + haversineDistance(arr[j - 1], arr[j]) : d, 0)
        : 0

      const ele = p.altitude !== undefined
        ? `\n            <AltitudeMeters>${p.altitude.toFixed(1)}</AltitudeMeters>`
        : ''

      return `          <Trackpoint>
            <Position>
              <LatitudeDegrees>${p.lat.toFixed(7)}</LatitudeDegrees>
              <LongitudeDegrees>${p.lng.toFixed(7)}</LongitudeDegrees>
            </Position>${ele}
            <DistanceMeters>${distance.toFixed(1)}</DistanceMeters>
          </Trackpoint>`
    })
    .join('\n')

  const coursePoints = course.coursePoints
    .map(cp => {
      const name = cp.name || cp.type || 'Point'
      return `        <CoursePoint>
          <Name>${escapeXml(name)}</Name>
          <Position>
            <LatitudeDegrees>${cp.position.lat.toFixed(7)}</LatitudeDegrees>
            <LongitudeDegrees>${cp.position.lng.toFixed(7)}</LongitudeDegrees>
          </Position>
          <PointType>${mapCoursePointType(cp.type)}</PointType>
        </CoursePoint>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Courses>
    <Course>
      <Name>${escapeXml(course.name)}</Name>
      <Lap>
        <TotalTimeSeconds>0</TotalTimeSeconds>
        <DistanceMeters>${course.totalDistance.toFixed(1)}</DistanceMeters>
        <BeginPosition>
          <LatitudeDegrees>${course.trackPoints[0]?.lat.toFixed(7) || 0}</LatitudeDegrees>
          <LongitudeDegrees>${course.trackPoints[0]?.lng.toFixed(7) || 0}</LongitudeDegrees>
        </BeginPosition>
        <EndPosition>
          <LatitudeDegrees>${course.trackPoints[course.trackPoints.length - 1]?.lat.toFixed(7) || 0}</LatitudeDegrees>
          <LongitudeDegrees>${course.trackPoints[course.trackPoints.length - 1]?.lng.toFixed(7) || 0}</LongitudeDegrees>
        </EndPosition>
        <Intensity>Active</Intensity>
      </Lap>
      <Track>
${trackpoints}
      </Track>
${coursePoints}
    </Course>
  </Courses>
</TrainingCenterDatabase>`
}

function haversineDistance(p1: GeoPosition, p2: GeoPosition): number {
  const R = 6371000
  const lat1 = p1.lat * Math.PI / 180
  const lat2 = p2.lat * Math.PI / 180
  const dLat = (p2.lat - p1.lat) * Math.PI / 180
  const dLng = (p2.lng - p1.lng) * Math.PI / 180

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function mapCoursePointType(type?: CoursePointType): string {
  const typeMap: Record<string, string> = {
    generic: 'Generic',
    summit: 'Summit',
    valley: 'Valley',
    water: 'Water',
    food: 'Food',
    danger: 'Danger',
    left: 'Left',
    right: 'Right',
    straight: 'Straight',
    first_aid: 'First Aid',
    fourth_category: '4th Category',
    third_category: '3rd Category',
    second_category: '2nd Category',
    first_category: '1st Category',
    hors_category: 'Hors Category',
    sprint: 'Sprint',
  }
  return typeMap[type || 'generic'] || 'Generic'
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
