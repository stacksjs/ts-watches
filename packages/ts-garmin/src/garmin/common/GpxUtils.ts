import type { CoursePoint, CourseRequest, GeoPoint, GpxActivityType } from '../types'

export function courseRequestTemplate(
  activityType: GpxActivityType,
  courseName: string,
  geoPoints: GeoPoint[],
  coursePoints: CoursePoint[] = [],
): CourseRequest {
  return {
    activityTypePk: activityType,
    hasTurnDetectionDisabled: false,
    geoPoints,
    courseLines: [],
    coursePoints,
    startPoint: geoPoints[0],
    elapsedSeconds: null,
    openStreetMap: false,
    coordinateSystem: 'WGS84',
    rulePK: 2,
    courseName,
    matchedToSegments: false,
    includeLaps: false,
    hasPaceBand: false,
    hasPowerGuide: false,
    favorite: false,
    speedMeterPerSecond: null,
    sourceTypeId: 3,
  }
}
