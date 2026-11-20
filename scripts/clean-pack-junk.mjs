import fs from 'node:fs'
import path from 'node:path'

const roots = process.argv.slice(2)
if (!roots.length) {
  console.error('usage: node scripts/clean-pack-junk.mjs <dir>...')
  process.exit(1)
}

function walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__' || entry.name === '.venv' || entry.name === 'venv') {
        fs.rmSync(full, { recursive: true, force: true })
        continue
      }
      walk(full)
      continue
    }
    if (entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) {
      fs.rmSync(full, { force: true })
    }
  }
}

for (const root of roots) {
  walk(path.resolve(root))
}
