/**
 * Hold plugin - Adds/removes do-not-merge/hold label from PRs
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/hold/hold.go
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

const HOLD_LABEL = 'do-not-merge/hold'

const holdRe = /^\/hold(\s.*)?$/im
const holdCancelRe = /^\/(remove-hold|hold\s+cancel|unhold)(\s.*)?$/im

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'hold')

  try {
    const comment = payload.comment
    if (!comment || !comment.body) {
      return {
        success: true,
        tookAction: false
      }
    }

    // Only process pull requests (check issue.pull_request for issue_comment events)
    if (!payload.issue?.pull_request) {
      return {
        success: true,
        tookAction: false
      }
    }

    const issueNumber = payload.issue.number
    const issueState = payload.issue.state

    // Only process open PRs
    if (issueState !== 'open') {
      return {
        success: true,
        tookAction: false
      }
    }

    const body = comment.body.trim()

    // Determine if we need to add or remove the label
    let needsLabel: boolean | null = null
    if (holdCancelRe.test(body)) {
      needsLabel = false
    } else if (holdRe.test(body)) {
      needsLabel = true
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
    const hasLabel = labels.includes(HOLD_LABEL)

    if (hasLabel && !needsLabel) {
      logger.info(`Removing ${HOLD_LABEL} label from #${issueNumber}`)
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: HOLD_LABEL
      })

      agent.tookAction()
      agent.setOutput('hold_action', 'hold-removed')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Removed ${HOLD_LABEL} label from #${issueNumber}`
      }
    } else if (!hasLabel && needsLabel) {
      logger.info(`Adding ${HOLD_LABEL} label to #${issueNumber}`)
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: [HOLD_LABEL]
      })

      agent.tookAction()
      agent.setOutput('hold_action', 'hold-added')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Added ${HOLD_LABEL} label to #${issueNumber}`
      }
    }

    return {
      success: true,
      tookAction: false
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Hold plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const holdPlugin: Plugin = {
  name: 'hold',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description:
      "Adds or removes the 'do-not-merge/hold' label from pull requests to temporarily prevent merging without withholding approval.",
    commands: [
      {
        name: '/hold',
        description: "Applies the 'do-not-merge/hold' label to a PR",
        example: '/hold'
      },
      {
        name: '/hold cancel',
        description: "Removes the 'do-not-merge/hold' label from a PR",
        example: '/hold cancel'
      },
      {
        name: '/unhold',
        description:
          "Removes the 'do-not-merge/hold' label from a PR (alias for /hold cancel)",
        example: '/unhold'
      },
      {
        name: '/remove-hold',
        description:
          "Removes the 'do-not-merge/hold' label from a PR (alias for /hold cancel)",
        example: '/remove-hold'
      }
    ]
  }
}
