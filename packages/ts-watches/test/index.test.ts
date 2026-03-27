import { describe, expect, it, beforeAll } from 'bun:test'
import { FitParser, FitDecoder, fitTimestampToDate, semicirclesToDegrees } from '../src/fit'
import { createGarminDriver } from '../src/drivers/garmin'
import { GarminConnectClient } from '../src/cloud/garmin-connect'
import { MESG_NUM, SPORT, SUB_SPORT, FIT_EPOCH } from '../src/fit/constants'
import type { Activity, GarminDevice, SleepData, StressData, HRVData, BodyBattery, WeightData, MonitoringData } from '../src/types'

describe('FIT Parser', () => {
  describe('Utility functions', () => {
    it('should convert FIT timestamp to Date', () => {
      // FIT epoch is Dec 31, 1989 00:00:00 UTC
      const date = fitTimestampToDate(0)
      expect(date.getTime()).toBe(FIT_EPOCH)

      // 1 day after epoch
      const oneDay = fitTimestampToDate(86400)
      expect(oneDay.getTime()).toBe(FIT_EPOCH + 86400 * 1000)
    })

    it('should convert semicircles to degrees', () => {
      // Test known values
      // 0 semicircles = 0 degrees
      expect(semicirclesToDegrees(0)).toBe(0)

      // Max positive semicircle value (2^31 - 1) should be close to 180
      const maxSemicircles = Math.pow(2, 31) - 1
      expect(semicirclesToDegrees(maxSemicircles)).toBeCloseTo(180, 5)

      // Negative value for southern hemisphere
      const negativeSemicircles = -Math.pow(2, 30) // -90 degrees
      expect(semicirclesToDegrees(negativeSemicircles)).toBeCloseTo(-90, 5)
    })
  })

  describe('FIT Constants', () => {
    it('should have correct message numbers', () => {
      expect(MESG_NUM.FILE_ID).toBe(0)
      expect(MESG_NUM.SESSION).toBe(18)
      expect(MESG_NUM.LAP).toBe(19)
      expect(MESG_NUM.RECORD).toBe(20)
      expect(MESG_NUM.ACTIVITY).toBe(34)
      expect(MESG_NUM.MONITORING).toBe(55)
    })

    it('should have correct sport types', () => {
      expect(SPORT.RUNNING).toBe(1)
      expect(SPORT.CYCLING).toBe(2)
      expect(SPORT.SWIMMING).toBe(5)
      expect(SPORT.HIKING).toBe(17)
    })

    it('should have correct sub-sport types', () => {
      expect(SUB_SPORT.TREADMILL).toBe(1)
      expect(SUB_SPORT.TRAIL).toBe(3)
      expect(SUB_SPORT.INDOOR_CYCLING).toBe(6)
      expect(SUB_SPORT.LAP_SWIMMING).toBe(17)
    })
  })

  describe('FIT Header Parsing', () => {
    it('should reject files that are too small', () => {
      const tooSmall = Buffer.alloc(10)
      const parser = new FitParser(tooSmall)

      expect(() => parser.parse()).toThrow('File too small')
    })

    it('should reject files with invalid signature', () => {
      const invalidSig = Buffer.alloc(14)
      invalidSig.writeUInt8(14, 0) // header size
      invalidSig.write('NOPE', 8) // invalid signature

      const parser = new FitParser(invalidSig)
      expect(() => parser.parse()).toThrow('Invalid FIT signature')
    })

    it('should parse a valid minimal FIT header', () => {
      // Create minimal valid FIT header
      const header = Buffer.alloc(14)
      header.writeUInt8(14, 0) // header size
      header.writeUInt8(0x10, 1) // protocol version
      header.writeUInt16LE(0x0810, 2) // profile version
      header.writeUInt32LE(0, 4) // data size (0 bytes of data)
      header.write('.FIT', 8) // signature
      header.writeUInt16LE(0x0000, 12) // CRC

      const parser = new FitParser(header)
      const result = parser.parse()

      expect(result.header.headerSize).toBe(14)
      expect(result.header.dataType).toBe('.FIT')
      expect(result.messages).toHaveLength(0)
    })
  })
})

