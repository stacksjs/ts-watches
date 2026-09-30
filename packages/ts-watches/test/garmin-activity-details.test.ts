import { describe, expect, it } from 'bun:test'
import { parseActivityDetails } from '../src/cloud/garmin-connect'

const descriptors = [
  { metricsIndex: 0, key: 'directTimestamp' },
  { metricsIndex: 1, key: 'sumDuration' },
  { metricsIndex: 2, key: 'directHeartRate' },
  { metricsIndex: 3, key: 'directPower' },
  { metricsIndex: 4, key: 'directSpeed' },
]

describe('parseActivityDetails', () => {
  it('reads each sample by its descriptor, in timer time', () => {
    const samples = parseActivityDetails({
      metricDescriptors: descriptors,
      activityDetailMetrics: [
        { metrics: [1_700_000_000_000, 0, 120, 150, 3.1] },
        { metrics: [1_700_000_002_000, 2, 125, null, 3.2] },
        { metrics: [1_700_000_100_000, 4, 131, 210, 0] },
      ],
    })
    expect(samples).toEqual([
      { seconds: 0, heartRate: 120, power: 150, speed: 3.1 },
      { seconds: 2, heartRate: 125, power: null, speed: 3.2 },
      // A pause between samples 2 and 3: timer time moves 2 s, not 98.
      { seconds: 4, heartRate: 131, power: 210, speed: 0 },
    ])
  })

  it('falls back to wall time, counting a gap over a minute as a pause', () => {
    const samples = parseActivityDetails({
      metricDescriptors: [{ metricsIndex: 0, key: 'directTimestamp' }, { metricsIndex: 1, key: 'directHeartRate' }],
      activityDetailMetrics: [
        { metrics: [1_700_000_000_000, 110] },
        { metrics: [1_700_000_005_000, 112] },
        { metrics: [1_700_000_905_000, 115] },
      ],
    })
    expect(samples.map(s => s.seconds)).toEqual([0, 5, 65])
  })

  it('treats zeros and gaps in heart rate as no reading, and survives a malformed response', () => {
    const samples = parseActivityDetails({ metricDescriptors: descriptors, activityDetailMetrics: [{ metrics: [1, 0, 0, -5, null] }] })
    expect(samples).toEqual([{ seconds: 0, heartRate: null, power: null, speed: null }])
    expect(parseActivityDetails(null)).toEqual([])
    expect(parseActivityDetails({ metricDescriptors: 'x', activityDetailMetrics: {} })).toEqual([])
  })
})
