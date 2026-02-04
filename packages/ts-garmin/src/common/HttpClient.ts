import crypto from 'node:crypto'
import type { UrlClass } from '../garmin/UrlClass'
import type { IOauth1, IOauth1Consumer, IOauth1Token, IOauth2Token } from '../garmin/types'

const CSRF_RE = /name="_csrf"\s+value="(.+?)"/
const TICKET_RE = /ticket=([^"]+)"/
const ACCOUNT_LOCKED_RE = /var statuss*=s*"([^"]*)"/
const PAGE_TITLE_RE = /<title>([^<]*)<\/title>/

const USER_AGENT_CONNECTMOBILE = 'com.garmin.android.apps.connectmobile'
const USER_AGENT_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'

const OAUTH_CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json'

let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

function hmacSha1(baseString: string, key: string): string {
  return crypto.createHmac('sha1', key).update(baseString).digest('base64')
}

interface OAuthParams {
  oauth_consumer_key: string
  oauth_token?: string
  oauth_signature_method: string
  oauth_timestamp: string
  oauth_nonce: string
  oauth_version: string
  oauth_signature?: string
  [key: string]: string | undefined
}

interface HttpRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>
  responseType?: string
  _retry?: boolean
}

function buildOAuthHeader(consumer: IOauth1Consumer, url: string, method: string, token?: { key: string, secret: string }, extraParams?: Record<string, string>): string {
  const oauthParams: OAuthParams = {
    oauth_consumer_key: consumer.key,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: generateTimestamp(),
    oauth_nonce: generateNonce(),
    oauth_version: '1.0',
  }

  if (token) {
    oauthParams.oauth_token = token.key
  }

  // Combine all params for signature
  const allParams: Record<string, string> = { ...oauthParams as Record<string, string> }
  if (extraParams) {
    Object.assign(allParams, extraParams)
  }

  // Parse URL params
  const urlObj = new URL(url)
  urlObj.searchParams.forEach((value, key) => {
    allParams[key] = value
  })

  // Sort and encode params
  const sortedParams = Object.keys(allParams)
    .sort()
    .map(key => `${encodeRFC3986(key)}=${encodeRFC3986(allParams[key])}`)
    .join('&')

  // Build base string
  const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  const baseString = `${method.toUpperCase()}&${encodeRFC3986(baseUrl)}&${encodeRFC3986(sortedParams)}`

  // Build signing key
  const signingKey = `${encodeRFC3986(consumer.secret)}&${token ? encodeRFC3986(token.secret) : ''}`

  // Generate signature
  oauthParams.oauth_signature = hmacSha1(baseString, signingKey)

  // Build header
  const headerParams = Object.keys(oauthParams)
    .filter(key => key.startsWith('oauth_'))
    .sort()
    .map(key => `${encodeRFC3986(key)}="${encodeRFC3986(oauthParams[key]!)}"`)
    .join(', ')

  return `OAuth ${headerParams}`
}

function stringifyParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

function parseQueryString(str: string): Record<string, string> {
  const result: Record<string, string> = {}
  str.split('&').forEach((pair) => {
    const [key, value] = pair.split('=')
    if (key)
      result[decodeURIComponent(key)] = decodeURIComponent(value || '')
  })
  return result
}

export class HttpClient {
  url: UrlClass
  oauth1Token: IOauth1Token | undefined
  oauth2Token: IOauth2Token | undefined
  OAUTH_CONSUMER: IOauth1Consumer | undefined
  private cookies: Map<string, string> = new Map()

  constructor(url: UrlClass) {
    this.url = url
  }