describe('Garmin Driver', () => {
  let driver: ReturnType<typeof createGarminDriver>

  beforeAll(() => {
    driver = createGarminDriver()
  })

  it('should have correct driver properties', () => {
    expect(driver.name).toBe('Garmin')
    expect(driver.type).toBe('garmin')
  })

  it('should implement WatchDriver interface', () => {
    expect(typeof driver.detectDevices).toBe('function')
    expect(typeof driver.downloadData).toBe('function')
    expect(typeof driver.parseActivityFile).toBe('function')
    expect(typeof driver.parseMonitoringFile).toBe('function')
  })

  it('should return empty array when no devices connected', async () => {
    // This test may find devices if one is connected, but should not throw
    const devices = await driver.detectDevices()
    expect(Array.isArray(devices)).toBe(true)
  })

  it('should handle invalid file path gracefully', async () => {
    await expect(driver.parseActivityFile('/nonexistent/file.fit')).rejects.toThrow()
  })

  it('should reject non-FIT files', async () => {
    await expect(driver.parseActivityFile('/some/file.gpx')).rejects.toThrow('Unsupported file format')
  })
})

describe('Activity Types', () => {
  it('should have correct Activity structure', () => {
    const activity: Activity = {
      id: 'test_123',
      sport: 'running',
      subSport: 'trail',
      startTime: new Date(),
      endTime: new Date(),
      totalElapsedTime: 3600,
      totalTimerTime: 3500,
      totalDistance: 10000,
      totalCalories: 500,
      avgHeartRate: 150,
      maxHeartRate: 180,
      avgSpeed: 2.78,
      maxSpeed: 4.0,
      avgCadence: 85,
      totalAscent: 200,
      totalDescent: 180,
      laps: [],
      records: [],
      source: 'garmin',
    }

    expect(activity.id).toBe('test_123')
    expect(activity.sport).toBe('running')
    expect(activity.totalDistance).toBe(10000)
    expect(activity.source).toBe('garmin')
  })

  it('should have correct GarminDevice structure', () => {
    const device: GarminDevice = {
      name: 'Enduro 3',
      path: '/Volumes/GARMIN',
      type: 'garmin',
      model: 'Enduro 3',
      serial: '123456789',
      unitId: 'UNIT123',
    }

    expect(device.type).toBe('garmin')
    expect(device.name).toBe('Enduro 3')
    expect(device.unitId).toBe('UNIT123')
  })
})

describe('FIT Decoder', () => {
  it('should handle empty parse result', () => {
    const emptyResult = {
      header: {
        headerSize: 14,
        protocolVersion: 16,
        profileVersion: 2080,
        dataSize: 0,
        dataType: '.FIT',
      },
      messages: [],
    }

    const decoder = new FitDecoder(emptyResult)
    expect(decoder.getFileType()).toBe('unknown')
    expect(decoder.getDeviceInfo()).toBeNull()
  })

  it('should return null for non-activity file types', () => {
    const monitoringResult = {
      header: {
        headerSize: 14,
        protocolVersion: 16,
        profileVersion: 2080,
        dataSize: 0,
        dataType: '.FIT',
      },
      messages: [
        {
          globalMsgNum: MESG_NUM.FILE_ID,
          fields: { 0: 15 }, // monitoring_a type
        },
      ],
    }

    const decoder = new FitDecoder(monitoringResult)
    const activity = decoder.decodeActivity()
    expect(activity).toBeNull()
  })
})

// ============================================================================
// GarminConnectClient
// ============================================================================

describe('GarminConnectClient', () => {
  it('should create client without config', () => {
    const client = new GarminConnectClient()
    expect(client).toBeDefined()
  })

  it('should create client with config', () => {
    const client = new GarminConnectClient({
      username: 'test@example.com',
      password: 'test-password',
    })
    expect(client).toBeDefined()
  })

  it('should throw when calling methods without login', () => {
    const client = new GarminConnectClient({
      username: 'test@example.com',
      password: 'test-password',
    })
    expect(() => client.getUserProfile()).toThrow('Not logged in')
  })

  it('should throw when calling getDailySummary without login', () => {
    const client = new GarminConnectClient({
      username: 'test@example.com',
      password: 'test-password',
    })
    expect(() => client.getDailySummary(new Date())).toThrow('Not logged in')
  })

  it('should throw when calling getActivities without login', () => {
    const client = new GarminConnectClient({
      username: 'test@example.com',
      password: 'test-password',
    })
    expect(() => client.getActivities()).toThrow('Not logged in')
  })

  it('should throw when calling health data methods without login', () => {
    const client = new GarminConnectClient({
      username: 'test@example.com',
      password: 'test-password',
    })
    const date = new Date()
    expect(() => client.getHeartRateData(date)).toThrow('Not logged in')
    expect(() => client.getSleepData(date)).toThrow('Not logged in')
    expect(() => client.getStressData(date)).toThrow('Not logged in')
    expect(() => client.getHrvData(date)).toThrow('Not logged in')
    expect(() => client.getBodyBatteryData(date)).toThrow('Not logged in')
    expect(() => client.getWeightData(date)).toThrow('Not logged in')
    expect(() => client.getStepsData(date)).toThrow('Not logged in')
  })
})

