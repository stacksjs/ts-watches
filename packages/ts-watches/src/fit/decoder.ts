import type {
  Activity,
  ActivityLap,
  ActivityRecord,
  MonitoringData,
  DailyHeartRate,
  SleepData,
  SleepStage,
  StressData,
  SpO2Data,
  RespirationData,
  HRVData,
  SportType,
  SubSportType,
  GeoPosition,
} from '../types'
import type { FitMessage, FitParseResult } from './parser'
import { fitTimestampToDate, semicirclesToDegrees } from './parser'
import {
  MESG_NUM,
  FIELD_DEF,
  SPORT,
  SUB_SPORT,
  SLEEP_LEVEL,
} from './constants'

export class FitDecoder {
  private messages: FitMessage[]
  private fileType: string = 'unknown'
  private deviceInfo: DeviceInfo | null = null

  constructor(parseResult: FitParseResult) {
    this.messages = parseResult.messages
    this.extractFileInfo()
  }

  private extractFileInfo(): void {
    const fileIdMsg = this.messages.find(m => m.globalMsgNum === MESG_NUM.FILE_ID)
    if (fileIdMsg) {
      const typeField = fileIdMsg.fields[FIELD_DEF.FILE_ID.TYPE]
      this.fileType = this.getFileType(typeField as number)
    }

    const deviceInfoMsg = this.messages.find(m => m.globalMsgNum === MESG_NUM.DEVICE_INFO)
    if (deviceInfoMsg) {
      this.deviceInfo = {
        manufacturer: deviceInfoMsg.fields[FIELD_DEF.DEVICE_INFO.MANUFACTURER] as number,
        product: deviceInfoMsg.fields[FIELD_DEF.DEVICE_INFO.PRODUCT] as number,
        serialNumber: deviceInfoMsg.fields[FIELD_DEF.DEVICE_INFO.SERIAL_NUMBER] as number,
        softwareVersion: deviceInfoMsg.fields[FIELD_DEF.DEVICE_INFO.SOFTWARE_VERSION] as number,
        productName: deviceInfoMsg.fields[FIELD_DEF.DEVICE_INFO.PRODUCT_NAME] as string,
      }
    }
  }

  private getFileType(type: number): string {
    const FILE_TYPES: Record<number, string> = {
      1: 'device',
      2: 'settings',
      3: 'sport',
      4: 'activity',
      5: 'workout',
      6: 'course',
      7: 'schedules',
      9: 'weight',
      10: 'totals',
      11: 'goals',
      14: 'blood_pressure',
      15: 'monitoring_a',
      20: 'activity_summary',
      28: 'monitoring_daily',
      32: 'monitoring_b',
      34: 'segment',
      35: 'segment_list',
      40: 'exd_configuration',
    }
    return FILE_TYPES[type] || 'unknown'
  }

