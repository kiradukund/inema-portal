#!/usr/bin/env node
// Fails CI if any app/api/admin/**/route.ts file doesn't call
// requireAdmin()/requireAdminApi() -- the exact gap that left
// app/api/admin/ai/route.ts unauthenticated and live in production
// until a manual pre-access audit caught it.

const fs = require('fs')
const path = require('path')

const ADMIN_API_DIR = path.join(__dirname, '..', 'app', 'api', 'admin')

function findRouteFiles(dir) {
  let results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(findRouteFiles(full))
    } else if (entry.name === 'route.ts') {
      results.push(full)
    }
  }
  return results
}

const routeFiles = findRouteFiles(ADMIN_API_DIR)
const failures = []

for (const file of routeFiles) {
  const relPath = path.relative(ADMIN_API_DIR, file).split(path.sep).join('/')
  const content = fs.readFileSync(file, 'utf8')
  const isGuarded = content.includes('requireAdmin(') || content.includes('requireAdminApi(')
  if (!isGuarded) failures.push(relPath)
}

if (failures.length > 0) {
  console.error('The following app/api/admin routes do not call requireAdmin()/requireAdminApi():')
  failures.forEach(f => console.error(`  - app/api/admin/${f}`))
  process.exit(1)
}

console.log(`OK: all ${routeFiles.length} admin API route(s) are guarded.`)
