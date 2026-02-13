/**
 * Plugin registry for managing plugins
 */

import type {
  Plugin,
  IssueHandler,
  IssueCommentHandler,
  PullRequestHandler,
  PushEventHandler,
  ReviewEventHandler,
  GenericCommentHandler
} from '../types/index.js'

export class PluginRegistry {
  private plugins = new Map<string, Plugin>()

  register(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin)
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name)
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  getEnabled(): Plugin[] {
    return this.getAll().filter((plugin) => plugin.config?.enabled !== false)
  }

  getIssueHandlers(): Array<{ plugin: Plugin; handler: IssueHandler }> {
    const result: Array<{ plugin: Plugin; handler: IssueHandler }> = []
    for (const plugin of this.getEnabled()) {
      if (plugin.handlers.issue) {
        result.push({ plugin, handler: plugin.handlers.issue })
      }
    }
    return result
  }

  getPullRequestHandlers(): Array<{
    plugin: Plugin
    handler: PullRequestHandler
  }> {
    const result: Array<{ plugin: Plugin; handler: PullRequestHandler }> = []
    for (const plugin of this.getEnabled()) {
      if (plugin.handlers.pullRequest) {
        result.push({ plugin, handler: plugin.handlers.pullRequest })
      }
    }
    return result
  }

  getPushHandlers(): Array<{ plugin: Plugin; handler: PushEventHandler }> {
    const result: Array<{ plugin: Plugin; handler: PushEventHandler }> = []
    for (const plugin of this.getEnabled()) {
      if (plugin.handlers.push) {
        result.push({ plugin, handler: plugin.handlers.push })
      }
    }
    return result
  }

  getIssueCommentHandlers(): Array<{
    plugin: Plugin
    handler: IssueCommentHandler
  }> {
    const result: Array<{ plugin: Plugin; handler: IssueCommentHandler }> = []
    for (const plugin of this.getEnabled()) {
      if (plugin.handlers.issueComment) {
        result.push({ plugin, handler: plugin.handlers.issueComment })
      }
    }
    return result
  }

  getReviewHandlers(): Array<{ plugin: Plugin; handler: ReviewEventHandler }> {
    const result: Array<{ plugin: Plugin; handler: ReviewEventHandler }> = []
    for (const plugin of this.getEnabled()) {
      if (plugin.handlers.review) {
        result.push({ plugin, handler: plugin.handlers.review })
      }
    }
    return result
  }

  getGenericCommentHandlers(): Array<{
    plugin: Plugin
    handler: GenericCommentHandler
  }> {
    const result: Array<{ plugin: Plugin; handler: GenericCommentHandler }> = []
    for (const plugin of this.getEnabled()) {
      if (plugin.handlers.genericComment) {
        result.push({ plugin, handler: plugin.handlers.genericComment })
      }
    }
    return result
  }
}
