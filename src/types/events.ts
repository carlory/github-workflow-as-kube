/**
 * GitHub event payload type definitions
 *
 * Uses official types from @actions/github for accuracy and completeness
 */

import { context } from '@actions/github'

// Extract WebhookPayload type from context
type WebhookPayload = typeof context.payload

// Re-export base payload type
export type GitHubEventPayload = WebhookPayload

// Issue comment event (for comments on issues or pull requests)
export type IssueCommentEventPayload = WebhookPayload & {
  action: 'created' | 'edited' | 'deleted'
  issue: NonNullable<WebhookPayload['issue']>
  comment: NonNullable<WebhookPayload['comment']>
  repository: NonNullable<WebhookPayload['repository']>
  sender: NonNullable<WebhookPayload['sender']>
}

// Issue event (for issues that are NOT pull requests)
export type IssueEventPayload = WebhookPayload & {
  action: string
  issue: NonNullable<WebhookPayload['issue']>
  repository: NonNullable<WebhookPayload['repository']>
  sender: NonNullable<WebhookPayload['sender']>
}

// Pull request event
export type PullRequestEventPayload = WebhookPayload & {
  action: string
  pull_request: NonNullable<WebhookPayload['pull_request']>
  repository: NonNullable<WebhookPayload['repository']>
  sender: NonNullable<WebhookPayload['sender']>
}

// Push event
export type PushEventPayload = WebhookPayload & {
  ref: string
  before: string
  after: string
  repository: NonNullable<WebhookPayload['repository']>
  pusher: {
    name: string
    email: string
    [key: string]: any
  }
  commits: Array<{
    id: string
    message: string
    author: {
      name: string
      email: string
      [key: string]: any
    }
    [key: string]: any
  }>
  sender: NonNullable<WebhookPayload['sender']>
}

// Pull request review event
export type ReviewEventPayload = WebhookPayload & {
  action: string
  review: {
    id: number
    body?: string
    state: string
    user: {
      login: string
      [key: string]: any
    }
    html_url: string
    [key: string]: any
  }
  pull_request: NonNullable<WebhookPayload['pull_request']>
  repository: NonNullable<WebhookPayload['repository']>
  sender: NonNullable<WebhookPayload['sender']>
}

// Status event
export type StatusEventPayload = WebhookPayload & {
  sha: string
  state: string
  description?: string
  target_url?: string
  context: string
  repository: NonNullable<WebhookPayload['repository']>
  sender: NonNullable<WebhookPayload['sender']>
}
