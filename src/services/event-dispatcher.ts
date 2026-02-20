/**
 * Event dispatcher service for orchestrating event processing
 */

import * as core from '@actions/core'
import * as github from '@actions/github'
import type { EventContext, GitHubEventPayload } from '../types/index.js'
import { PluginRegistry } from '../plugins/registry.js'
import { EventHandlers } from '../handlers/event-handlers.js'
import { catPlugin } from '../plugins/cat/cat.js'
import { dogPlugin } from '../plugins/dog/dog.js'
import { helpPlugin } from '../plugins/help/help.js'
import { holdPlugin } from '../plugins/hold/hold.js'
import { assignPlugin } from '../plugins/assign/assign.js'
import { mergeCommitBlockerPlugin } from '../plugins/merge-commit-blocker/merge-commit-blocker.js'
import { ponyPlugin } from '../plugins/pony/pony.js'
import { shrugPlugin } from '../plugins/shrug/shrug.js'
import { sizePlugin } from '../plugins/size/size.js'
import { stagePlugin } from '../plugins/stage/stage.js'
import { wipPlugin } from '../plugins/wip/wip.js'
import { yuksPlugin } from '../plugins/yuks/yuks.js'
import { Logger } from '../utils/logger.js'
import { EventValidator } from '../utils/validator.js'

export class EventDispatcher {
  private registry: PluginRegistry
  private handlers: EventHandlers
  private context: EventContext
  private logger: Logger

  constructor() {
    this.registry = new PluginRegistry()
    this.handlers = new EventHandlers(this.registry)
    this.context = this.initializeContext()
    this.logger = new Logger(this.context.eventName, this.context.eventGUID)
  }

  private initializeContext(): EventContext {
    const context = github.context

    return {
      eventName: context.eventName,
      eventGUID: context.runId.toString(),
      repository: context.repo.owner + '/' + context.repo.repo,
      sha: context.sha,
      ref: context.ref,
      actor: context.actor,
      workflow: context.workflow,
      runId: context.runId.toString(),
      runNumber: context.runNumber.toString()
    }
  }

  private registerBuiltInPlugins(enabledPlugins: string[]): void {
    const plugins = [
      assignPlugin,
      catPlugin,
      dogPlugin,
      helpPlugin,
      holdPlugin,
      mergeCommitBlockerPlugin,
      ponyPlugin,
      shrugPlugin,
      sizePlugin,
      stagePlugin,
      wipPlugin,
      yuksPlugin
    ]

    for (const plugin of plugins) {
      if (enabledPlugins.includes(plugin.name)) {
        plugin.config = { enabled: true }
        this.registry.register(plugin)
        this.logger.info(`Registered plugin: ${plugin.name}`)
      }
    }
  }

  async dispatch(): Promise<void> {
    try {
      this.logger.info('Starting event dispatch')

      const token = core.getInput('github-token', { required: true })
      process.env.GITHUB_TOKEN = token

      const pluginsInput = core.getInput('plugins') || 'dog'
      const enabledPlugins = pluginsInput
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)

      this.logger.info(`Enabled plugins: ${enabledPlugins.join(', ')}`)

      this.registerBuiltInPlugins(enabledPlugins)

      const payload = github.context.payload as GitHubEventPayload

      if (!EventValidator.isValidEvent(payload)) {
        throw new Error('Invalid event payload')
      }

      await this.demuxEvent(payload)

      // Create workflow data object with all relevant information
      const workflowData = {
        context: this.context,
        payload,
        inputs: {
          'github-token': '***', // Mask the token for security
          plugins: pluginsInput
        },
        environment: {
          GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW,
          GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
          GITHUB_RUN_NUMBER: process.env.GITHUB_RUN_NUMBER,
          GITHUB_ACTION: process.env.GITHUB_ACTION,
          GITHUB_ACTOR: process.env.GITHUB_ACTOR,
          GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
          GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
          GITHUB_SHA: process.env.GITHUB_SHA,
          GITHUB_REF: process.env.GITHUB_REF
        }
      }

      // Print workflow data as JSON
      const workflowDataJson = JSON.stringify(workflowData, null, 2)
      this.logger.info('Workflow data (JSON format):')
      console.log(workflowDataJson)

      core.setOutput('event_name', this.context.eventName)
      core.setOutput('event_guid', this.context.eventGUID)
      core.setOutput('repository', this.context.repository)
      core.setOutput('plugins_enabled', enabledPlugins.join(','))
      core.setOutput('workflow_data', workflowDataJson)

      this.logger.info('Event dispatch completed')
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Event dispatch failed: ${errorMessage}`)
      core.setFailed(errorMessage)
    }
  }

  private async demuxEvent(payload: GitHubEventPayload): Promise<void> {
    const eventName = this.context.eventName

    this.logger.info(`Demuxing event: ${eventName}`)

    switch (eventName) {
      case 'issues':
        if (EventValidator.hasIssue(payload)) {
          await this.handlers.handleIssueEvent(
            payload as Parameters<typeof this.handlers.handleIssueEvent>[0],
            this.context
          )
        }
        break

      case 'issue_comment':
        if (
          EventValidator.hasComment(payload) &&
          EventValidator.hasIssue(payload)
        ) {
          await this.handlers.handleGenericCommentEvent(payload, this.context)
        }
        break

      case 'pull_request':
        if (EventValidator.hasPullRequest(payload)) {
          await this.handlers.handlePullRequestEvent(
            payload as Parameters<
              typeof this.handlers.handlePullRequestEvent
            >[0],
            this.context
          )
        }
        break

      case 'pull_request_review':
        if (EventValidator.hasReview(payload)) {
          await this.handlers.handleGenericCommentEvent(payload, this.context)
        }
        break

      case 'pull_request_review_comment':
        if (EventValidator.hasComment(payload)) {
          await this.handlers.handleGenericCommentEvent(payload, this.context)
        }
        break

      case 'push':
        await this.handlers.handlePushEvent(
          payload as Parameters<typeof this.handlers.handlePushEvent>[0],
          this.context
        )
        break

      default:
        this.logger.info(`No handler for event type: ${eventName}`)
    }
  }
}
