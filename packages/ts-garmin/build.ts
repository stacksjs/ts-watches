/* eslint-disable no-console */
/* eslint-disable ts/no-top-level-await */
import { $ } from 'bun'

await $`rm -rf dist`
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
})

// Generate type declarations
await $`bunx tsc --emitDeclarationOnly --declaration --outDir dist`

console.log('Build completed!')
