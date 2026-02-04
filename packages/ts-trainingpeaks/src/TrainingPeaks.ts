/**
 * TrainingPeaks Client
 * Browser-based authentication with API access
 */

import { Browser } from './browser'
import { HttpClient } from './http'
import type {
  TPCredentials,
  TPAthlete,
  TPCoachAthlete,
  TPAthleteGroup,
  TPWorkout,
  TPMetrics,
  TPCalendarDay,
  TPPerformanceChart,
  TPUploadResult,
  TPSearchParams,
  TPLibraryWorkout,
  TPCookie,
} from './types'

const TP_HOME_URL = 'https://home.trainingpeaks.com'
const TP_APP_URL = 'https://app.trainingpeaks.com'
const TP_API_URL = 'https://tpapi.trainingpeaks.com'
const TP_PEAKSWARE_API = 'https://api.peakswaresb.com'

export interface TrainingPeaksConfig {
  username: string
  password: string
  cookiePath?: string
  headless?: boolean
  timeout?: number
}

export class TrainingPeaks {
  private credentials: TPCredentials
  private client: HttpClient
  private cookiePath?: string
  private headless: boolean
  private timeout: number
  private authenticated = false
  private currentUser: TPAthlete | null = null
  private isCoach = false

  constructor(config: TrainingPeaksConfig) {
    this.credentials = {
      username: config.username,
      password: config.password,
    }
    this.cookiePath = config.cookiePath
    this.headless = config.headless ?? false
    this.timeout = config.timeout ?? 60000
    this.client = new HttpClient({
      baseUrl: TP_APP_URL,
      timeout: this.timeout,
    })
  }

