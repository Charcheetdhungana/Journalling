// Runs after `vite build`. Makes sure nothing local-only ships with the Worker:
//  - removes any .dev.vars copied into the build output (the Vite plugin copies it next to the Worker)
//  - fails the build if DEV_BYPASS_AUTH appears as a variable in the generated deploy config
import { appendFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
let failed = false

for (const entry of readdirSync(dist, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(dist, entry.name)

  const devVars = join(dir, '.dev.vars')
  if (existsSync(devVars)) {
    rmSync(devVars)
    console.log(`verify-build: removed ${devVars}`)
  }

  const config = join(dir, 'wrangler.json')
  if (existsSync(config)) {
    const parsed = JSON.parse(readFileSync(config, 'utf8'))
    if (parsed.vars && 'DEV_BYPASS_AUTH' in parsed.vars) {
      console.error(`verify-build: DEV_BYPASS_AUTH is set in ${config}. Remove it from wrangler.jsonc.`)
      failed = true
    }
    if (parsed.workers_dev !== false) {
      console.error(`verify-build: workers_dev must be false in ${config}.`)
      failed = true
    }
  }
}

// Static assets (dist/client) are published to the public asset store, so keep secrets out of them.
const FORBIDDEN = [/^\.dev\.vars/, /^\.env/, /\.map$/, /^wrangler\.jsonc?$/]
const IGNORE_LINES = ['.dev.vars*', '.env*', '*.map', 'wrangler.json', 'wrangler.jsonc']

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )
}

const assets = join(dist, 'client')
if (existsSync(assets)) {
  for (const file of walk(assets)) {
    const name = file.split(/[\\/]/).pop() ?? ''
    if (name !== '.assetsignore' && FORBIDDEN.some((re) => re.test(name))) {
      console.error(`verify-build: forbidden file in published assets: ${file}`)
      failed = true
    }
  }
  // Belt and braces: make sure .assetsignore lists them too, whatever the Vite plugin wrote.
  const ignoreFile = join(assets, '.assetsignore')
  const current = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : ''
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()))
  const missing = IGNORE_LINES.filter((l) => !have.has(l))
  if (missing.length) {
    const lead = current === '' || current.endsWith('\n') ? '' : '\n'
    appendFileSync(ignoreFile, `${lead}${missing.join('\n')}\n`)
  }
}

if (failed) process.exit(1)
console.log('verify-build: ok (no DEV_BYPASS_AUTH or .dev.vars in the deploy output)')

