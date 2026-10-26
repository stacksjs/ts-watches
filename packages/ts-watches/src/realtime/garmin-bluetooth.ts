import type { GarminTransport } from '@zig-utils/garmin'
import { GARMIN_BLE, GarminBleClient, createGarminCodec } from '@zig-utils/garmin'
export { GARMIN_BLE, GARMIN_SERVICES, GarminBleClient, createGarminCodec, parseTelemetry } from '@zig-utils/garmin'
export type { GarminDirectoryEntry, GarminFile, GarminReading, GarminTransport } from '@zig-utils/garmin'

export interface GarminNearbyDevice { id: string, name: string, rssi?: number }
export interface GarminNativeBluetooth {
  getState(): Promise<{ streaming?: boolean }>
  scan(options: { services: string[], timeoutMs: number }): Promise<GarminNearbyDevice[]>
  stopScan(): Promise<unknown>
  connect(options: { id: string, service: string, write: string, notify: string, stream: boolean }): Promise<{ maxWrite?: number }>
  read(options: { timeoutMs: number }): Promise<number[]>
  write(options: { bytes: number[] }): Promise<unknown>
  disconnect(): Promise<unknown>
}
export async function garminBluetoothAvailable(bluetooth: GarminNativeBluetooth | null | undefined): Promise<boolean> {
  return !!bluetooth?.read && !!bluetooth?.write && (await bluetooth.getState()).streaming === true
}
/** Explicitly selected native device. There is no implicit scan or pairing. */
export async function connectGarminBluetooth(bluetooth: GarminNativeBluetooth, deviceId: string, current: () => boolean = () => true): Promise<GarminBleClient> {
  const check = (): void => { if (!current()) throw new Error('Garmin connection cancelled') }
  check()
  if (!await garminBluetoothAvailable(bluetooth)) throw new Error('Update the app to use direct Garmin Bluetooth')
  let link: { maxWrite?: number } | undefined
  for (const channel of GARMIN_BLE.channels) {
    check()
    try { link = await bluetooth.connect({ id: deviceId, ...channel, stream: true }); break }
    catch (error) { if ((error as { code?: string }).code !== 'UNSUPPORTED_DEVICE') throw error }
  }
  if (!link) throw new Error('No supported Garmin Bluetooth channel found')
  const transport: GarminTransport = {
    maxWrite: Math.min(182, link.maxWrite ?? 20),
    async write(bytes) { check(); await bluetooth.write({ bytes: [...bytes] }); check() },
    async read(timeoutMs) {
      check()
      const bytes = await bluetooth.read({ timeoutMs: Math.min(20000, timeoutMs) })
      check()
      if (!Array.isArray(bytes) || bytes.length > 4096 || bytes.some(b => !Number.isInteger(b) || b < 0 || b > 255)) throw new Error('Invalid Bluetooth notification')
      return Uint8Array.from(bytes)
    },
    async close() { await bluetooth.disconnect() },
  }
  const client = new GarminBleClient(transport, await createGarminCodec())
  try { check(); await client.open(); check(); return client }
  catch (error) { await client.close(); throw error }
}
export function garminFileIdentity(entry: { dataType: number, subType: number, number: number, size: number, timestamp: number }): string {
  return [entry.dataType, entry.subType, entry.number, entry.size, entry.timestamp].join(':')
}
