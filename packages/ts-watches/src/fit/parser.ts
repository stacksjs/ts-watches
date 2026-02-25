import type { FitFileHeader, FitField, FitDefinitionMessage } from '../types'
import {
  FIT_HEADER_SIZE,
  FIT_HEADER_SIZE_LEGACY,
  FIT_SIGNATURE,
  BASE_TYPES,
  FIT_EPOCH,
} from './constants'

export class FitParseError extends Error {
  constructor(message: string, public offset?: number) {
    super(offset !== undefined ? `${message} at offset ${offset}` : message)
    this.name = 'FitParseError'
  }
}

export class FitParser {
  private buffer: Buffer
  private offset = 0
  private definitions: Map<number, FitDefinitionMessage> = new Map()
  private littleEndian = true

  constructor(data: Buffer | ArrayBuffer | Uint8Array) {
    if (data instanceof ArrayBuffer) {
      this.buffer = Buffer.from(data)
    }
    else if (data instanceof Uint8Array) {
      this.buffer = Buffer.from(data)
    }
    else {
      this.buffer = data
    }
  }

  parse(): FitParseResult {
    const header = this.parseHeader()
    const messages: FitMessage[] = []
    const endOffset = header.headerSize + header.dataSize

    while (this.offset < endOffset) {
      try {
        const message = this.parseRecord()
        if (message) {
          messages.push(message)
        }
      }
      catch (err) {
        if (err instanceof FitParseError) {
          // Skip corrupted record and try to continue
          this.offset++
        }
        else {
          throw err
        }
      }
    }

    return { header, messages }
  }

  private parseHeader(): FitFileHeader {
    if (this.buffer.length < FIT_HEADER_SIZE_LEGACY) {
      throw new FitParseError('File too small to contain FIT header')
    }

    const headerSize = this.buffer.readUInt8(0)

    if (headerSize !== FIT_HEADER_SIZE && headerSize !== FIT_HEADER_SIZE_LEGACY) {
      throw new FitParseError(`Invalid header size: ${headerSize}`)
    }

    const protocolVersion = this.buffer.readUInt8(1)
    const profileVersion = this.buffer.readUInt16LE(2)
    const dataSize = this.buffer.readUInt32LE(4)
    const dataType = this.buffer.toString('ascii', 8, 12)

    if (dataType !== FIT_SIGNATURE) {
      throw new FitParseError(`Invalid FIT signature: ${dataType}`)
    }

    let crc: number | undefined
    if (headerSize === FIT_HEADER_SIZE) {
      crc = this.buffer.readUInt16LE(12)
    }

    this.offset = headerSize

    return {
      headerSize,
      protocolVersion,
      profileVersion,
      dataSize,
      dataType,
      crc,
    }
  }

  private parseRecord(): FitMessage | null {
    if (this.offset >= this.buffer.length) {
      return null
    }

    const recordHeader = this.buffer.readUInt8(this.offset)
    this.offset++

    // Check if this is a compressed timestamp header
    const isCompressedTimestamp = (recordHeader & 0x80) === 0x80

    if (isCompressedTimestamp) {
      const localMsgType = (recordHeader >> 5) & 0x03
      const timeOffset = recordHeader & 0x1f
      return this.parseDataMessage(localMsgType, timeOffset)
    }

    // Normal header
    const isDefinition = (recordHeader & 0x40) === 0x40
    const hasDeveloperData = (recordHeader & 0x20) === 0x20
    const localMsgType = recordHeader & 0x0f

    if (isDefinition) {
      this.parseDefinitionMessage(localMsgType, hasDeveloperData)
      return null
    }

    return this.parseDataMessage(localMsgType)
  }

  private parseDefinitionMessage(localMsgType: number, hasDeveloperData: boolean): void {
    const reserved = this.buffer.readUInt8(this.offset)
    this.offset++

    const arch = this.buffer.readUInt8(this.offset)
    this.offset++
    this.littleEndian = arch === 0

    const globalMsgNum = this.readUInt16()
    const numFields = this.buffer.readUInt8(this.offset)
    this.offset++

    const fields: FitField[] = []
    for (let i = 0; i < numFields; i++) {
      const fieldDefNum = this.buffer.readUInt8(this.offset)
      this.offset++
      const size = this.buffer.readUInt8(this.offset)
      this.offset++
      const baseType = this.buffer.readUInt8(this.offset)
      this.offset++

      fields.push({ fieldDefNum, size, baseType })
    }

    // Skip developer fields if present
    if (hasDeveloperData) {
      const numDevFields = this.buffer.readUInt8(this.offset)
      this.offset++
      this.offset += numDevFields * 3 // Each dev field is 3 bytes
    }

    this.definitions.set(localMsgType, {
      reserved,
      arch: this.littleEndian ? 'little' : 'big',
      globalMsgNum,
      numFields,
      fields,
    })
  }

  private parseDataMessage(localMsgType: number, _timeOffset?: number): FitMessage | null {
    const definition = this.definitions.get(localMsgType)
    if (!definition) {
      // Skip unknown message type - estimate size as 1 byte
      return null
    }

    const fields: Record<number, unknown> = {}

    for (const fieldDef of definition.fields) {
      const value = this.readFieldValue(fieldDef)
      if (value !== null && value !== undefined) {
        fields[fieldDef.fieldDefNum] = value
      }
    }

    return {
      globalMsgNum: definition.globalMsgNum,
      fields,
    }
  }

