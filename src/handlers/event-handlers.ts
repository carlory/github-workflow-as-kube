/**
 * Event handlers for processing GitHub events
 */

import type {
  EventContext,
  IssueEventPayload,
  PullRequestEventPayload,
  PushEventPayload,
  ReviewEventPayload,
  GitHubEventPayload,
  HandlerResult
} from '../types/index.js'
import { PluginRegistry } from '../plugins/registry.js'
import { PluginAgentImpl } from '../plugins/plugin-agent.js'
import { Logger } from '../utils/logger.js'

export class EventHandlers {
  constructor(private registry: PluginRegistry) {}

  async handleIssueEvent(
    payload: IssueEventPayload,
    context: EventContext
  ): Promise<Map<string, HandlerResult>> {
    const logger = new Logger(context.eventName, context.eventGUID)
    const handlers = this.registry.getIssueHandlers()

    logger.info(`Processing issue event with ${handlers.length} handlers`)

    const startTime = Date.now()
    const results = await Promise.allSettled(
      handlers.map(async ({ plugin, handler }) => {
        const pluginLogger = new Logger(
          context.eventName,
          context.eventGUID,
          plugin.name
        )
        const agent = new PluginAgentImpl()

        try {
          pluginLogger.info('Executing handler')
          const result = await handler(payload, context, agent)
          pluginLogger.info(
            `Handler completed: ${result.success ? 'success' : 'failure'}`
          )
          return { pluginName: plugin.name, result }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          pluginLogger.error(`Handler failed: ${errorMessage}`)
          return {
            pluginName: plugin.name,
            result: {
              success: false,
              tookAction: false,
              message: errorMessage
            }
          }
        }
      })
    )

    const elapsed = Date.now() - startTime
    logger.info(`Completed ${handlers.length} handlers in ${elapsed}ms`)

    const resultMap = new Map<string, HandlerResult>()
    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap.set(result.value.pluginName, result.value.result)
      }
    }

    return resultMap
  }

  async handlePullRequestEvent(
    payload: PullRequestEventPayload,
    context: EventContext
  ): Promise<Map<string, HandlerResult>> {
    const logger = new Logger(context.eventName, context.eventGUID)
    const handlers = this.registry.getPullRequestHandlers()

    logger.info(
      `Processing pull request event with ${handlers.length} handlers`
    )

    const startTime = Date.now()
    const results = await Promise.allSettled(
      handlers.map(async ({ plugin, handler }) => {
        const pluginLogger = new Logger(
          context.eventName,
          context.eventGUID,
          plugin.name
        )
        const agent = new PluginAgentImpl()

        try {
          pluginLogger.info('Executing handler')
          const result = await handler(payload, context, agent)
          pluginLogger.info(
            `Handler completed: ${result.success ? 'success' : 'failure'}`
          )
          return { pluginName: plugin.name, result }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          pluginLogger.error(`Handler failed: ${errorMessage}`)
          return {
            pluginName: plugin.name,
            result: {
              success: false,
              tookAction: false,
              message: errorMessage
            }
          }
        }
      })
    )

    const elapsed = Date.now() - startTime
    logger.info(`Completed ${handlers.length} handlers in ${elapsed}ms`)

    const resultMap = new Map<string, HandlerResult>()
    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap.set(result.value.pluginName, result.value.result)
      }
    }

    return resultMap
  }

  async handlePushEvent(
    payload: PushEventPayload,
    context: EventContext
  ): Promise<Map<string, HandlerResult>> {
    const logger = new Logger(context.eventName, context.eventGUID)
    const handlers = this.registry.getPushHandlers()

    logger.info(`Processing push event with ${handlers.length} handlers`)

    const startTime = Date.now()
    const results = await Promise.allSettled(
      handlers.map(async ({ plugin, handler }) => {
        const pluginLogger = new Logger(
          context.eventName,
          context.eventGUID,
          plugin.name
        )
        const agent = new PluginAgentImpl()

        try {
          pluginLogger.info('Executing handler')
          const result = await handler(payload, context, agent)
          pluginLogger.info(
            `Handler completed: ${result.success ? 'success' : 'failure'}`
          )
          return { pluginName: plugin.name, result }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          pluginLogger.error(`Handler failed: ${errorMessage}`)
          return {
            pluginName: plugin.name,
            result: {
              success: false,
              tookAction: false,
              message: errorMessage
            }
          }
        }
      })
    )

    const elapsed = Date.now() - startTime
    logger.info(`Completed ${handlers.length} handlers in ${elapsed}ms`)

    const resultMap = new Map<string, HandlerResult>()
    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap.set(result.value.pluginName, result.value.result)
      }
    }

    return resultMap
  }

  async handleIssueCommentEvent(
    payload: IssueEventPayload & {
      comment: {
        id: number
        body: string
        user: { login: string }
        html_url: string
      }
    },
    context: EventContext
  ): Promise<Map<string, HandlerResult>> {
    const logger = new Logger(context.eventName, context.eventGUID)
    const handlers = this.registry.getIssueCommentHandlers()

    logger.info(
      `Processing issue comment event with ${handlers.length} handlers`
    )

    const startTime = Date.now()
    const results = await Promise.allSettled(
      handlers.map(async ({ plugin, handler }) => {
        const pluginLogger = new Logger(
          context.eventName,
          context.eventGUID,
          plugin.name
        )
        const agent = new PluginAgentImpl()

        try {
          pluginLogger.info('Executing handler')
          const result = await handler(payload, context, agent)
          pluginLogger.info(
            `Handler completed: ${result.success ? 'success' : 'failure'}`
          )
          return { pluginName: plugin.name, result }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          pluginLogger.error(`Handler failed: ${errorMessage}`)
          return {
            pluginName: plugin.name,
            result: {
              success: false,
              tookAction: false,
              message: errorMessage
            }
          }
        }
      })
    )

    const elapsed = Date.now() - startTime
    logger.info(`Completed ${handlers.length} handlers in ${elapsed}ms`)

    const resultMap = new Map<string, HandlerResult>()
    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap.set(result.value.pluginName, result.value.result)
      }
    }

    return resultMap
  }

  async handleReviewEvent(
    payload: ReviewEventPayload,
    context: EventContext
  ): Promise<Map<string, HandlerResult>> {
    const logger = new Logger(context.eventName, context.eventGUID)
    const handlers = this.registry.getReviewHandlers()

    logger.info(`Processing review event with ${handlers.length} handlers`)

    const startTime = Date.now()
    const results = await Promise.allSettled(
      handlers.map(async ({ plugin, handler }) => {
        const pluginLogger = new Logger(
          context.eventName,
          context.eventGUID,
          plugin.name
        )
        const agent = new PluginAgentImpl()

        try {
          pluginLogger.info('Executing handler')
          const result = await handler(payload, context, agent)
          pluginLogger.info(
            `Handler completed: ${result.success ? 'success' : 'failure'}`
          )
          return { pluginName: plugin.name, result }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          pluginLogger.error(`Handler failed: ${errorMessage}`)
          return {
            pluginName: plugin.name,
            result: {
              success: false,
              tookAction: false,
              message: errorMessage
            }
          }
        }
      })
    )

    const elapsed = Date.now() - startTime
    logger.info(`Completed ${handlers.length} handlers in ${elapsed}ms`)

    const resultMap = new Map<string, HandlerResult>()
    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap.set(result.value.pluginName, result.value.result)
      }
    }

    return resultMap
  }

  async handleReviewCommentEvent(
    payload: GitHubEventPayload,
    context: EventContext
  ): Promise<Map<string, HandlerResult>> {
    return this.handleGenericCommentEvent(payload, context)
  }

  async handleGenericCommentEvent(
    payload: GitHubEventPayload,
    context: EventContext
  ): Promise<Map<string, HandlerResult>> {
    const logger = new Logger(context.eventName, context.eventGUID)
    const handlers = this.registry.getGenericCommentHandlers()

    logger.info(
      `Processing generic comment event with ${handlers.length} handlers`
    )

    const startTime = Date.now()
    const results = await Promise.allSettled(
      handlers.map(async ({ plugin, handler }) => {
        const pluginLogger = new Logger(
          context.eventName,
          context.eventGUID,
          plugin.name
        )
        const agent = new PluginAgentImpl()

        try {
          pluginLogger.info('Executing handler')
          const result = await handler(
            payload as Parameters<typeof handler>[0],
            context,
            agent
          )
          pluginLogger.info(
            `Handler completed: ${result.success ? 'success' : 'failure'}`
          )
          return { pluginName: plugin.name, result, agent }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          pluginLogger.error(`Handler failed: ${errorMessage}`)
          return {
            pluginName: plugin.name,
            result: {
              success: false,
              tookAction: false,
              message: errorMessage
            },
            agent
          }
        }
      })
    )

    const elapsed = Date.now() - startTime
    logger.info(`Completed ${handlers.length} handlers in ${elapsed}ms`)

    const resultMap = new Map<string, HandlerResult>()
    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap.set(result.value.pluginName, result.value.result)
      }
    }

    return resultMap
  }
}
