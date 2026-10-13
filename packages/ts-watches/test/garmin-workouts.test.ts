import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { GarminConnectWorkout } from '../src/cloud/garmin-connect'
import { GarminConnectClient, isGarminNotFound } from '../src/cloud/garmin-connect'

interface Seen {
  url: string
  method: string
  override: string | null
  body: unknown
}

const realFetch = globalThis.fetch
let seen: Seen[] = []
let respond: (request: Seen) => Response = () => Response.json({})

/** A client past `login()`, so the tests never reach Garmin's SSO. */
function signedIn(): GarminConnectClient {
  const client = new GarminConnectClient({ username: 'athlete@example.com', password: 'secret' })
  ;(client as unknown as { isLoggedIn: boolean }).isLoggedIn = true
  return client
}

const WORKOUT: GarminConnectWorkout = {
  workoutName: '6 x 800 m',
  sportType: { sportTypeId: 1, sportTypeKey: 'running' },
  workoutSegments: [{
    segmentOrder: 1,
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutSteps: [{ type: 'ExecutableStepDTO', stepOrder: 1 }],
  }],
}

beforeEach(() => {
  seen = []
  respond = () => Response.json({})
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers = new Headers(init?.headers)
    const request: Seen = {
      url,
      method: String(init?.method || 'GET'),
      override: headers.get('X-Http-Method-Override'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    }
    seen.push(request)
    return respond(request)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('workouts on Garmin Connect', () => {
  it('creates a workout and answers with its id as a string', async () => {
    respond = () => Response.json({ workoutId: 987654, workoutName: '6 x 800 m' })
    const ref = await signedIn().createWorkout(WORKOUT)
    expect(ref).toEqual({ workoutId: '987654' })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.url).toEndWith('/workout-service/workout')
    expect(seen[0]!.body).toEqual(WORKOUT)
  })

  it('refuses an answer without an id rather than losing track of the workout', async () => {
    respond = () => Response.json({ workoutName: 'x' })
    await expect(signedIn().createWorkout(WORKOUT)).rejects.toThrow('did not say which one')
  })

  it('schedules on a day and keeps the scheduling id', async () => {
    respond = () => Response.json({ workoutScheduleId: 555, calendarDate: '2026-10-20' })
    const schedule = await signedIn().scheduleWorkout('987654', '2026-10-20')
    expect(schedule).toEqual({ workoutScheduleId: '555', date: '2026-10-20' })
    expect(seen[0]!.method).toBe('POST')
    expect(seen[0]!.url).toEndWith('/workout-service/schedule/987654')
    expect(seen[0]!.body).toEqual({ date: '2026-10-20' })
  })

  it('refuses a date that is not a day before asking Garmin', async () => {
    await expect(signedIn().scheduleWorkout('1', 'Mon Oct 12 2026')).rejects.toThrow('Not a day')
    expect(seen).toHaveLength(0)
  })

  it('updates in place with the whole workout and its id', async () => {
    await signedIn().updateWorkout('42', WORKOUT)
    expect(seen[0]!.method).toBe('PUT')
    expect(seen[0]!.url).toEndWith('/workout-service/workout/42')
    expect(seen[0]!.body).toEqual({ ...WORKOUT, workoutId: 42 })
  })

  it('deletes and unschedules the way Connect expects, and a 404 counts as done', async () => {
    const client = signedIn()
    await client.deleteWorkout('42')
    await client.unscheduleWorkout('555')
    expect(seen.map(r => [r.method, r.override, r.url.replace(/^.*\/workout-service\//, '')])).toEqual([
      ['POST', 'DELETE', 'workout/42'],
      ['POST', 'DELETE', 'schedule/555'],
    ])
    respond = () => new Response('not found', { status: 404, statusText: 'Not Found' })
    await client.deleteWorkout('42')
    await client.unscheduleWorkout('555')
  })

  it('passes on every other failure', async () => {
    respond = () => new Response('nope', { status: 500, statusText: 'Server Error' })
    await expect(signedIn().deleteWorkout('42')).rejects.toThrow('500')
  })

  it('reads a workout, or null when Connect has none by that id', async () => {
    respond = () => Response.json({ workoutId: 42, workoutName: 'Tempo' })
    expect(await signedIn().getWorkout('42')).toEqual({ workoutId: 42, workoutName: 'Tempo' })
    respond = () => new Response('', { status: 404, statusText: 'Not Found' })
    expect(await signedIn().getWorkout('42')).toBeNull()
  })

  it('needs a signed-in client', async () => {
    await expect(new GarminConnectClient({ username: 'a', password: 'b' }).createWorkout(WORKOUT)).rejects.toThrow('Not logged in')
  })

  it('tells a 404 apart', () => {
    expect(isGarminNotFound(new Error('HTTP Error: 404 Not Found - '))).toBe(true)
    expect(isGarminNotFound(new Error('HTTP Error: 500 Server Error - 404'))).toBe(false)
  })
})