  getFileType(): string {
    return this.fileType
  }

  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo
  }

  decodeActivity(): Activity | null {
    if (!['activity', 'activity_summary'].includes(this.fileType)) {
      return null
    }

    const sessionMsgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.SESSION)
    const lapMsgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.LAP)
    const recordMsgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.RECORD)
    const activityMsg = this.messages.find(m => m.globalMsgNum === MESG_NUM.ACTIVITY)

    if (sessionMsgs.length === 0) {
      return null
    }

    const session = sessionMsgs[0]
    const f = session.fields

    const startTimeRaw = f[FIELD_DEF.SESSION.START_TIME] as number
    const timestampRaw = f[FIELD_DEF.SESSION.TIMESTAMP] as number

    const activity: Activity = {
      id: this.generateActivityId(startTimeRaw),
      sport: this.mapSport(f[FIELD_DEF.SESSION.SPORT] as number),
      subSport: this.mapSubSport(f[FIELD_DEF.SESSION.SUB_SPORT] as number),
      startTime: fitTimestampToDate(startTimeRaw),
      endTime: fitTimestampToDate(timestampRaw),
      totalElapsedTime: (f[FIELD_DEF.SESSION.TOTAL_ELAPSED_TIME] as number) / 1000,
      totalTimerTime: (f[FIELD_DEF.SESSION.TOTAL_TIMER_TIME] as number) / 1000,
      totalDistance: (f[FIELD_DEF.SESSION.TOTAL_DISTANCE] as number) / 100,
      totalCalories: f[FIELD_DEF.SESSION.TOTAL_CALORIES] as number,
      avgHeartRate: f[FIELD_DEF.SESSION.AVG_HEART_RATE] as number,
      maxHeartRate: f[FIELD_DEF.SESSION.MAX_HEART_RATE] as number,
      avgSpeed: f[FIELD_DEF.SESSION.AVG_SPEED] != null
        ? (f[FIELD_DEF.SESSION.AVG_SPEED] as number) / 1000
        : undefined,
      maxSpeed: f[FIELD_DEF.SESSION.MAX_SPEED] != null
        ? (f[FIELD_DEF.SESSION.MAX_SPEED] as number) / 1000
        : undefined,
      avgCadence: f[FIELD_DEF.SESSION.AVG_CADENCE] as number,
      maxCadence: f[FIELD_DEF.SESSION.MAX_CADENCE] as number,
      avgPower: f[FIELD_DEF.SESSION.AVG_POWER] as number,
      maxPower: f[FIELD_DEF.SESSION.MAX_POWER] as number,
      normalizedPower: f[FIELD_DEF.SESSION.NORMALIZED_POWER] as number,
      totalAscent: f[FIELD_DEF.SESSION.TOTAL_ASCENT] as number,
      totalDescent: f[FIELD_DEF.SESSION.TOTAL_DESCENT] as number,
      trainingStressScore: f[FIELD_DEF.SESSION.TRAINING_STRESS_SCORE] != null
        ? (f[FIELD_DEF.SESSION.TRAINING_STRESS_SCORE] as number) / 10
        : undefined,
      intensityFactor: f[FIELD_DEF.SESSION.INTENSITY_FACTOR] != null
        ? (f[FIELD_DEF.SESSION.INTENSITY_FACTOR] as number) / 1000
        : undefined,
      laps: lapMsgs.map(lap => this.decodeLap(lap)),
      records: recordMsgs.map(rec => this.decodeRecord(rec)),
      source: 'garmin',
    }

    // Clean up undefined values
    return this.cleanUndefined(activity) as Activity
  }

  private decodeLap(lapMsg: FitMessage): ActivityLap {
    const f = lapMsg.fields

    const startTimeRaw = f[FIELD_DEF.LAP.START_TIME] as number
    const timestampRaw = f[FIELD_DEF.LAP.TIMESTAMP] as number

    const startLat = f[FIELD_DEF.LAP.START_POSITION_LAT] as number
    const startLng = f[FIELD_DEF.LAP.START_POSITION_LONG] as number
    const endLat = f[FIELD_DEF.LAP.END_POSITION_LAT] as number
    const endLng = f[FIELD_DEF.LAP.END_POSITION_LONG] as number

    const lap: ActivityLap = {
      startTime: fitTimestampToDate(startTimeRaw),
      endTime: fitTimestampToDate(timestampRaw),
      totalElapsedTime: (f[FIELD_DEF.LAP.TOTAL_ELAPSED_TIME] as number) / 1000,
      totalTimerTime: (f[FIELD_DEF.LAP.TOTAL_TIMER_TIME] as number) / 1000,
      totalDistance: (f[FIELD_DEF.LAP.TOTAL_DISTANCE] as number) / 100,
      totalCalories: f[FIELD_DEF.LAP.TOTAL_CALORIES] as number,
      avgHeartRate: f[FIELD_DEF.LAP.AVG_HEART_RATE] as number,
      maxHeartRate: f[FIELD_DEF.LAP.MAX_HEART_RATE] as number,
      avgSpeed: f[FIELD_DEF.LAP.AVG_SPEED] != null
        ? (f[FIELD_DEF.LAP.AVG_SPEED] as number) / 1000
        : undefined,
      maxSpeed: f[FIELD_DEF.LAP.MAX_SPEED] != null
        ? (f[FIELD_DEF.LAP.MAX_SPEED] as number) / 1000
        : undefined,
      avgCadence: f[FIELD_DEF.LAP.AVG_CADENCE] as number,
      maxCadence: f[FIELD_DEF.LAP.MAX_CADENCE] as number,
      avgPower: f[FIELD_DEF.LAP.AVG_POWER] as number,
      maxPower: f[FIELD_DEF.LAP.MAX_POWER] as number,
      totalAscent: f[FIELD_DEF.LAP.TOTAL_ASCENT] as number,
      totalDescent: f[FIELD_DEF.LAP.TOTAL_DESCENT] as number,
      startPosition: startLat != null && startLng != null ? {
        lat: semicirclesToDegrees(startLat),
        lng: semicirclesToDegrees(startLng),
      } : undefined,
      endPosition: endLat != null && endLng != null ? {
        lat: semicirclesToDegrees(endLat),
        lng: semicirclesToDegrees(endLng),
      } : undefined,
    }

    return this.cleanUndefined(lap) as ActivityLap
  }

  private decodeRecord(recordMsg: FitMessage): ActivityRecord {
    const f = recordMsg.fields

    const timestampRaw = f[FIELD_DEF.RECORD.TIMESTAMP] as number
    const lat = f[FIELD_DEF.RECORD.POSITION_LAT] as number
    const lng = f[FIELD_DEF.RECORD.POSITION_LONG] as number

    // Enhanced altitude (higher precision) or regular altitude
    let altitude = f[FIELD_DEF.RECORD.ENHANCED_ALTITUDE] as number
    if (altitude == null) {
      altitude = f[FIELD_DEF.RECORD.ALTITUDE] as number
      if (altitude != null) {
        altitude = (altitude / 5) - 500 // Scale and offset
      }
    } else {
      altitude = altitude / 5 - 500
    }

    // Enhanced speed or regular speed
    let speed = f[FIELD_DEF.RECORD.ENHANCED_SPEED] as number
    if (speed == null) {
      speed = f[FIELD_DEF.RECORD.SPEED] as number
      if (speed != null) {
        speed = speed / 1000
      }
    } else {
      speed = speed / 1000
    }

    const record: ActivityRecord = {
      timestamp: fitTimestampToDate(timestampRaw),
      position: lat != null && lng != null ? {
        lat: semicirclesToDegrees(lat),
        lng: semicirclesToDegrees(lng),
        altitude,
      } : undefined,
      heartRate: f[FIELD_DEF.RECORD.HEART_RATE] as number,
      cadence: f[FIELD_DEF.RECORD.CADENCE] as number,
      speed,
      power: f[FIELD_DEF.RECORD.POWER] as number,
      altitude,
      distance: f[FIELD_DEF.RECORD.DISTANCE] != null
        ? (f[FIELD_DEF.RECORD.DISTANCE] as number) / 100
        : undefined,
      temperature: f[FIELD_DEF.RECORD.TEMPERATURE] as number,
      grade: f[FIELD_DEF.RECORD.GRADE] != null
        ? (f[FIELD_DEF.RECORD.GRADE] as number) / 100
        : undefined,
      calories: f[FIELD_DEF.RECORD.CALORIES] as number,
    }

    return this.cleanUndefined(record) as ActivityRecord
  }

  decodeMonitoring(): MonitoringData {
    const data: MonitoringData = {}

    // Heart rate data
    const hrMsgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.MONITORING)
    if (hrMsgs.length > 0) {
      const samples: Array<{ timestamp: Date; heartRate: number }> = []
      let minHr = Infinity
      let maxHr = 0
      let totalHr = 0
      let hrCount = 0

      for (const msg of hrMsgs) {
        const hr = msg.fields[FIELD_DEF.MONITORING.HEART_RATE] as number
        const ts = msg.fields[FIELD_DEF.MONITORING.TIMESTAMP] as number

        if (hr != null && ts != null) {
          samples.push({ timestamp: fitTimestampToDate(ts), heartRate: hr })
          minHr = Math.min(minHr, hr)
          maxHr = Math.max(maxHr, hr)
          totalHr += hr
          hrCount++
        }
      }

      if (samples.length > 0) {
        data.heartRate = {
          date: samples[0].timestamp,
          minHeartRate: minHr,
          maxHeartRate: maxHr,
          avgHeartRate: Math.round(totalHr / hrCount),
          samples,
        }
      }
    }

    // Sleep data
    const sleepMsgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.SLEEP_LEVEL)
    if (sleepMsgs.length > 0) {
      const stages: SleepStage[] = []
      let currentStage: SleepStage | null = null

      for (const msg of sleepMsgs) {
        const level = msg.fields[FIELD_DEF.SLEEP_LEVEL.SLEEP_LEVEL] as number
        const ts = msg.fields[FIELD_DEF.SLEEP_LEVEL.TIMESTAMP] as number

        if (level != null && ts != null) {
          const stage = this.mapSleepLevel(level)
          const timestamp = fitTimestampToDate(ts)

          if (currentStage && currentStage.stage !== stage) {
            currentStage.endTime = timestamp
            stages.push(currentStage)
            currentStage = { stage, startTime: timestamp, endTime: timestamp }
          } else if (!currentStage) {
            currentStage = { stage, startTime: timestamp, endTime: timestamp }
          }
        }
      }

      if (currentStage) {
        stages.push(currentStage)
      }

      if (stages.length > 0) {
        const sleepStart = stages[0].startTime
        const sleepEnd = stages[stages.length - 1].endTime

        let deepTime = 0
        let lightTime = 0
        let remTime = 0
        let awakeTime = 0

        for (const stage of stages) {
          const duration = (stage.endTime.getTime() - stage.startTime.getTime()) / 60000
          switch (stage.stage) {
            case 'deep': deepTime += duration; break
            case 'light': lightTime += duration; break
            case 'rem': remTime += duration; break
            case 'awake': awakeTime += duration; break
          }
        }

        data.sleep = {
          date: sleepStart,
          startTime: sleepStart,
          endTime: sleepEnd,
          totalSleepTime: deepTime + lightTime + remTime,
          deepSleepTime: deepTime,
          lightSleepTime: lightTime,
          remSleepTime: remTime,
          awakeTime,
          stages,
        }
      }
    }

    // Stress data
    const stressMsgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.STRESS_LEVEL)
    if (stressMsgs.length > 0) {
      const samples: Array<{ timestamp: Date; stressLevel: number }> = []
      let totalStress = 0
      let maxStress = 0

      for (const msg of stressMsgs) {
        const level = msg.fields[FIELD_DEF.STRESS_LEVEL.STRESS_LEVEL_VALUE] as number
        const time = msg.fields[FIELD_DEF.STRESS_LEVEL.STRESS_LEVEL_TIME] as number

        if (level != null && level >= 0 && level <= 100 && time != null) {
          samples.push({ timestamp: fitTimestampToDate(time), stressLevel: level })
          totalStress += level
          maxStress = Math.max(maxStress, level)
        }
      }

      if (samples.length > 0) {
        data.stress = {
          date: samples[0].timestamp,
          avgStressLevel: Math.round(totalStress / samples.length),
          maxStressLevel: maxStress,
          restStressDuration: 0,
          lowStressDuration: 0,
          mediumStressDuration: 0,
          highStressDuration: 0,
          samples,
        }
      }
    }

    // SpO2 data
    const spo2Msgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.SPO2_DATA)
    if (spo2Msgs.length > 0) {
      const samples: Array<{ timestamp: Date; spO2: number }> = []
      let minSpO2 = 100
      let maxSpO2 = 0
      let totalSpO2 = 0

      for (const msg of spo2Msgs) {
        const spo2 = msg.fields[FIELD_DEF.SPO2_DATA.READING_SPO2] as number
        const ts = msg.fields[FIELD_DEF.SPO2_DATA.TIMESTAMP] as number

        if (spo2 != null && ts != null && spo2 > 0 && spo2 <= 100) {
          samples.push({ timestamp: fitTimestampToDate(ts), spO2: spo2 })
          minSpO2 = Math.min(minSpO2, spo2)
          maxSpO2 = Math.max(maxSpO2, spo2)
          totalSpO2 += spo2
        }
      }

      if (samples.length > 0) {
        data.spO2 = {
          date: samples[0].timestamp,
          avgSpO2: Math.round(totalSpO2 / samples.length),
          minSpO2,
          maxSpO2,
          samples,
        }
      }
    }

    // Respiration data
    const respMsgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.RESPIRATION_RATE)
    if (respMsgs.length > 0) {
      const samples: Array<{ timestamp: Date; respirationRate: number }> = []
      let minRate = Infinity
      let maxRate = 0
      let totalRate = 0

      for (const msg of respMsgs) {
        const rate = msg.fields[FIELD_DEF.RESPIRATION_RATE.RESPIRATION_RATE] as number
        const ts = msg.fields[FIELD_DEF.RESPIRATION_RATE.TIMESTAMP] as number

        if (rate != null && ts != null && rate > 0) {
          // Rate is in breaths per minute * 100
          const rateNormalized = rate / 100
          samples.push({ timestamp: fitTimestampToDate(ts), respirationRate: rateNormalized })
          minRate = Math.min(minRate, rateNormalized)
          maxRate = Math.max(maxRate, rateNormalized)
          totalRate += rateNormalized
        }
      }

      if (samples.length > 0) {
        data.respiration = {
          date: samples[0].timestamp,
          avgRespirationRate: totalRate / samples.length,
          minRespirationRate: minRate,
          maxRespirationRate: maxRate,
          samples,
        }
      }
    }

    // HRV data
    const hrvMsgs = this.messages.filter(m => m.globalMsgNum === MESG_NUM.HRV)
    if (hrvMsgs.length > 0) {
      const samples: Array<{ timestamp: Date; hrv: number }> = []

      for (const msg of hrvMsgs) {
        const time = msg.fields[FIELD_DEF.HRV.TIME] as number | number[]

        if (Array.isArray(time)) {
          for (const t of time) {
            if (t != null && t !== 0xffff) {
              // Time is in 1/1024 seconds
              samples.push({
                timestamp: new Date(),
                hrv: t / 1024 * 1000, // Convert to milliseconds
              })
            }
          }
        } else if (time != null && time !== 0xffff) {
          samples.push({
            timestamp: new Date(),
            hrv: time / 1024 * 1000,
          })
        }
      }

      if (samples.length > 0) {
        data.hrv = {
          date: new Date(),
          samples,
        }
      }
    }

    return data
  }

  private mapSport(sportNum: number): SportType {
    const sportMap: Record<number, SportType> = {
      [SPORT.RUNNING]: 'running',
      [SPORT.CYCLING]: 'cycling',
      [SPORT.SWIMMING]: 'swimming',
      [SPORT.HIKING]: 'hiking',
      [SPORT.WALKING]: 'walking',
      [SPORT.TRAINING]: 'strength_training',
      [SPORT.FITNESS_EQUIPMENT]: 'cardio',
      [SPORT.YOGA]: 'yoga',
      [SPORT.GENERIC]: 'generic',
    }
    return sportMap[sportNum] || 'other'
  }

  private mapSubSport(subSportNum: number): SubSportType | undefined {
    const subSportMap: Record<number, SubSportType> = {
      [SUB_SPORT.GENERIC]: 'generic',
      [SUB_SPORT.TREADMILL]: 'treadmill',
      [SUB_SPORT.STREET]: 'street',
      [SUB_SPORT.TRAIL]: 'trail',
      [SUB_SPORT.TRACK]: 'track',
      [SUB_SPORT.SPIN]: 'spin',
      [SUB_SPORT.INDOOR_CYCLING]: 'indoor_cycling',
      [SUB_SPORT.ROAD]: 'road',
      [SUB_SPORT.MOUNTAIN]: 'mountain',
      [SUB_SPORT.GRAVEL_CYCLING]: 'gravel',
      [SUB_SPORT.LAP_SWIMMING]: 'lap_swimming',
      [SUB_SPORT.OPEN_WATER]: 'open_water',
    }
    return subSportMap[subSportNum]
  }

  private mapSleepLevel(level: number): SleepStage['stage'] {
    const levelMap: Record<number, SleepStage['stage']> = {
      [SLEEP_LEVEL.AWAKE]: 'awake',
      [SLEEP_LEVEL.LIGHT]: 'light',
      [SLEEP_LEVEL.DEEP]: 'deep',
      [SLEEP_LEVEL.REM]: 'rem',
    }
    return levelMap[level] || 'light'
  }

  private generateActivityId(timestamp: number): string {
    return `garmin_${timestamp}`
  }

  private cleanUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const result: Partial<T> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        result[key as keyof T] = value as T[keyof T]
      }
    }
    return result
  }
}

interface DeviceInfo {
  manufacturer?: number
  product?: number
  serialNumber?: number
  softwareVersion?: number
  productName?: string
}
