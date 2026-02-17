/**
 * Shrug plugin - Adds/removes shrug label from issues and PRs
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/shrug/shrug.go
 */

import { getOctokit } from '@actions/github'
import type {
  Plugin,
  GenericCommentHandler,
  EventContext,
  PluginAgent,
  HandlerResult
} from '../../types/index.js'
import { Logger } from '../../utils/logger.js'

const SHRUG_LABEL = 'shrug'

const shrugRe = /^\/shrug\s*$/im
const unshrugRe = /^\/unshrug\s*$/im

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'shrug')

  try {
    const comment = payload.comment
    if (!comment || !comment.body) {
      return {
        success: true,
        tookAction: false
      }
    }

    // Get issue or PR number
    const issueNumber =
      payload.issue?.number || payload.pull_request?.number || 0
    if (issueNumber === 0) {
      return {
        success: true,
        tookAction: false
      }
    }

    const issueState = payload.issue?.state || payload.pull_request?.state
    if (issueState !== 'open') {
      return {
        success: true,
        tookAction: false
      }
    }

    const body = comment.body.trim()

    // Determine if we need to add or remove the label
    let wantShrug: boolean | null = null
    if (shrugRe.test(body)) {
      wantShrug = true
    } else if (unshrugRe.test(body)) {
      wantShrug = false
    } else {
      return {
        success: true,
        tookAction: false
      }
    }

    const token = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('GITHUB_TOKEN not found')
    }

    const octokit = getOctokit(token)
    const [owner, repo] = payload.repository.full_name.split('/')

    // Get current labels
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    })

    const labels = issue.labels.map((l) =>
      typeof l === 'string' ? l : l.name || ''
    )
    const hasShrug = labels.includes(SHRUG_LABEL)

    if (hasShrug && !wantShrug) {
      logger.info(`Removing ${SHRUG_LABEL} label from #${issueNumber}`)

      // Post shrug comment when removing label
      const shrugEmoji = '¯\\\\\\_(ツ)\\_/¯'
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: shrugEmoji
      })

      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: SHRUG_LABEL
      })

      agent.tookAction()
      agent.setOutput('shrug_action', 'shrug-removed')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Removed ${SHRUG_LABEL} label from #${issueNumber}`
      }
    } else if (!hasShrug && wantShrug) {
      logger.info(`Adding ${SHRUG_LABEL} label to #${issueNumber}`)
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: [SHRUG_LABEL]
      })

      agent.tookAction()
      agent.setOutput('shrug_action', 'shrug-added')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Added ${SHRUG_LABEL} label to #${issueNumber}`
      }
    }

    return {
      success: true,
      tookAction: false
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Shrug plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const shrugPlugin: Plugin = {
  name: 'shrug',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description:
      'Adds or removes the shrug label from issues and pull requests',
    commands: [
      {
        name: '/shrug',
        description: "Applies the 'shrug' label",
        example: '/shrug'
      },
      {
        name: '/unshrug',
        description: "Removes the 'shrug' label",
        example: '/unshrug'
      }
    ]
  }
}
