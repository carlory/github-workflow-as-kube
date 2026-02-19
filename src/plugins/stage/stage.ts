/**
 * Stage plugin - Labels the stage of an issue as alpha/beta/stable
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/stage/stage.go
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

const STAGE_ALPHA = 'stage/alpha'
const STAGE_BETA = 'stage/beta'
const STAGE_STABLE = 'stage/stable'
const STAGE_LABELS = [STAGE_ALPHA, STAGE_BETA, STAGE_STABLE]

// Regex to match /stage and /remove-stage commands
const stageRe = /^\/(?:(remove)-)?stage\s+(alpha|beta|stable)\s*$/im

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'stage')

  try {
    const comment = payload.comment
    if (!comment || !comment.body) {
      return {
        success: true,
        tookAction: false
      }
    }

    const issueNumber = payload.issue?.number || payload.pull_request?.number
    if (!issueNumber) {
      return {
        success: true,
        tookAction: false
      }
    }

    const body = comment.body.trim()

    // Find all matches in the comment
    const matches = Array.from(body.matchAll(new RegExp(stageRe, 'gim')))
    if (matches.length === 0) {
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

    let tookAction = false

    // Process each match
    for (const match of matches) {
      const remove = match[1] === 'remove'
      const stage = match[2]
      const label = `stage/${stage}`

      const hasLabel = labels.includes(label)

      // If the label exists and we asked for it to be removed, remove it
      if (hasLabel && remove) {
        await octokit.rest.issues.removeLabel({
          owner,
          repo,
          issue_number: issueNumber,
          name: label
        })
        logger.info(`Removed ${label} label from #${issueNumber}`)
        tookAction = true
      }

      // If the label does not exist and we asked for it to be added,
      // remove other existing stage labels and add it
      if (!hasLabel && !remove) {
        // Remove other stage labels
        for (const stageLabel of STAGE_LABELS) {
          if (stageLabel !== label && labels.includes(stageLabel)) {
            await octokit.rest.issues.removeLabel({
              owner,
              repo,
              issue_number: issueNumber,
              name: stageLabel
            })
            logger.info(
              `Removed ${stageLabel} label from #${issueNumber} (mutual exclusion)`
            )
          }
        }

        // Add the requested label
        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: issueNumber,
          labels: [label]
        })
        logger.info(`Added ${label} label to #${issueNumber}`)
        tookAction = true
      }
    }

    if (tookAction) {
      agent.tookAction()
      agent.setOutput('stage_action', 'stage-updated')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Updated stage labels on #${issueNumber}`
      }
    }

    return {
      success: true,
      tookAction: false
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Stage plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const stagePlugin: Plugin = {
  name: 'stage',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description:
      'Label the stage of an issue as alpha/beta/stable. Only one stage label can be applied at a time.',
    commands: [
      {
        name: '/stage alpha',
        description: "Applies the 'stage/alpha' label to an issue",
        example: '/stage alpha'
      },
      {
        name: '/stage beta',
        description: "Applies the 'stage/beta' label to an issue",
        example: '/stage beta'
      },
      {
        name: '/stage stable',
        description: "Applies the 'stage/stable' label to an issue",
        example: '/stage stable'
      },
      {
        name: '/remove-stage alpha',
        description: "Removes the 'stage/alpha' label from an issue",
        example: '/remove-stage alpha'
      },
      {
        name: '/remove-stage beta',
        description: "Removes the 'stage/beta' label from an issue",
        example: '/remove-stage beta'
      },
      {
        name: '/remove-stage stable',
        description: "Removes the 'stage/stable' label from an issue",
        example: '/remove-stage stable'
      }
    ]
  }
}