  private getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  private extractCookies(response: Response): void {
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) {
      // Handle multiple cookies
      const cookieParts = setCookie.split(/,(?=\s*\w+=)/)
      for (const part of cookieParts) {
        const cookieValue = part.split(';')[0].trim()
        const [name, value] = cookieValue.split('=')
        if (name && value) {
          this.cookies.set(name.trim(), value.trim())
        }
      }
    }
  }

  async fetchOauthConsumer(): Promise<void> {
    const response = await fetch(OAUTH_CONSUMER_URL)
    const data = await response.json() as { consumer_key: string, consumer_secret: string }
    this.OAUTH_CONSUMER = {
      key: data.consumer_key,
      secret: data.consumer_secret,
    }
  }

  async checkTokenValid(): Promise<void> {
    if (this.oauth2Token) {
      const nowSeconds = Math.floor(Date.now() / 1000)
      if (this.oauth2Token.expires_at < nowSeconds) {
        console.error('Token expired!')
        await this.refreshOauth2Token()
      }
    }
  }

  private async makeRequest<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    }

    if (this.oauth2Token) {
      headers.Authorization = `Bearer ${this.oauth2Token.access_token}`
    }

    if (this.cookies.size > 0) {
      headers.Cookie = this.getCookieHeader()
    }

    const { responseType, _retry, ...fetchOptions } = options
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    })

    this.extractCookies(response)

    if (response.status === 401 && this.oauth2Token && !_retry) {
      if (isRefreshing) {
        const token = await new Promise<string>((resolve) => {
          refreshSubscribers.push(resolve)
        })
        headers.Authorization = `Bearer ${token}`
        return this.makeRequest(url, { ...options, headers, _retry: true })
      }

      isRefreshing = true
      await this.refreshOauth2Token()
      isRefreshing = false
      refreshSubscribers.forEach(sub => sub(this.oauth2Token!.access_token))
      refreshSubscribers = []

      headers.Authorization = `Bearer ${this.oauth2Token.access_token}`
      return this.makeRequest(url, { ...options, headers, _retry: true })
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP Error: ${response.status} ${response.statusText} - ${text}`)
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>
    }

    if (responseType === 'arraybuffer') {
      return response.arrayBuffer() as Promise<T>
    }

    return response.text() as Promise<T>
  }

  async get<T>(url: string, config?: { params?: Record<string, unknown>, headers?: Record<string, string>, responseType?: string }): Promise<T> {
    let fullUrl = url
    if (config?.params) {
      const queryString = stringifyParams(config.params)
      fullUrl = queryString ? `${url}${url.includes('?') ? '&' : '?'}${queryString}` : url
    }
    return this.makeRequest<T>(fullUrl, {
      method: 'GET',
      headers: config?.headers,
      responseType: config?.responseType,
    })
  }

  async post<T>(url: string, data: unknown, config?: { headers?: Record<string, string> }): Promise<T> {
    const headers: Record<string, string> = { ...config?.headers }

    let body: string | undefined
    if (data !== null && data !== undefined) {
      if (typeof data === 'object' && !(data instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json'
        body = JSON.stringify(data)
      }
      else if (typeof data === 'string') {
        body = data
      }
    }

    return this.makeRequest<T>(url, {
      method: 'POST',
      headers,
      body,
    })
  }

  async put<T>(url: string, data: unknown, config?: { headers?: Record<string, string> }): Promise<T> {
    const headers: Record<string, string> = { ...config?.headers }

    let body: string | undefined
    if (data !== null && data !== undefined) {
      if (typeof data === 'object') {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json'
        body = JSON.stringify(data)
      }
      else if (typeof data === 'string') {
        body = data
      }
    }

    return this.makeRequest<T>(url, {
      method: 'PUT',
      headers,
      body,
    })
  }

  async delete<T>(url: string, config?: { headers?: Record<string, string> }): Promise<T> {
    return this.makeRequest<T>(url, {
      method: 'POST',
      headers: {
        ...config?.headers,
        'X-Http-Method-Override': 'DELETE',
      },
    })
  }

  async login(username: string, password: string): Promise<HttpClient> {
    await this.fetchOauthConsumer()
    const ticket = await this.getLoginTicket(username, password)
    const oauth1 = await this.getOauth1Token(ticket)
    await this.exchange(oauth1)
    return this
  }

  private async getLoginTicket(username: string, password: string): Promise<string> {
    // Step1: Set cookie
    const step1Params = {
      clientId: 'GarminConnect',
      locale: 'en',
      service: this.url.GC_MODERN,
    }
    const step1Url = `${this.url.GARMIN_SSO_EMBED}?${stringifyParams(step1Params)}`
    const step1Response = await fetch(step1Url)
    this.extractCookies(step1Response)

    // Step2: Get _csrf
    const step2Params = {
      id: 'gauth-widget',
      embedWidget: 'true',
      locale: 'en',
      gauthHost: this.url.GARMIN_SSO_EMBED,
    }
    const step2Url = `${this.url.SIGNIN_URL}?${stringifyParams(step2Params)}`
    const step2Response = await fetch(step2Url, {
      headers: {
        Cookie: this.getCookieHeader(),
      },
    })
    this.extractCookies(step2Response)
    const step2Result = await step2Response.text()

    const csrfRegResult = CSRF_RE.exec(step2Result)
    if (!csrfRegResult) {
      throw new Error('login - csrf not found')
    }
    const csrfToken = csrfRegResult[1]

    // Step3: Get ticket
    const signinParams = {
      id: 'gauth-widget',
      embedWidget: 'true',
      clientId: 'GarminConnect',
      locale: 'en',
      gauthHost: this.url.GARMIN_SSO_EMBED,
      service: this.url.GARMIN_SSO_EMBED,
      source: this.url.GARMIN_SSO_EMBED,
      redirectAfterAccountLoginUrl: this.url.GARMIN_SSO_EMBED,
      redirectAfterAccountCreationUrl: this.url.GARMIN_SSO_EMBED,
    }
    const step3Url = `${this.url.SIGNIN_URL}?${stringifyParams(signinParams)}`

    const formData = new URLSearchParams()
    formData.append('username', username)
    formData.append('password', password)
    formData.append('embed', 'true')
    formData.append('_csrf', csrfToken)

    const step3Response = await fetch(step3Url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Dnt': '1',
        'Origin': this.url.GARMIN_SSO_ORIGIN,
        'Referer': this.url.SIGNIN_URL,
        'User-Agent': USER_AGENT_BROWSER,
        'Cookie': this.getCookieHeader(),
      },
      body: formData.toString(),
    })
    this.extractCookies(step3Response)
    const step3Result = await step3Response.text()

    this.handleAccountLocked(step3Result)
    this.handlePageTitle(step3Result)

    const ticketRegResult = TICKET_RE.exec(step3Result)
    if (!ticketRegResult) {
      throw new Error('login failed (Ticket not found or MFA), please check username and password')
    }
    return ticketRegResult[1]
  }

  handlePageTitle(htmlStr: string): void {
    const pageTitleRegResult = PAGE_TITLE_RE.exec(htmlStr)
    if (pageTitleRegResult) {
      const title = pageTitleRegResult[1]
      if (title.includes('Update Phone Number')) {
        throw new Error('login failed (Update Phone number), please update your phone number')
      }
    }
  }

  handleAccountLocked(htmlStr: string): void {
    const accountLockedRegResult = ACCOUNT_LOCKED_RE.exec(htmlStr)
    if (accountLockedRegResult) {
      const msg = accountLockedRegResult[1]
      console.error(msg)
      throw new Error('login failed (AccountLocked), please open connect web page to unlock your account')
    }
  }

  async refreshOauth2Token(): Promise<void> {
    if (!this.OAUTH_CONSUMER) {
      await this.fetchOauthConsumer()
    }
    if (!this.oauth2Token || !this.oauth1Token) {
      throw new Error('No Oauth2Token or Oauth1Token')
    }
    await this.exchange({
      token: this.oauth1Token,
    })
  }

  async getOauth1Token(ticket: string): Promise<IOauth1> {
    if (!this.OAUTH_CONSUMER) {
      throw new Error('No OAUTH_CONSUMER')
    }
    const params = {
      ticket,
      'login-url': this.url.GARMIN_SSO_EMBED,
      'accepts-mfa-tokens': 'true',
    }
    const url = `${this.url.OAUTH_URL}/preauthorized?${stringifyParams(params)}`

    const authHeader = buildOAuthHeader(this.OAUTH_CONSUMER, url, 'GET')

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'User-Agent': USER_AGENT_CONNECTMOBILE,
      },
    })

    const responseText = await response.text()
    const token = parseQueryString(responseText) as unknown as IOauth1Token
    this.oauth1Token = token
    return { token }
  }

  async exchange(oauth1: IOauth1): Promise<void> {
    if (!this.OAUTH_CONSUMER) {
      throw new Error('No OAUTH_CONSUMER')
    }

    const token = {
      key: oauth1.token.oauth_token,
      secret: oauth1.token.oauth_token_secret,
    }

    const baseUrl = `${this.url.OAUTH_URL}/exchange/user/2.0`

    const authHeader = buildOAuthHeader(this.OAUTH_CONSUMER, baseUrl, 'POST', token)

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'User-Agent': USER_AGENT_CONNECTMOBILE,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    const responseData = await response.json() as IOauth2Token
    this.oauth2Token = this.setOauth2TokenExpiresAt(responseData)
  }

  setOauth2TokenExpiresAt(token: IOauth2Token): IOauth2Token {
    const now = Date.now()
    const nowSeconds = Math.floor(now / 1000)
    token.last_update_date = new Date(now).toISOString()
    token.expires_date = new Date(now + token.expires_in * 1000).toISOString()
    token.expires_at = nowSeconds + token.expires_in
    token.refresh_token_expires_at = nowSeconds + token.refresh_token_expires_in
    return token
  }
}
