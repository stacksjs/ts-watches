import type { Activity, ActivityLap, ActivityRecord } from '../types'

export interface TcxOptions {
  creator?: string
  deviceName?: string
  includeHeartRate?: boolean
  includeCadence?: boolean
  includePower?: boolean
}

const DEFAULT_OPTIONS: TcxOptions = {
  creator: 'ts-watches',
  deviceName: 'ts-watches',
  includeHeartRate: true,
  includeCadence: true,
  includePower: true,
}

export function activityToTcx(activity: Activity, options: TcxOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const laps = activity.laps.length > 0
    ? activity.laps.map((lap, i) => lapToTcx(lap, getRecordsForLap(activity.records, lap), opts)).join('\n')
    : createSingleLap(activity, opts)

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
    <Activity Sport="${mapSportToTcx(activity.sport)}">
      <Id>${activity.startTime.toISOString()}</Id>
${laps}
      <Creator xsi:type="Device_t">
        <Name>${escapeXml(opts.deviceName!)}</Name>
        <UnitId>0</UnitId>
        <ProductID>0</ProductID>
      </Creator>
    </Activity>
  </Activities>
  <Author xsi:type="Application_t">
    <Name>${escapeXml(opts.creator!)}</Name>
    <Build>
      <Version>
        <VersionMajor>1</VersionMajor>
        <VersionMinor>0</VersionMinor>
      </Version>
    </Build>
    <LangID>en</LangID>
    <PartNumber>000-00000-00</PartNumber>
  </Author>
</TrainingCenterDatabase>`
}

function lapToTcx(lap: ActivityLap, records: ActivityRecord[], opts: TcxOptions): string {
  const trackpoints = records
    .map(r => recordToTrackpoint(r, opts))
    .filter(t => t.length > 0)
    .join('\n')

  return `      <Lap StartTime="${lap.startTime.toISOString()}">
        <TotalTimeSeconds>${lap.totalTimerTime.toFixed(1)}</TotalTimeSeconds>
        <DistanceMeters>${lap.totalDistance.toFixed(1)}</DistanceMeters>
        <MaximumSpeed>${lap.maxSpeed ? (lap.maxSpeed).toFixed(2) : '0.00'}</MaximumSpeed>
        <Calories>${lap.totalCalories}</Calories>${lap.avgHeartRate ? `
        <AverageHeartRateBpm>
          <Value>${lap.avgHeartRate}</Value>
        </AverageHeartRateBpm>` : ''}${lap.maxHeartRate ? `
        <MaximumHeartRateBpm>
          <Value>${lap.maxHeartRate}</Value>
        </MaximumHeartRateBpm>` : ''}
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${trackpoints}
        </Track>${buildLapExtensions(lap, opts)}
      </Lap>`
}

function createSingleLap(activity: Activity, opts: TcxOptions): string {
  const trackpoints = activity.records
    .map(r => recordToTrackpoint(r, opts))
    .filter(t => t.length > 0)
    .join('\n')

  return `      <Lap StartTime="${activity.startTime.toISOString()}">
        <TotalTimeSeconds>${activity.totalTimerTime.toFixed(1)}</TotalTimeSeconds>
        <DistanceMeters>${activity.totalDistance.toFixed(1)}</DistanceMeters>
        <MaximumSpeed>${activity.maxSpeed ? (activity.maxSpeed).toFixed(2) : '0.00'}</MaximumSpeed>
        <Calories>${activity.totalCalories}</Calories>${activity.avgHeartRate ? `
        <AverageHeartRateBpm>
          <Value>${activity.avgHeartRate}</Value>
        </AverageHeartRateBpm>` : ''}${activity.maxHeartRate ? `
        <MaximumHeartRateBpm>
          <Value>${activity.maxHeartRate}</Value>
        </MaximumHeartRateBpm>` : ''}
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${trackpoints}
        </Track>${buildActivityExtensions(activity, opts)}
      </Lap>`
}

function recordToTrackpoint(record: ActivityRecord, opts: TcxOptions): string {
  const { position, timestamp, heartRate, cadence, power, altitude, distance } = record

  const positionXml = position
    ? `
          <Position>
            <LatitudeDegrees>${position.lat.toFixed(7)}</LatitudeDegrees>
            <LongitudeDegrees>${position.lng.toFixed(7)}</LongitudeDegrees>
          </Position>`
    : ''

  const ele = altitude ?? position?.altitude
  const altitudeXml = ele != null ? `
          <AltitudeMeters>${ele.toFixed(1)}</AltitudeMeters>` : ''

  const distanceXml = distance != null ? `
          <DistanceMeters>${distance.toFixed(1)}</DistanceMeters>` : ''

  const hrXml = opts.includeHeartRate && heartRate != null ? `
          <HeartRateBpm>
            <Value>${heartRate}</Value>
          </HeartRateBpm>` : ''

  const extensions: string[] = []
  if (opts.includeCadence && cadence != null) {
    extensions.push(`            <ns3:RunCadence>${cadence}</ns3:RunCadence>`)
  }
  if (opts.includePower && power != null) {
    extensions.push(`            <ns3:Watts>${power}</ns3:Watts>`)
  }

  const extensionsXml = extensions.length > 0
    ? `
          <Extensions>
            <ns3:TPX>
${extensions.join('\n')}
            </ns3:TPX>
          </Extensions>`
    : ''

  return `          <Trackpoint>
            <Time>${timestamp.toISOString()}</Time>${positionXml}${altitudeXml}${distanceXml}${hrXml}${extensionsXml}
          </Trackpoint>`
}

function buildLapExtensions(lap: ActivityLap, opts: TcxOptions): string {
  const extensions: string[] = []

  if (lap.avgSpeed != null) {
    extensions.push(`          <ns3:AvgSpeed>${lap.avgSpeed.toFixed(2)}</ns3:AvgSpeed>`)
  }
  if (opts.includeCadence && lap.avgCadence != null) {
    extensions.push(`          <ns3:AvgRunCadence>${lap.avgCadence}</ns3:AvgRunCadence>`)
  }
  if (opts.includeCadence && lap.maxCadence != null) {
    extensions.push(`          <ns3:MaxRunCadence>${lap.maxCadence}</ns3:MaxRunCadence>`)
  }
  if (opts.includePower && lap.avgPower != null) {
    extensions.push(`          <ns3:AvgWatts>${lap.avgPower}</ns3:AvgWatts>`)
  }
  if (opts.includePower && lap.maxPower != null) {
    extensions.push(`          <ns3:MaxWatts>${lap.maxPower}</ns3:MaxWatts>`)
  }

  if (extensions.length === 0) return ''

  return `
        <Extensions>
          <ns3:LX>
${extensions.join('\n')}
          </ns3:LX>
        </Extensions>`
}

function buildActivityExtensions(activity: Activity, opts: TcxOptions): string {
  const extensions: string[] = []

  if (activity.avgSpeed != null) {
    extensions.push(`          <ns3:AvgSpeed>${activity.avgSpeed.toFixed(2)}</ns3:AvgSpeed>`)
  }
  if (opts.includeCadence && activity.avgCadence != null) {
    extensions.push(`          <ns3:AvgRunCadence>${activity.avgCadence}</ns3:AvgRunCadence>`)
  }
  if (opts.includeCadence && activity.maxCadence != null) {
    extensions.push(`          <ns3:MaxRunCadence>${activity.maxCadence}</ns3:MaxRunCadence>`)
  }
  if (opts.includePower && activity.avgPower != null) {
    extensions.push(`          <ns3:AvgWatts>${activity.avgPower}</ns3:AvgWatts>`)
  }
  if (opts.includePower && activity.maxPower != null) {
    extensions.push(`          <ns3:MaxWatts>${activity.maxPower}</ns3:MaxWatts>`)
  }

  if (extensions.length === 0) return ''

  return `
        <Extensions>
          <ns3:LX>
${extensions.join('\n')}
          </ns3:LX>
        </Extensions>`
}

function getRecordsForLap(records: ActivityRecord[], lap: ActivityLap): ActivityRecord[] {
  return records.filter(r =>
    r.timestamp >= lap.startTime && r.timestamp <= lap.endTime
  )
}

function mapSportToTcx(sport: string): string {
  const sportMap: Record<string, string> = {
    running: 'Running',
    cycling: 'Biking',
    swimming: 'Other',
    hiking: 'Other',
    walking: 'Other',
    other: 'Other',
  }
  return sportMap[sport] || 'Other'
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function writeTcx(activity: Activity, filePath: string, options?: TcxOptions): Promise<void> {
  const tcx = activityToTcx(activity, options)
  await Bun.write(filePath, tcx)
}
