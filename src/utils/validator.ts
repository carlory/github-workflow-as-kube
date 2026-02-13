/**
 * Event validation utilities
 */

import type { GitHubEventPayload } from '../types/index.js'

export class EventValidator {
  static isValidEvent(payload: unknown): payload is GitHubEventPayload {
    return typeof payload === 'object' && payload !== null
  }

  static hasRepository(payload: GitHubEventPayload): boolean {
    return (
      'repository' in payload &&
      typeof payload.repository === 'object' &&
      payload.repository !== null
    )
  }

  static hasIssue(payload: GitHubEventPayload): boolean {
    return (
      'issue' in payload &&
      typeof payload.issue === 'object' &&
      payload.issue !== null
    )
  }

  static hasPullRequest(payload: GitHubEventPayload): boolean {
    return (
      'pull_request' in payload &&
      typeof payload.pull_request === 'object' &&
      payload.pull_request !== null
    )
  }

  static hasComment(payload: GitHubEventPayload): boolean {
    return (
      'comment' in payload &&
      typeof payload.comment === 'object' &&
      payload.comment !== null
    )
  }

  static hasReview(payload: GitHubEventPayload): boolean {
    return (
      'review' in payload &&
      typeof payload.review === 'object' &&
      payload.review !== null
    )
  }
}
