/**
 * Structured logger with event and plugin context
 */

import * as core from '@actions/core'

export class Logger {
  private eventType?: string
  private eventGUID?: string
  private pluginName?: string

  constructor(eventType?: string, eventGUID?: string, pluginName?: string) {
    this.eventType = eventType
    this.eventGUID = eventGUID
    this.pluginName = pluginName
  }

  private formatMessage(level: string, message: string): string {
    const parts: string[] = []

    if (this.eventType) parts.push(`[${this.eventType}]`)
    if (this.eventGUID) parts.push(`[${this.eventGUID}]`)
    if (this.pluginName) parts.push(`[${this.pluginName}]`)
    parts.push(`[${level}]`)
    parts.push(message)

    return parts.join(' ')
  }

  info(message: string): void {
    core.info(this.formatMessage('INFO', message))
  }

  debug(message: string): void {
    core.debug(this.formatMessage('DEBUG', message))
  }

  warning(message: string): void {
    core.warning(this.formatMessage('WARNING', message))
  }

  error(message: string): void {
    core.error(this.formatMessage('ERROR', message))
  }

  setFailed(message: string): void {
    core.setFailed(this.formatMessage('FAILED', message))
  }
}