  /**
   * Login using browser automation (handles reCAPTCHA)
   */
  async login(): Promise<TrainingPeaks> {
    // Try to load existing cookies first
    if (this.cookiePath) {
      try {
        await this.client.loadCookies(this.cookiePath)
        // Verify cookies are valid
        if (await this.verifySession()) {
          this.authenticated = true
          return this
        }
      } catch {
        // Cookies invalid or expired, need to login
      }
    }

    const browser = new Browser({
      headless: this.headless,
      timeout: this.timeout,
      incognito: true, // Use isolated profile to avoid session conflicts
    })

    try {
      await browser.launch()

      // Clear any existing session data
      console.log('Clearing browser storage...')
      try {
        await browser.clearAllStorage()
      } catch {
        // Ignore if storage clearing fails
      }

      // Navigate to login page
      console.log('Navigating to login page...')
      await browser.goto(`${TP_HOME_URL}/login`)
      await new Promise(r => setTimeout(r, 3000))

      // Try to dismiss cookie banner if present
      console.log('Checking for cookie banner...')
      try {
        await browser.evaluate(`
          // Common cookie consent selectors
          const selectors = [
            '#onetrust-accept-btn-handler',
            '.onetrust-close-btn-handler',
            '[aria-label="Accept cookies"]',
            '[data-testid="cookie-accept"]',
            '.cookie-accept',
            '.accept-cookies',
            'button[contains(text(), "Accept")]',
            'button[contains(text(), "Got it")]',
          ];
          for (const sel of selectors) {
            const btn = document.querySelector(sel);
            if (btn) { btn.click(); break; }
          }
        `)
        await new Promise(r => setTimeout(r, 1000))
      } catch {
        // No cookie banner, continue
      }

      // Check if already logged in (redirected to app)
      const currentUrl = await browser.evaluate<string>('window.location.href')
      if (currentUrl.includes('app.trainingpeaks.com') && !currentUrl.includes('login')) {
        console.log('Already logged in!')
      } else {
        // Fill in credentials using specific selectors
        console.log('Entering username...')
        await browser.type('input[name="Username"]', this.credentials.username)
        await new Promise(r => setTimeout(r, 300))

        console.log('Entering password...')
        await browser.type('input[name="Password"]', this.credentials.password)
        await new Promise(r => setTimeout(r, 500))

        // Wait a moment for reCAPTCHA v3 to initialize (it runs invisibly)
        console.log('Waiting for reCAPTCHA to initialize...')
        await new Promise(r => setTimeout(r, 2000))

        // Click login button using JavaScript click
        console.log('Submitting login form...')
        await browser.jsClick('button[type="submit"]')

        // If that didn't work, try form submit
        await new Promise(r => setTimeout(r, 1000))
        const urlAfterClick = await browser.evaluate<string>('window.location.href')
        if (urlAfterClick.includes('login')) {
          console.log('Button click may not have worked, trying form submit...')
          await browser.submitForm('form')
        }

        // Wait for redirect to app or dashboard
        console.log('Waiting for login to complete...')
        await browser.waitForUrl(/app\.trainingpeaks\.com(?!.*login)|home\.trainingpeaks\.com\/(athlete|coach|calendar|dashboard)/, this.timeout)
      }

      // Check current URL to determine account type
      const finalUrl = await browser.evaluate<string>('window.location.href')
      this.isCoach = finalUrl.includes('/coach') || finalUrl.includes('coach.')

      // Extract cookies
      const cdpCookies = await browser.getCookies([
        'https://trainingpeaks.com',
        'https://home.trainingpeaks.com',
        'https://app.trainingpeaks.com',
        'https://tpapi.trainingpeaks.com',
      ])

      // Convert CDP cookies to our format
      const cookies: TPCookie[] = cdpCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires > 0 ? new Date(c.expires * 1000) : undefined,
        secure: c.secure,
        httpOnly: c.httpOnly,
      }))

      this.client.setCookies(cookies)
      this.authenticated = true

      // Save cookies if path specified
      if (this.cookiePath) {
        await this.client.saveCookies(this.cookiePath)
      }

      console.log('Login successful!')

    } finally {
      await browser.close()
    }

    return this
  }

  /**
   * Verify session is still valid
   */
  private async verifySession(): Promise<boolean> {
    try {
      const tokenResponse = await this.client.get<{ success: boolean, token?: { access_token: string } }>(`${TP_API_URL}/users/v3/token`)
      return tokenResponse.success === true
    } catch {
      return false
    }
  }

  /**
   * Get current logged-in user
   */
  async getCurrentUser(): Promise<TPAthlete> {
    if (this.currentUser) return this.currentUser

    // Get full user data - response is nested in "user" object
    const response = await this.client.get<{ user: { userId: number, settings?: unknown } }>(`${TP_API_URL}/users/v3/user`)

    // Map to our athlete type
    this.currentUser = {
      Id: response.user.userId,
      UserId: response.user.userId,
    } as TPAthlete

    return this.currentUser
  }

  /**
   * Check if logged in as coach
   */
  isCoachAccount(): boolean {
    return this.isCoach
  }

  // =====================
  // Athlete Endpoints
  // =====================

  /**
   * Get athlete profile
   */
  async getAthlete(athleteId?: number): Promise<TPAthlete> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.get<TPAthlete>(`${TP_API_URL}/fitness/v1/athletes/${id}/settings`)
  }

  /**
   * Get coached athletes (coach accounts only)
   * Uses the coachedathletesadded endpoint discovered from network traffic
   */
  async getCoachedAthletes(): Promise<TPCoachAthlete[]> {
    const user = await this.getCurrentUser()
    return this.client.get<TPCoachAthlete[]>(`${TP_API_URL}/fitness/v1/coaches/${user.Id}/coachedathletesadded`)
  }

  /**
   * Get athlete groups/tags for coach
   */
  async getAthleteGroups(): Promise<TPAthleteGroup[]> {
    const user = await this.getCurrentUser()
    return this.client.get<TPAthleteGroup[]>(`${TP_API_URL}/coaches/v2/coaches/${user.Id}/tags`)
  }

  /**
   * Get all coached athlete IDs from groups
   */
  async getCoachedAthleteIds(): Promise<number[]> {
    const groups = await this.getAthleteGroups()
    const ids = new Set<number>()
    for (const group of groups) {
      for (const id of group.athleteIds) {
        ids.add(id)
      }
    }
    return Array.from(ids)
  }

  /**
   * Get athlete group feed (athletes in a specific group)
   */
  async getAthleteGroupFeed(groupId: number): Promise<unknown[]> {
    const user = await this.getCurrentUser()
    return this.client.get<unknown[]>(`${TP_API_URL}/fitness/v1/coaches/${user.Id}/athletegroups/${groupId}/feed`)
  }

  /**
   * Get assistant coaches
   */
  async getAssistantCoaches(): Promise<unknown[]> {
    const user = await this.getCurrentUser()
    return this.client.get<unknown[]>(`${TP_API_URL}/coaches/v1/coaches/${user.Id}/assistantcoaches`)
  }

  /**
   * Get coach settings
   */
  async getCoachSettings(): Promise<unknown> {
    const user = await this.getCurrentUser()
    return this.client.get<unknown>(`${TP_API_URL}/coaches/v1/coaches/${user.Id}/settings`)
  }

  /**
   * Get athletes upgrade status
   */
  async getAthletesUpgradeStatus(): Promise<unknown> {
    const user = await this.getCurrentUser()
    return this.client.get<unknown>(`${TP_API_URL}/coaches/v1/coaches/${user.Id}/athletes/upgradeStatus`)
  }

  /**
   * Get athlete equipment
   */
  async getEquipment(athleteId?: number): Promise<unknown[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.get<unknown[]>(`${TP_API_URL}/fitness/v1/athletes/${id}/equipment`)
  }

  /**
   * Get athlete zones (HR, power, pace)
   */
  async getZones(athleteId?: number): Promise<unknown> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.get<unknown>(`${TP_API_URL}/fitness/v1/athletes/${id}/defaultZones`)
  }

  /**
   * Get athlete goals
   */
  async getGoals(athleteId?: number): Promise<unknown[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.get<unknown[]>(`${TP_API_URL}/fitness/v1/athletes/${id}/goallists`)
  }

  /**
   * Get athlete's coaches
   */
  async getCoaches(athleteId?: number): Promise<unknown[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.get<unknown[]>(`${TP_API_URL}/fitness/v1/athletes/${id}/coaches/shared`)
  }

  /**
   * Get primary coach
   */
  async getPrimaryCoach(athleteId?: number): Promise<unknown> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.get<unknown>(`${TP_API_URL}/fitness/v1/athletes/${id}/coaches/primary`)
  }

  // =====================
  // Workout Endpoints
  // =====================

  /**
   * Get workouts for a date range
   */
  async getWorkouts(startDate: Date, endDate: Date, athleteId?: number): Promise<TPWorkout[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    const start = this.formatDate(startDate)
    const end = this.formatDate(endDate)

    return this.client.get<TPWorkout[]>(`${TP_API_URL}/fitness/v6/athletes/${id}/workouts/${start}/${end}`)
  }

  /**
   * Get a single workout with details
   */
  async getWorkout(workoutId: number, athleteId?: number): Promise<TPWorkout> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.get<TPWorkout>(`${TP_API_URL}/fitness/v6/athletes/${id}/workouts/${workoutId}/details`)
  }

  /**
   * Create a new workout
   */
  async createWorkout(workout: Partial<TPWorkout>, athleteId?: number): Promise<TPWorkout> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.post<TPWorkout>(`${TP_API_URL}/fitness/v6/athletes/${id}/workouts`, workout)
  }

  /**
   * Update a workout
   */
  async updateWorkout(workoutId: number, updates: Partial<TPWorkout>): Promise<TPWorkout> {
    return this.client.put<TPWorkout>(`${TP_API_URL}/fitness/v6/workouts/${workoutId}`, updates)
  }

  /**
   * Delete a workout
   */
  async deleteWorkout(workoutId: number): Promise<void> {
    await this.client.delete<void>(`${TP_API_URL}/fitness/v6/workouts/${workoutId}`)
  }

  /**
   * Mark workout as completed
   */
  async completeWorkout(workoutId: number, completedData?: Partial<TPWorkout>): Promise<TPWorkout> {
    return this.client.put<TPWorkout>(`${TP_API_URL}/fitness/v6/workouts/${workoutId}/complete`, {
      Completed: true,
      CompletedDate: new Date().toISOString(),
      ...completedData,
    })
  }

  // =====================
  // Calendar Endpoints
  // =====================

  /**
   * Get calendar notes for a date range
   */
  async getCalendarNotes(startDate: Date, endDate: Date, athleteId?: number): Promise<unknown[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    const start = this.formatDate(startDate)
    const end = this.formatDate(endDate)

    return this.client.get<unknown[]>(`${TP_API_URL}/fitness/v1/athletes/${id}/calendarNote/${start}/${end}`)
  }

  /**
   * Get events (races, etc.) for a date range
   */
  async getEvents(startDate: Date, endDate: Date, athleteId?: number): Promise<unknown[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    const start = this.formatDate(startDate)
    const end = this.formatDate(endDate)

    return this.client.get<unknown[]>(`${TP_API_URL}/fitness/v6/athletes/${id}/events/${start}/${end}`)
  }

  /**
   * Get focus event (A race)
   */
  async getFocusEvent(athleteId?: number): Promise<unknown> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.get<unknown>(`${TP_API_URL}/fitness/v6/athletes/${id}/events/focusevent`)
  }

  /**
   * Get availability for a date range
   */
  async getAvailability(startDate: Date, endDate: Date, athleteId?: number): Promise<unknown[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    const start = this.formatDate(startDate)
    const end = this.formatDate(endDate)

    return this.client.get<unknown[]>(`${TP_API_URL}/fitness/v1/athletes/${id}/availability/${start}/${end}`)
  }

  // =====================
  // Metrics Endpoints
  // =====================

  /**
   * Get metrics for a date range (consolidated timed metrics)
   */
  async getMetrics(startDate: Date, endDate: Date, athleteId?: number): Promise<TPMetrics[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    const start = this.formatDate(startDate)
    const end = this.formatDate(endDate)

    return this.client.get<TPMetrics[]>(`${TP_API_URL}/metrics/v3/athletes/${id}/consolidatedtimedmetrics/${start}/${end}`)
  }

  /**
   * Save metrics for a date
   */
  async saveMetrics(metrics: TPMetrics, athleteId?: number): Promise<TPMetrics> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.post<TPMetrics>(`${TP_API_URL}/fitness/v1/athletes/${id}/metrics`, metrics)
  }

  // =====================
  // Performance Chart
  // =====================

  /**
   * Get PMC (Performance Management Chart) data
   */
  async getPerformanceChart(startDate: Date, endDate: Date, athleteId?: number): Promise<TPPerformanceChart> {
    const id = athleteId || (await this.getCurrentUser()).Id
    const start = this.formatDate(startDate)
    const end = this.formatDate(endDate)

    return this.client.get<TPPerformanceChart>(`${TP_API_URL}/fitness/v3/athletes/${id}/pmc/${start}/${end}`)
  }

  // =====================
  // File Upload
  // =====================

  /**
   * Upload an activity file (FIT, TCX, GPX)
   */
  async uploadFile(file: ArrayBuffer, fileName: string, athleteId?: number): Promise<TPUploadResult> {
    const id = athleteId || (await this.getCurrentUser()).Id

    // Compress and encode
    const compressed = await this.gzipEncode(file)
    const base64 = this.arrayBufferToBase64(compressed)

    return this.client.post<TPUploadResult>(`${TP_API_URL}/fitness/v1/athletes/${id}/fileupload`, {
      FileName: fileName,
      Data: base64,
    })
  }

  // =====================
  // Library Workouts
  // =====================

  /**
   * Get workout library
   */
  async getLibraryWorkouts(params?: TPSearchParams): Promise<TPLibraryWorkout[]> {
    const user = await this.getCurrentUser()
    return this.client.get<TPLibraryWorkout[]>(`${TP_API_URL}/fitness/v1/athletes/${user.Id}/library/workouts`, {
      limit: params?.limit,
      offset: params?.offset,
    })
  }

  /**
   * Create library workout
   */
  async createLibraryWorkout(workout: Partial<TPLibraryWorkout>): Promise<TPLibraryWorkout> {
    const user = await this.getCurrentUser()
    return this.client.post<TPLibraryWorkout>(`${TP_API_URL}/fitness/v1/athletes/${user.Id}/library/workouts`, workout)
  }

  /**
   * Apply library workout to calendar
   */
  async applyLibraryWorkout(libraryWorkoutId: number, date: Date, athleteId?: number): Promise<TPWorkout> {
    const id = athleteId || (await this.getCurrentUser()).Id
    return this.client.post<TPWorkout>(`${TP_API_URL}/fitness/v1/athletes/${id}/workouts/fromLibrary`, {
      LibraryWorkoutId: libraryWorkoutId,
      WorkoutDay: this.formatDate(date),
    })
  }

  // =====================
  // Plans Endpoints
  // =====================

  /**
   * Get applied training plans
   */
  async getAppliedPlans(date?: Date, athleteId?: number): Promise<unknown[]> {
    const id = athleteId || (await this.getCurrentUser()).Id
    const dateStr = this.formatDate(date || new Date())
    return this.client.get<unknown[]>(`${TP_API_URL}/plans/v1/athletes/${id}/appliedplans/${dateStr}`)
  }

  // =====================
  // System Endpoints
  // =====================

  /**
   * Get all workout types
   */
  async getWorkoutTypes(): Promise<unknown[]> {
    return this.client.get<unknown[]>(`${TP_API_URL}/fitness/v6/workouttypes`)
  }

  /**
   * Get user feature flags
   */
  async getFeatureFlags(): Promise<unknown> {
    return this.client.get<unknown>(`${TP_API_URL}/users/v1/featureflags`)
  }

  /**
   * Get user access rights
   */
  async getAccessRights(): Promise<unknown> {
    return this.client.get<unknown>(`${TP_API_URL}/users/v1/user/accessrights`)
  }

  /**
   * Get integrations (Garmin, Strava, etc.)
   */
  async getIntegrations(): Promise<unknown[]> {
    return this.client.get<unknown[]>(`${TP_API_URL}/integrations/v1/access/userIntegrations`)
  }

  // =====================
  // Utility Methods
  // =====================

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }

  private async gzipEncode(data: ArrayBuffer): Promise<ArrayBuffer> {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(data))
        controller.close()
      },
    })

    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'))
    const reader = compressedStream.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return result.buffer
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Export cookies for persistence
   */
  exportCookies(): TPCookie[] {
    return this.client.getCookies()
  }

  /**
   * Import cookies (for restoring session)
   */
  importCookies(cookies: TPCookie[]): void {
    this.client.setCookies(cookies)
  }

  /**
   * Raw API request (for endpoints not covered)
   */
  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = path.startsWith('http') ? path : `${TP_API_URL}${path}`
    return this.client.get<T>(url, params)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${TP_API_URL}${path}`
    return this.client.post<T>(url, body)
  }
}

export default TrainingPeaks
