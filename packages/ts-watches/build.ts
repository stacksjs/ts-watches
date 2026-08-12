/* eslint-disable ts/no-top-level-await */
import { dts } from 'bun-plugin-dtsx'

const entrypoints = [
  'src/index.ts',
  'src/fit/index.ts',
  'src/drivers/index.ts',
  'bin/cli.ts',
]

const result = await Bun.build({
  entrypoints,
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

for (const output of ['dist/src/index.js', 'dist/src/fit/index.js', 'dist/src/drivers/index.js']) {
  if (!await Bun.file(output).exists())
    throw new Error(`ts-watches build did not create ${output}`)
}
