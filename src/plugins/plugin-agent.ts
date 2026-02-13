/**
 * Plugin agent implementation
 */

import type { PluginAgent } from '../types/index.js'

export class PluginAgentImpl implements PluginAgent {
  private outputs: Record<string, string> = {}
  private actionTaken = false
  private failureMessage?: string

  setOutput(name: string, value: string): void {
    this.outputs[name] = value
  }

  setFailed(message: string): void {
    this.failureMessage = message
  }

  tookAction(): void {
    this.actionTaken = true
  }

  getOutputs(): Record<string, string> {
    return { ...this.outputs }
  }

  didTakeAction(): boolean {
    return this.actionTaken
  }

  hasFailed(): boolean {
    return this.failureMessage !== undefined
  }

  getFailureMessage(): string | undefined {
    return this.failureMessage
  }
}
