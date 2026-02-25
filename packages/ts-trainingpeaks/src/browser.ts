/**
 * Browser automation for TrainingPeaks login
 * Uses Chrome DevTools Protocol (CDP) over WebSocket
 * Zero dependencies - uses only Bun native APIs
 */

export interface BrowserOptions {
  executablePath?: string
  headless?: boolean
  timeout?: number
  userAgent?: string
  viewportWidth?: number
  viewportHeight?: number
  /** Use a clean/isolated browser profile (no shared sessions) */
  incognito?: boolean
  /** Custom user data directory */
  userDataDir?: string
}

interface CDPMessage {
  id: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number, message: string }
}

interface CDPCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  size: number
  httpOnly: boolean
  secure: boolean
  session: boolean
  sameSite?: string
}

export class Browser {
  private process: ReturnType<typeof Bun.spawn> | null = null
  private ws: WebSocket | null = null
  private messageId = 0
  private pendingMessages = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()
  private options: Required<BrowserOptions>
  private debuggerUrl: string | null = null
  private eventListeners = new Map<string, ((_params: unknown) => void)[]>()

  private userDataDir: string | null = null

  constructor(options: BrowserOptions = {}) {
    this.options = {
      executablePath: options.executablePath || this.findChrome(),
      headless: options.headless ?? false, // Non-headless for login with reCAPTCHA
      timeout: options.timeout ?? 60000,
      userAgent: options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewportWidth: options.viewportWidth ?? 1280,
      viewportHeight: options.viewportHeight ?? 800,
      incognito: options.incognito ?? true, // Default to isolated profile
      userDataDir: options.userDataDir,
    } as Required<BrowserOptions>
  }

  private findChrome(): string {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Arc.app/Contents/MacOS/Arc',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]

    for (const path of paths) {
      try {
        const result = Bun.spawnSync(['test', '-x', path])
        if (result.exitCode === 0) return path
      }
      catch {
        continue
      }
    }

    throw new Error('Chrome/Chromium not found. Please install Chrome or specify executablePath.')
  }

