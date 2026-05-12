/**
 * server/src/routes/systemHealth.ts — Coordinator system health checks
 *
 * Exposes non-secret deployment/configuration diagnostics for coordinators.
 * Values are presence/status only; secrets are never returned.
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import { supabase } from '../lib/supabase'

export const systemHealthRouter = Router()

type HealthStatus = 'ok' | 'warning' | 'error'

interface HealthCheck {
  name: string
  status: HealthStatus
  message: string
  latency_ms?: number
}

function envCheck(name: string, present: boolean, message: string): HealthCheck {
  return {
    name,
    status: present ? 'ok' : 'error',
    message,
  }
}

async function tableCheck(name: string, tableName: string, columns = 'id'): Promise<HealthCheck> {
  const started = Date.now()
  const { error } = await supabase
    .from(tableName)
    .select(columns)
    .limit(1)
  return {
    name,
    status: error ? 'error' : 'ok',
    message: error ? error.message : `${tableName} reachable`,
    latency_ms: Date.now() - started,
  }
}

systemHealthRouter.get('/system-health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const checks: HealthCheck[] = []
    const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL)
    const hasSecretKey = Boolean(process.env.SUPABASE_SECRET_KEY)
    const hasLegacyServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

    checks.push(envCheck('SUPABASE_URL', hasSupabaseUrl, hasSupabaseUrl ? 'Configured' : 'Missing required Supabase URL'))
    checks.push({
      name: 'Supabase server secret',
      status: hasSecretKey ? 'ok' : hasLegacyServiceRoleKey ? 'warning' : 'error',
      message: hasSecretKey
        ? 'Using SUPABASE_SECRET_KEY'
        : hasLegacyServiceRoleKey
          ? 'Using legacy SUPABASE_SERVICE_ROLE_KEY name; migrate to SUPABASE_SECRET_KEY when practical'
          : 'Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY',
    })

    checks.push(...await Promise.all([
      tableCheck('Classes table', 'classes', 'id'),
      tableCheck('Feedback inbox migration', 'app_feedback', 'id, status, reviewed_by, updated_at'),
      tableCheck('Legacy import batch migration', 'legacy_import_batches', 'id, import_id, status, created_report_ids'),
      tableCheck('Audit log table', 'audit_logs', 'id, table_name, action'),
      tableCheck('Class documents migration', 'class_documents', 'id, class_id, storage_path, original_filename'),
    ]))

    const overall: HealthStatus = checks.some(check => check.status === 'error')
      ? 'error'
      : checks.some(check => check.status === 'warning')
        ? 'warning'
        : 'ok'

    res.json({
      generated_at: new Date().toISOString(),
      overall,
      checks,
    })
  } catch (err) {
    next(err)
  }
})
