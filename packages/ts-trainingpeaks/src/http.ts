/**
 * HTTP Client for TrainingPeaks API
 * Handles cookies, authentication, and API requests
 */

import type { TPCookie } from './types'

export interface HttpClientOptions {
  baseUrl?: string
  timeout?: number
  userAgent?: string
}

export class HttpClient {
  private cookies: Map<string, TPCookie> = new Map()
  private baseUrl: string
  private timeout: number
  private userAgent: string

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://home.trainingpeaks.com'
    this.timeout = options.timeout || 30000
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }

  setCookies(cookies: TPCookie[]): void {
    for (const cookie of cookies) {
      const key = `${cookie.domain || ''}:${cookie.name}`
      this.cookies.set(key, cookie)
    }
  }

  getCookies(): TPCookie[] {
    return Array.from(this.cookies.values())
  }

  clearCookies(): void {
    this.cookies.clear()
  }

  private getCookieHeader(url: string): string {
    const parsed = new URL(url)
    const matching: TPCookie[] = []

    for (const cookie of this.cookies.values()) {
      // Check domain match
      if (cookie.domain) {
        const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain
        if (!parsed.hostname.endsWith(domain) && parsed.hostname !== domain) {
          continue
        }
      }

      // Check path match
      if (cookie.path && !parsed.pathname.startsWith(cookie.path)) {
        continue
      }

      // Check secure
      if (cookie.secure && parsed.protocol !== 'https:') {
        continue
      }

      // Check expiration
      if (cookie.expires && cookie.expires < new Date()) {
        continue
      }

      matching.push(cookie)
    }

    return matching.map(c => `${c.name}=${c.value}`).join('; ')
  }

  private extractCookies(response: Response, url: string): void {
    const setCookies = response.headers.getSetCookie()
    const parsedUrl = new URL(url)

    for (const cookieStr of setCookies) {
      const cookie = this.parseCookie(cookieStr, parsedUrl.hostname)
      if (cookie) {
        const key = `${cookie.domain || ''}:${cookie.name}`
        this.cookies.set(key, cookie)
      }
    }
  }

  private parseCookie(cookieStr: string, defaultDomain: string): TPCookie | null {
    const parts = cookieStr.split(';').map(p => p.trim())
    const [nameValue, ...attrs] = parts

    if (!nameValue || !nameValue.includes('=')) return null

    const [name, ...valueParts] = nameValue.split('=')
    const value = valueParts.join('=')

    const cookie: TPCookie = {
      name: name.trim(),
      value: value.trim(),
      domain: defaultDomain,
      path: '/',
    }

    for (const attr of attrs) {
      const [key, ...attrValueParts] = attr.split('=')
      const attrKey = key.trim().toLowerCase()
      const attrValue = attrValueParts.join('=').trim()

      switch (attrKey) {
        case 'domain':
          cookie.domain = attrValue
          break
        case 'path':
          cookie.path = attrValue
          break
        case 'expires':
          cookie.expires = new Date(attrValue)
          break
        case 'max-age':
          const maxAge = parseInt(attrValue, 10)
          if (maxAge) cookie.expires = new Date(Date.now() + maxAge * 1000)
          break
        case 'secure':
          cookie.secure = true
          break
        case 'httponly':
          cookie.httpOnly = true
          break
      }
    }

    return cookie
  }

  async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown
      headers?: Record<string, string>
      params?: Record<string, string | number | boolean | undefined>
    } = {}
  ): Promise<T> {
    let url = path.startsWith('http') ? path : `${this.baseUrl}${path}`

    // Add query params
    if (options.params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          searchParams.set(key, String(value))
        }
      }
      const queryString = searchParams.toString()
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString
      }
    }

    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...options.headers,
    }

    // Add cookies
    const cookieHeader = this.getCookieHeader(url)
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }

    // Add body
    let body: string | undefined
    if (options.body !== undefined) {
      if (typeof options.body === 'object') {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json'
        body = JSON.stringify(options.body)
      } else if (typeof options.body === 'string') {
        body = options.body
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timeoutId)

      // Extract cookies from response
      this.extractCookies(response, url)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        return await response.json() as T
      }

      return await response.text() as T
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout: ${url}`)
      }
      throw error
    }
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', path, { params })
  }

  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', path, { body, headers })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body })
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  // Save cookies to disk
  async saveCookies(path: string): Promise<void> {
    const cookies = this.getCookies()
    await Bun.write(path, JSON.stringify(cookies, null, 2))
  }

  // Load cookies from disk
  async loadCookies(path: string): Promise<void> {
    try {
      const file = Bun.file(path)
      const content = await file.text()
      const cookies = JSON.parse(content) as TPCookie[]

      // Convert date strings back to Date objects
      for (const cookie of cookies) {
        if (cookie.expires) {
          cookie.expires = new Date(cookie.expires)
        }
      }

      this.setCookies(cookies)
    } catch {
      // File doesn't exist or is invalid, ignore
    }
  }
}