// ============================================================================
// Health & Monitoring Types
// ============================================================================

describe('Health & Monitoring Types', () => {
  it('should have correct SleepData structure', () => {
    const sleep: SleepData = {
      date: new Date(),
      startTime: new Date('2025-01-15T22:30:00Z'),
      endTime: new Date('2025-01-16T06:30:00Z'),
      totalSleepTime: 420,
      deepSleepTime: 90,
      lightSleepTime: 210,
      remSleepTime: 100,
      awakeTime: 20,
      sleepScore: 85,
      stages: [
        { stage: 'light', startTime: new Date('2025-01-15T22:30:00Z'), endTime: new Date('2025-01-15T23:00:00Z') },
        { stage: 'deep', startTime: new Date('2025-01-15T23:00:00Z'), endTime: new Date('2025-01-16T00:30:00Z') },
        { stage: 'rem', startTime: new Date('2025-01-16T00:30:00Z'), endTime: new Date('2025-01-16T02:00:00Z') },
      ],
      avgHeartRate: 58,
      avgRespirationRate: 15,
    }

    expect(sleep.totalSleepTime).toBe(420)
    expect(sleep.stages).toHaveLength(3)
    expect(sleep.stages[1].stage).toBe('deep')
  })

  it('should have correct StressData structure', () => {
    const stress: StressData = {
      date: new Date(),
      avgStressLevel: 35,
      maxStressLevel: 78,
      restStressDuration: 120,
      lowStressDuration: 240,
      mediumStressDuration: 60,
      highStressDuration: 15,
      samples: [
        { timestamp: new Date(), stressLevel: 25 },
        { timestamp: new Date(), stressLevel: 45 },
      ],
    }

    expect(stress.avgStressLevel).toBe(35)
    expect(stress.samples).toHaveLength(2)
  })

  it('should have correct HRVData structure', () => {
    const hrv: HRVData = {
      date: new Date(),
      weeklyAverage: 45,
      lastNightAverage: 52,
      status: 'balanced',
      baseline: 48,
      samples: [
        { timestamp: new Date(), hrv: 50 },
        { timestamp: new Date(), hrv: 55 },
      ],
    }

    expect(hrv.status).toBe('balanced')
    expect(hrv.weeklyAverage).toBe(45)
  })

  it('should have correct BodyBattery structure', () => {
    const bb: BodyBattery = {
      date: new Date(),
      startLevel: 85,
      endLevel: 25,
      chargedValue: 15,
      drainedValue: 75,
      samples: [
        { timestamp: new Date(), level: 85 },
        { timestamp: new Date(), level: 50 },
        { timestamp: new Date(), level: 25 },
      ],
    }

    expect(bb.startLevel).toBe(85)
    expect(bb.endLevel).toBe(25)
    expect(bb.samples).toHaveLength(3)
  })

  it('should have correct WeightData structure', () => {
    const weight: WeightData = {
      date: new Date(),
      weight: 75000,
      bmi: 23.5,
      bodyFatPercentage: 18.2,
      muscleMass: 35000,
      boneMass: 3200,
      visceralFat: 8,
    }

    expect(weight.weight).toBe(75000)
    expect(weight.bmi).toBe(23.5)
    expect(weight.bodyFatPercentage).toBe(18.2)
  })

  it('should have correct MonitoringData aggregate structure', () => {
    const monitoring: MonitoringData = {
      heartRate: {
        date: new Date(),
        restingHeartRate: 55,
        samples: [],
      },
      sleep: {
        date: new Date(),
        startTime: new Date(),
        endTime: new Date(),
        totalSleepTime: 420,
        deepSleepTime: 90,
        lightSleepTime: 210,
        remSleepTime: 100,
        awakeTime: 20,
        stages: [],
      },
      stress: {
        date: new Date(),
        avgStressLevel: 30,
        maxStressLevel: 65,
        restStressDuration: 200,
        lowStressDuration: 300,
        mediumStressDuration: 50,
        highStressDuration: 10,
        samples: [],
      },
      hrv: {
        date: new Date(),
        weeklyAverage: 48,
        samples: [],
      },
    }

    expect(monitoring.heartRate?.restingHeartRate).toBe(55)
    expect(monitoring.sleep?.totalSleepTime).toBe(420)
    expect(monitoring.stress?.avgStressLevel).toBe(30)
    expect(monitoring.hrv?.weeklyAverage).toBe(48)
  })
})
