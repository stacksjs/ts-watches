/* eslint-disable ts/no-top-level-await */
import { dts } from 'bun-plugin-dtsx'

const entrypoints = [
  'src/index.ts',
  'src/realtime/bluetooth.ts',
  'src/realtime/garmin-bluetooth.ts',
  'src/fit/index.ts',
  'src/drivers/index.ts',
  'bin/cli.ts',
]

const result = await Bun.build({
  entrypoints: entrypoints.filter(entry => !['src/realtime/bluetooth.ts', 'src/realtime/garmin-bluetooth.ts'].includes(entry)),
  outdir: './dist',
  target: 'node',
  format: 'esm',
  splitting: true,
  minify: true,
  plugins: [dts({
    root: '.',
    outdir: './dist',
    tsconfigPath: '../../tsconfig.json',
    entrypoints,
    keepComments: true,
  })],
})

if (!result.success)
  throw new Error(`ts-watches build failed: ${result.logs.map(log => log.message).join('; ')}`)

// Build this portable subpath separately: sharing a Node bundle also shares
// its require bootstrap, even when Bluetooth itself has no imports.
const bluetooth = await Bun.build({
  entrypoints: ['src/realtime/bluetooth.ts', 'src/realtime/garmin-bluetooth.ts'],
  outdir: './dist/src/realtime',
  target: 'browser',
  format: 'esm',
  minify: true,
})
if (!bluetooth.success)
  throw new Error(`ts-watches Bluetooth build failed: ${bluetooth.logs.map(log => log.message).join('; ')}`)

for (const output of ['dist/src/index.js', 'dist/src/realtime/bluetooth.js', 'dist/src/realtime/garmin-bluetooth.js', 'dist/src/fit/index.js', 'dist/src/drivers/index.js']) {
  if (!await Bun.file(output).exists())
    throw new Error(`ts-watches build did not create ${output}`)
}

// Native hosts need the Bluetooth parser without Node/CLI bootstrap chunks.
const bluetoothCode = await Bun.file('dist/src/realtime/bluetooth.js').text()
if (new Bun.Transpiler({ loader: 'js' }).scanImports(bluetoothCode).length || /\bimport\.meta\b/.test(bluetoothCode))
  throw new Error('Bluetooth entry must be self-contained and usable in a native JavaScript host')
