import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const routeFiles = [
  'classes.ts',
  'trainers.ts',
  'drills.ts',
  'schedule.ts',
  'enrollments.ts',
  'classDocuments.ts',
]

test('coordinator mutation routes include audit logging', () => {
  for (const file of routeFiles) {
    const source = readFileSync(join(process.cwd(), 'src/routes', file), 'utf8')
    assert.match(source, /logAudit/, `${file} should import and call logAudit`)

    const mutationCount = [...source.matchAll(/\w+Router\.(post|put|patch|delete)\(/g)].length
    const auditCount = [...source.matchAll(/logAudit\(/g)].length
    assert.ok(
      auditCount >= mutationCount,
      `${file} has ${mutationCount} mutation handlers but only ${auditCount} audit calls`,
    )
  }
})
