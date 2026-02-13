/**
 * Plugin system type definitions
 */

import type {
  GitHubEventPayload,
  IssueEventPayload,
  PullRequestEventPayload,
  PushEventPayload,
  ReviewEventPayload,
  StatusEventPayload
} from './events.js'
import type { EventContext, HandlerResult } from './context.js'

export interface PluginAgent {
  setOutput(name: string, value: string): void
  setFailed(message: string): void
  tookAction(): void
  getOutputs(): Record<string, string>
  didTakeAction(): boolean
}

export interface PluginConfiguration {
  enabled: boolean
  [key: string]: unknown
}

export type IssueHandler = (
  payload: IssueEventPayload,
  context: EventContext,
  agent: PluginAgent
) => Promise<HandlerResult>

export type IssueCommentHandler = (
  payload: IssueEventPayload & {
    comment: {
      id: number
      body: string
      user: {
        login: string
      }
      html_url: string
    }
  },
  context: EventContext,
  agent: PluginAgent
) => Promise<HandlerResult>

export type PullRequestHandler = (
  payload: PullRequestEventPayload,
  context: EventContext,
  agent: PluginAgent
) => Promise<HandlerResult>

export type PushEventHandler = (
  payload: PushEventPayload,
  context: EventContext,
  agent: PluginAgent
) => Promise<HandlerResult>

export type ReviewEventHandler = (
  payload: ReviewEventPayload,
  context: EventContext,
  agent: PluginAgent
) => Promise<HandlerResult>

export type StatusEventHandler = (
  payload: StatusEventPayload,
  context: EventContext,
  agent: PluginAgent
) => Promise<HandlerResult>

export type GenericCommentHandler = (
  payload: GitHubEventPayload & {
    comment?: {
      id: number
      body: string
      user: {
        login: string
      }
      html_url: string
    }
    issue?: {
      number: number
      title: string
      html_url: string
      state?: string
    }
    pull_request?: {
      number: number
      title: string
      html_url: string
      state?: string
    }
    review?: {
      id: number
      body?: string
      user: {
        login: string
      }
    }
    repository: {
      name: string
      owner: {
        login: string
      }
      full_name: string
    }
  },
  context: EventContext,
  agent: PluginAgent
) => Promise<HandlerResult>

export interface PluginHandlers {
  issue?: IssueHandler
  issueComment?: IssueCommentHandler
  pullRequest?: PullRequestHandler
  push?: PushEventHandler
  review?: ReviewEventHandler
  status?: StatusEventHandler
  genericComment?: GenericCommentHandler
}

export interface PluginHelp {
  description: string
  commands?: Array<{
    name: string
    description: string
    example?: string
  }>
}

export interface Plugin {
  name: string
  handlers: PluginHandlers
  help?: PluginHelp
  config?: PluginConfiguration
}
