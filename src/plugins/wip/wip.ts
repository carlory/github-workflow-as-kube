/**
 * WIP (Work In Progress) plugin - Manages work-in-progress label on PRs
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/wip/wip-label.go
 */

import { getOctokit } from '@actions/github'
import type {
  Plugin,
  PullRequestHandler,
  EventContext,
  PluginAgent,
  HandlerResult,
  PullRequestEventPayload
} from '../../types/index.js'
import { Logger } from '../../utils/logger.js'

const WIP_LABEL = 'do-not-merge/work-in-progress'

// Matches WIP prefix in title (case-insensitive, with optional non-word prefix)
// Examples: "WIP: fix bug", "[WIP] feature", "wip - update docs"
const titleRegex = /^\W*WIP\W/i

/**
 * Determines if the PR action should trigger WIP label check
 */
function isPRActionRelevant(action: string): boolean {
  return (
    action === 'opened' ||
    action === 'reopened' ||
    action === 'edited' ||
    action === 'ready_for_review' ||
    action === 'converted_to_draft'
  )
}

const pullRequestHandler: PullRequestHandler = async (
  payload: PullRequestEventPayload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'wip')

  try {
    const action = payload.action
    if (!action || !isPRActionRelevant(action)) {
      logger.info(`Skipping PR action: ${action}`)
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
    const prNumber = payload.pull_request.number
    const title = payload.pull_request.title
    const draft = payload.pull_request.draft || false

    logger.info(`Processing PR #${prNumber} for WIP labeling`)
    logger.info(`Title: "${title}", Draft: ${draft}`)

    // Get current labels
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: prNumber
    })

    const labels = issue.labels.map((l) =>
      typeof l === 'string' ? l : l.name || ''
    )
    const hasLabel = labels.includes(WIP_LABEL)

    // Determine if PR needs WIP label
    const needsLabel = draft || titleRegex.test(title)

    logger.info(
      `hasLabel: ${hasLabel}, needsLabel: ${needsLabel}, titleMatch: ${titleRegex.test(title)}`
    )

    if (needsLabel && !hasLabel) {
      logger.info(`Adding ${WIP_LABEL} label to PR #${prNumber}`)
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels: [WIP_LABEL]
      })

      agent.tookAction()
      agent.setOutput('wip_action', 'label-added')
      agent.setOutput('issue_number', prNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Added ${WIP_LABEL} label to PR #${prNumber}`
      }
    } else if (!needsLabel && hasLabel) {
      logger.info(`Removing ${WIP_LABEL} label from PR #${prNumber}`)
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: WIP_LABEL
      })

      agent.tookAction()
      agent.setOutput('wip_action', 'label-removed')
      agent.setOutput('issue_number', prNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Removed ${WIP_LABEL} label from PR #${prNumber}`
      }
    }

    logger.info(`No action needed for PR #${prNumber}`)
    return {
      success: true,
      tookAction: false
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`WIP plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const wipPlugin: Plugin = {
  name: 'wip',
  handlers: {
    pullRequest: pullRequestHandler
  },
  help: {
    description:
      "The WIP (Work In Progress) plugin applies the 'do-not-merge/work-in-progress' label to pull requests whose title starts with 'WIP' or are in the 'draft' stage, and removes it from pull requests when they remove the title prefix or become ready for review. The 'do-not-merge/work-in-progress' label is typically used to block a pull request from merging while it is still in progress.",
    commands: []
  }
}