  private readFieldValue(fieldDef: FitField): unknown {
    const { size, baseType } = fieldDef
    const baseTypeNum = baseType & 0x1f

    switch (baseTypeNum) {
      case BASE_TYPES.ENUM:
      case BASE_TYPES.UINT8:
      case BASE_TYPES.UINT8Z: {
        if (size === 1) {
          const val = this.buffer.readUInt8(this.offset)
          this.offset++
          return val === 0xff ? null : val
        }
        // Array of uint8
        const arr: number[] = []
        for (let i = 0; i < size; i++) {
          arr.push(this.buffer.readUInt8(this.offset))
          this.offset++
        }
        return arr
      }

      case BASE_TYPES.SINT8: {
        if (size === 1) {
          const val = this.buffer.readInt8(this.offset)
          this.offset++
          return val === 0x7f ? null : val
        }
        const arr: number[] = []
        for (let i = 0; i < size; i++) {
          arr.push(this.buffer.readInt8(this.offset))
          this.offset++
        }
        return arr
      }

      case BASE_TYPES.UINT16:
      case BASE_TYPES.UINT16Z: {
        if (size === 2) {
          const val = this.readUInt16()
          return val === 0xffff ? null : val
        }
        const arr: number[] = []
        for (let i = 0; i < size / 2; i++) {
          arr.push(this.readUInt16())
        }
        return arr
      }

      case BASE_TYPES.SINT16: {
        if (size === 2) {
          const val = this.readInt16()
          return val === 0x7fff ? null : val
        }
        const arr: number[] = []
        for (let i = 0; i < size / 2; i++) {
          arr.push(this.readInt16())
        }
        return arr
      }

      case BASE_TYPES.UINT32:
      case BASE_TYPES.UINT32Z: {
        if (size === 4) {
          const val = this.readUInt32()
          return val === 0xffffffff ? null : val
        }
        const arr: number[] = []
        for (let i = 0; i < size / 4; i++) {
          arr.push(this.readUInt32())
        }
        return arr
      }

      case BASE_TYPES.SINT32: {
        if (size === 4) {
          const val = this.readInt32()
          return val === 0x7fffffff ? null : val
        }
        const arr: number[] = []
        for (let i = 0; i < size / 4; i++) {
          arr.push(this.readInt32())
        }
        return arr
      }

      case BASE_TYPES.FLOAT32: {
        if (size === 4) {
          const val = this.readFloat32()
          return Number.isNaN(val) ? null : val
        }
        const arr: number[] = []
        for (let i = 0; i < size / 4; i++) {
          arr.push(this.readFloat32())
        }
        return arr
      }

      case BASE_TYPES.FLOAT64: {
        if (size === 8) {
          const val = this.readFloat64()
          return Number.isNaN(val) ? null : val
        }
        const arr: number[] = []
        for (let i = 0; i < size / 8; i++) {
          arr.push(this.readFloat64())
        }
        return arr
      }

      case BASE_TYPES.STRING: {
        const strBytes = this.buffer.slice(this.offset, this.offset + size)
        this.offset += size
        const nullIndex = strBytes.indexOf(0)
        const str = strBytes.toString('utf8', 0, nullIndex >= 0 ? nullIndex : size)
        return str.length > 0 ? str : null
      }

      case BASE_TYPES.UINT64:
      case BASE_TYPES.UINT64Z: {
        if (size === 8) {
          const val = this.readUInt64()
          return val
        }
        this.offset += size
        return null
      }

      case BASE_TYPES.SINT64: {
        if (size === 8) {
          const val = this.readInt64()
          return val
        }
        this.offset += size
        return null
      }

      case BASE_TYPES.BYTE:
      default: {
        const bytes = this.buffer.slice(this.offset, this.offset + size)
        this.offset += size
        return bytes
      }
    }
  }

  private readUInt16(): number {
    const val = this.littleEndian
      ? this.buffer.readUInt16LE(this.offset)
      : this.buffer.readUInt16BE(this.offset)
    this.offset += 2
    return val
  }

  private readInt16(): number {
    const val = this.littleEndian
      ? this.buffer.readInt16LE(this.offset)
      : this.buffer.readInt16BE(this.offset)
    this.offset += 2
    return val
  }

  private readUInt32(): number {
    const val = this.littleEndian
      ? this.buffer.readUInt32LE(this.offset)
      : this.buffer.readUInt32BE(this.offset)
    this.offset += 4
    return val
  }

  private readInt32(): number {
    const val = this.littleEndian
      ? this.buffer.readInt32LE(this.offset)
      : this.buffer.readInt32BE(this.offset)
    this.offset += 4
    return val
  }

  private readFloat32(): number {
    const val = this.littleEndian
      ? this.buffer.readFloatLE(this.offset)
      : this.buffer.readFloatBE(this.offset)
    this.offset += 4
    return val
  }

  private readFloat64(): number {
    const val = this.littleEndian
      ? this.buffer.readDoubleLE(this.offset)
      : this.buffer.readDoubleBE(this.offset)
    this.offset += 8
    return val
  }

  private readUInt64(): bigint {
    const val = this.littleEndian
      ? this.buffer.readBigUInt64LE(this.offset)
      : this.buffer.readBigUInt64BE(this.offset)
    this.offset += 8
    return val
  }

  private readInt64(): bigint {
    const val = this.littleEndian
      ? this.buffer.readBigInt64LE(this.offset)
      : this.buffer.readBigInt64BE(this.offset)
    this.offset += 8
    return val
  }
}

export interface FitMessage {
  globalMsgNum: number
  fields: Record<number, unknown>
}

export interface FitParseResult {
  header: FitFileHeader
  messages: FitMessage[]
}

// Utility functions for converting FIT values
export function fitTimestampToDate(timestamp: number): Date {
  return new Date(FIT_EPOCH + timestamp * 1000)
}

export function semicirclesToDegrees(semicircles: number): number {
  return semicircles * (180 / Math.pow(2, 31))
}

export function degreesToSemicircles(degrees: number): number {
  return degrees * (Math.pow(2, 31) / 180)
}
