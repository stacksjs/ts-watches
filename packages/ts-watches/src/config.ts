import type { WatchConfig } from './types'
import { loadConfig } from 'bunfig'

export const defaultConfig: WatchConfig = {
  verbose: false,
  outputDir: './watch-data',
  watchPaths: ['/Volumes'],
}

let _config: WatchConfig | null = null

export async function getConfig(): Promise<WatchConfig> {
  if (!_config) {
    _config = await loadConfig({
      name: 'watches',
      defaultConfig,
    })
  }

  return _config
}

export const config: WatchConfig = defaultConfig
