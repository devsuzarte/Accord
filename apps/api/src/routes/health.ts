import type { HealthResponse } from '@sharescreen/shared'
import { Elysia } from 'elysia'
import pkg from '../../package.json'

const startedAt = Date.now()

export const healthRoutes = new Elysia().get('/health', (): HealthResponse => ({
  status: 'ok',
  version: pkg.version,
  uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
}))
