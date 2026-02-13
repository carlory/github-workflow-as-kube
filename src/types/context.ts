/**
 * Event context and handler result type definitions
 */

export interface EventContext {
  eventName: string
  eventGUID: string
  repository: string
  sha: string
  ref: string
  actor: string
  workflow: string
  runId: string
  runNumber: string
}

export interface HandlerResult {
  success: boolean
  message?: string
  tookAction: boolean
  outputs?: Record<string, string>
}
