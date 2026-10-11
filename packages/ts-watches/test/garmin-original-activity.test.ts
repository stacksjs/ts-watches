import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GarminConnect } from 'ts-garmin'
import { GarminConnectClient } from '../src/cloud/garmin-connect'

/** A zip's local file header, then a little payload: enough to compare. */
const ZIP = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 1, 2, 3, 4, 5])

const realFetch = globalThis.fetch
let requests: string[] = []
let respond: (url: string) => Response = () => new Response(ZIP, { headers: { 'content-type': 'application/x-zip-compressed' } })

/** A client past `login()`, so the tests never reach Garmin's SSO. */
function signedIn(): GarminConnectClient {
  const client = new GarminConnectClient({ username: 'athlete@example.com', password: 'secret' })
  ;(client as unknown as { isLoggedIn: boolean }).isLoggedIn = true
  return client
}

let dir: string

beforeEach(async () => {
  requests = []
  respond = () => new Response(ZIP, { headers: { 'content-type': 'application/x-zip-compressed' } })
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requests.push(url)
    return respond(url)
  }) as typeof fetch
  dir = await mkdtemp(join(tmpdir(), 'ts-watches-test-'))
})

afterEach(async () => {
  globalThis.fetch = realFetch
  await rm(dir, { recursive: true, force: true })
})

describe('downloadOriginalActivity', () => {
  it('returns the export original zip in memory, with its name', async () => {
    const file = await signedIn().downloadOriginalActivity(4242)
    expect(file.filename).toBe('4242.zip')
    expect(file.bytes).toBeInstanceOf(Uint8Array)
    expect([...file.bytes]).toEqual([...ZIP])
    expect(requests).toHaveLength(1)
    expect(requests[0]).toEndWith('/download-service/files/activity/4242')
  })

  it('asks for Garmin\'s conversions by format', async () => {
    const client = signedIn()
    expect((await client.downloadOriginalActivity(7, 'gpx')).filename).toBe('7.gpx')
    expect((await client.downloadOriginalActivity(7, 'tcx')).filename).toBe('7.tcx')
    expect((await client.downloadOriginalActivity(7, 'kml')).filename).toBe('7.kml')
    expect(requests.map(url => url.replace(/^.*\/download-service\//, ''))).toEqual([
      'export/gpx/activity/7',
      'export/tcx/activity/7',
      'export/kml/activity/7',
    ])
  })

  /** A download is bytes even when the server labels it JSON. */
  it('hands back the bytes whatever the content type says', async () => {
    const body = new TextEncoder().encode('{"not":"parsed"}')
    respond = () => new Response(body, { headers: { 'content-type': 'application/json' } })
    const file = await signedIn().downloadOriginalActivity(1, 'gpx')
    expect([...file.bytes]).toEqual([...body])
  })

  it('rejects a format Connect cannot export', async () => {
    await expect(signedIn().downloadOriginalActivity(1, 'fit' as never)).rejects.toThrow('Invalid type: fit')
    expect(requests).toHaveLength(0)
  })

  it('surfaces the HTTP status of a failed download', async () => {
    respond = () => new Response('slow down', { status: 429, statusText: 'Too Many Requests' })
    await expect(signedIn().downloadOriginalActivity(1)).rejects.toThrow('429')
  })

  it('needs a signed-in client', async () => {
    await expect(new GarminConnectClient({ username: 'a', password: 'b' }).downloadOriginalActivity(1)).rejects.toThrow('Not logged in')
    expect(requests).toHaveLength(0)
  })
})

describe('downloadActivityFit', () => {
  it('writes the zip as {activityId}.zip and says where', async () => {
    const out = join(dir, 'nested', 'exports')
    const path = await signedIn().downloadActivityFit(4242, out)
    expect(path).toBe(join(out, '4242.zip'))
    expect(await readdir(out)).toEqual(['4242.zip'])
    expect([...new Uint8Array(await Bun.file(path).arrayBuffer())]).toEqual([...ZIP])
  })

  /** A failed download leaves nothing behind, not even the directory. */
  it('writes nothing when the download fails', async () => {
    respond = () => new Response('gone', { status: 404, statusText: 'Not Found' })
    const out = join(dir, 'never-made')
    await expect(signedIn().downloadActivityFit(1, out)).rejects.toThrow('404')
    expect(await readdir(dir)).toEqual([])
  })
})

describe('ts-garmin', () => {
  const garmin = () => new GarminConnect({ username: 'athlete@example.com', password: 'secret' })

  it('getOriginalActivityData returns the bytes and the name it would write', async () => {
    const file = await garmin().getOriginalActivityData({ activityId: 99 })
    expect(file.filename).toBe('99.zip')
    expect([...file.bytes]).toEqual([...ZIP])
  })

  it('downloadOriginalActivityData writes that file and returns its path', async () => {
    const path = await garmin().downloadOriginalActivityData({ activityId: 99 }, dir, 'tcx')
    expect(path).toBe(join(dir, '99.tcx'))
    expect([...new Uint8Array(await Bun.file(path).arrayBuffer())]).toEqual([...ZIP])
  })

  it('needs an activity id', async () => {
    await expect(garmin().getOriginalActivityData({ activityId: 0 })).rejects.toThrow('Missing activityId')
  })
})