  async launch(): Promise<void> {
    // Create temp user data dir for isolated profile
    if ((this.options as BrowserOptions).incognito) {
      this.userDataDir = `/tmp/tp-chrome-${Date.now()}-${Math.random().toString(36).slice(2)}`
      // Create the directory
      const mkdirProc = Bun.spawn(['mkdir', '-p', this.userDataDir], { stdout: 'ignore', stderr: 'ignore' })
      await mkdirProc.exited
    }

    const args = [
      this.options.headless ? '--headless=new' : '',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-sandbox',
      '--remote-debugging-port=0',
      `--window-size=${this.options.viewportWidth},${this.options.viewportHeight}`,
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-features=TranslateUI',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',
      // Use isolated profile
      this.userDataDir ? `--user-data-dir=${this.userDataDir}` : '',
      // Run in incognito mode for true isolation
      (this.options as BrowserOptions).incognito ? '--incognito' : '',
    ].filter(Boolean)

    this.process = Bun.spawn([this.options.executablePath, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stderr = this.process.stderr as ReadableStream<Uint8Array>
    const reader = stderr.getReader()
    const decoder = new TextDecoder()
    let output = ''
    const startTime = Date.now()

    while (Date.now() - startTime < this.options.timeout) {
      const { value, done } = await reader.read()
      if (done) break

      output += decoder.decode(value)
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) {
        this.debuggerUrl = match[1]
        break
      }
    }

    reader.releaseLock()

    if (!this.debuggerUrl) {
      await this.close()
      throw new Error('Failed to get Chrome DevTools URL')
    }

    // Get page target
    const baseHttpUrl = this.debuggerUrl.replace('ws://', 'http://').split('/devtools/')[0]
    const listUrl = `${baseHttpUrl}/json/list`
    await new Promise(r => setTimeout(r, 1000))

    const response = await fetch(listUrl)
    const responseText = await response.text()

    let targets: Array<{ type: string, webSocketDebuggerUrl: string }>
    try {
      targets = JSON.parse(responseText)
    }
    catch {
      throw new Error(`Failed to parse browser targets: ${responseText.slice(0, 200)}`)
    }

    const pageTarget = targets.find(t => t.type === 'page')
    if (!pageTarget) {
      const newPageUrl = `${baseHttpUrl}/json/new?about:blank`
      const newPageResponse = await fetch(newPageUrl, { method: 'PUT' })
      const newPageText = await newPageResponse.text()
      let newPage: { webSocketDebuggerUrl: string }
      try {
        newPage = JSON.parse(newPageText)
      }
      catch {
        throw new Error(`Failed to create new page: ${newPageText.slice(0, 200)}`)
      }
      this.debuggerUrl = newPage.webSocketDebuggerUrl
    }
    else {
      this.debuggerUrl = pageTarget.webSocketDebuggerUrl
    }

    await this.connect()

    // Enable necessary domains
    await this.send('Network.enable')
    await this.send('Page.enable')
    await this.send('Runtime.enable')

    // Set user agent
    await this.send('Network.setUserAgentOverride', {
      userAgent: this.options.userAgent,
    })

    // Set viewport
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.options.viewportWidth,
      height: this.options.viewportHeight,
      deviceScaleFactor: 1,
      mobile: false,
    })
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.debuggerUrl) {
        reject(new Error('No debugger URL'))
        return
      }

      this.ws = new WebSocket(this.debuggerUrl)

      this.ws.onopen = () => resolve()
      this.ws.onerror = (e) => reject(new Error(`WebSocket error: ${e}`))
      this.ws.onclose = () => { this.ws = null }

      this.ws.onmessage = (event) => {
        try {
          const message: CDPMessage = JSON.parse(String(event.data))

          // Handle responses
          if (message.id !== undefined) {
            const pending = this.pendingMessages.get(message.id)
            if (pending) {
              this.pendingMessages.delete(message.id)
              if (message.error) {
                pending.reject(new Error(message.error.message))
              }
              else {
                pending.resolve(message.result)
              }
            }
          }

          // Handle events
          if (message.method) {
            const listeners = this.eventListeners.get(message.method)
            if (listeners) {
              for (const listener of listeners) {
                listener(message.params)
              }
            }
          }
        }
        catch {
          // Ignore parse errors
        }
      }
    })
  }

  private async send(method: string, _params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.ws) throw new Error('Not connected to browser')

    const id = ++this.messageId

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id)
        reject(new Error(`CDP command timed out: ${method}`))
      }, this.options.timeout)

      this.pendingMessages.set(id, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })

      this.ws!.send(JSON.stringify({ id, method, params }))
    })
  }

  on(event: string, callback: (_params: unknown) => void): void {
    const listeners = this.eventListeners.get(event) || []
    listeners.push(callback)
    this.eventListeners.set(event, listeners)
  }

  async goto(url: string): Promise<string> {
    await this.send('Page.navigate', { url })
    await new Promise(r => setTimeout(r, 2000))

    const result = await this.send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true,
    }) as { result: { value: string } }

    return result.result.value
  }

  async waitForNavigation(timeout = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Navigation timeout'))
      }, timeout)

      const handler = () => {
        clearTimeout(timer)
        this.eventListeners.delete('Page.loadEventFired')
        resolve()
      }

      this.on('Page.loadEventFired', handler)
    })
  }

  async waitForUrl(urlPattern: string | RegExp, timeout = 60000): Promise<string> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const result = await this.send('Runtime.evaluate', {
        expression: 'window.location.href',
        returnByValue: true,
      }) as { result: { value: string } }

      const currentUrl = result.result.value

      if (typeof urlPattern === 'string') {
        if (currentUrl.includes(urlPattern)) return currentUrl
      }
      else {
        if (urlPattern.test(currentUrl)) return currentUrl
      }

      await new Promise(r => setTimeout(r, 500))
    }

    throw new Error(`Timeout waiting for URL pattern: ${urlPattern}`)
  }

  async type(selector: string, text: string): Promise<void> {
    const escapedSelector = selector.replace(/'/g, "\\'")

    // Set value directly via JavaScript for reliability
    const result = await this.send('Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.querySelector('${escapedSelector}');
          if (!el) return { success: false, error: 'Element not found' };

          // Focus the element
          el.focus();

          // Clear and set value
          el.value = '${text.replace(/'/g, "\\'")}';

          // Trigger events
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

          return { success: true, value: el.value };
        })()
      `,
      returnByValue: true,
    }) as { result: { value: { success: boolean, error?: string, value?: string } } }

    if (!result.result.value?.success) {
      throw new Error(`Failed to type into ${selector}: ${result.result.value?.error || 'unknown error'}`)
    }
  }

  async click(selector: string): Promise<void> {
    const escapedSelector = selector.replace(/'/g, "\\'")

    // Scroll element into view and get position
    const result = await this.send('Runtime.evaluate', {
      expression: `
        (function() {
          const el = document.querySelector('${escapedSelector}');
          if (!el) return null;
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()
      `,
      returnByValue: true,
    }) as { result: { value: { x: number, y: number } | null } }

    if (!result.result.value) {
      throw new Error(`Element not found: ${selector}`)
    }

    const { x, y } = result.result.value

    // Move mouse first
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await new Promise(r => setTimeout(r, 50))

    // Click
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await new Promise(r => setTimeout(r, 50))
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  }

  async submitForm(formSelector?: string): Promise<void> {
    const selector = formSelector ? formSelector.replace(/'/g, "\\'") : 'form'
    await this.send('Runtime.evaluate', {
      expression: `document.querySelector('${selector}')?.submit()`,
    })
  }

  /**
   * Click element using JavaScript click() - more reliable for buttons
   */
  async jsClick(selector: string): Promise<void> {
    const escapedSelector = selector.replace(/'/g, "\\'")
    await this.send('Runtime.evaluate', {
      expression: `
        const el = document.querySelector('${escapedSelector}');
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.click();
        }
      `,
    })
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }) as { result: { value: T }, exceptionDetails?: { exception?: { description: string } } }

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'Evaluation failed')
    }

    return result.result.value
  }

  async getCookies(urls?: string[]): Promise<CDPCookie[]> {
    const result = await this.send('Network.getCookies', urls ? { urls } : {}) as { cookies: CDPCookie[] }
    return result.cookies
  }

  async setCookies(cookies: Array<{ name: string, value: string, domain: string, path?: string }>): Promise<void> {
    await this.send('Network.setCookies', {
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
      })),
    })
  }

  async clearCookies(): Promise<void> {
    await this.send('Network.clearBrowserCookies')
    await this.send('Network.clearBrowserCache')
  }

  async clearAllStorage(): Promise<void> {
    await this.send('Network.clearBrowserCookies')
    await this.send('Network.clearBrowserCache')
    // Clear storage for the origin
    await this.send('Storage.clearDataForOrigin', {
      origin: 'https://trainingpeaks.com',
      storageTypes: 'all',
    })
    await this.send('Storage.clearDataForOrigin', {
      origin: 'https://home.trainingpeaks.com',
      storageTypes: 'all',
    })
    await this.send('Storage.clearDataForOrigin', {
      origin: 'https://app.trainingpeaks.com',
      storageTypes: 'all',
    })
  }

  /**
   * Enable request interception to log API calls
   */
  async enableRequestLogging(urlFilter?: RegExp): Promise<string[]> {
    const requests: string[] = []

    this.on('Network.requestWillBeSent', (_params: unknown) => {
      const p = params as { request: { url: string, method: string } }
      const url = p.request.url
      if (!urlFilter || urlFilter.test(url)) {
        requests.push(`${p.request.method} ${url}`)
      }
    })

    return requests
  }

  async screenshot(path?: string): Promise<string> {
    const result = await this.send('Page.captureScreenshot', { format: 'png' }) as { data: string }

    if (path) {
      await Bun.write(path, Buffer.from(result.data, 'base64'))
    }

    return result.data
  }

  async close(): Promise<void> {
    for (const [id, pending] of this.pendingMessages) {
      pending.reject(new Error('Browser closed'))
      this.pendingMessages.delete(id)
    }

    if (this.ws) {
      try {
        await this.send('Browser.close')
      }
      catch {
        // Ignore
      }
      this.ws.close()
      this.ws = null
    }

    if (this.process) {
      this.process.kill()
      this.process = null
    }

    // Clean up temp user data dir
    if (this.userDataDir) {
      try {
        const proc = Bun.spawn(['rm', '-rf', this.userDataDir], { stdout: 'ignore', stderr: 'ignore' })
        await proc.exited
      }
      catch {
        // Ignore cleanup errors
      }
      this.userDataDir = null
    }
  }
}
