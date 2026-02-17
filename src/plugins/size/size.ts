/**
 * Size plugin - Labels PRs based on the number of lines changed
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/size/size.go
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

const LABEL_PREFIX = 'size/'
const LABEL_XS = 'size/XS'
const LABEL_S = 'size/S'
const LABEL_M = 'size/M'
const LABEL_L = 'size/L'
const LABEL_XL = 'size/XL'
const LABEL_XXL = 'size/XXL'

enum Size {
  XS,
  S,
  M,
  L,
  XL,
  XXL
}

interface SizeThresholds {
  s: number
  m: number
  l: number
  xl: number
  xxl: number
}

const DEFAULT_SIZES: SizeThresholds = {
  s: 10,
  m: 30,
  l: 100,
  xl: 500,
  xxl: 1000
}

/**
 * Determines the size category based on line count
 */
function bucket(lineCount: number, sizes: SizeThresholds): Size {
  if (lineCount < sizes.s) {
    return Size.XS
  } else if (lineCount < sizes.m) {
    return Size.S
  } else if (lineCount < sizes.l) {
    return Size.M
  } else if (lineCount < sizes.xl) {
    return Size.L
  } else if (lineCount < sizes.xxl) {
    return Size.XL
  }
  return Size.XXL
}

/**
 * Converts a size enum to its label string
 */
function sizeToLabel(size: Size): string {
  switch (size) {
    case Size.XS:
      return LABEL_XS
    case Size.S:
      return LABEL_S
    case Size.M:
      return LABEL_M
    case Size.L:
      return LABEL_L
    case Size.XL:
      return LABEL_XL
    case Size.XXL:
      return LABEL_XXL
    default:
      return LABEL_XS
  }
}

/**
 * Checks if the PR action should trigger size calculation
 */
function isPRChanged(action: string): boolean {
  return (
    action === 'opened' ||
    action === 'reopened' ||
    action === 'synchronize' ||
    action === 'edited'
  )
}

const pullRequestHandler: PullRequestHandler = async (
  payload: PullRequestEventPayload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'size')

  try {
    const action = payload.action
    if (!action || !isPRChanged(action)) {
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

    logger.info(`Processing PR #${prNumber} for size labeling`)

    // Get PR files and calculate total changes
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100
    })

    let totalChanges = 0
    for (const file of files) {
      // Count additions and deletions
      totalChanges += file.additions + file.deletions
    }

    logger.info(`Total lines changed: ${totalChanges}`)

    // Use default sizes (can be made configurable in the future)
    const sizes = DEFAULT_SIZES
    const newSize = bucket(totalChanges, sizes)
    const newLabel = sizeToLabel(newSize)

    logger.info(`Calculated size label: ${newLabel}`)

    // Get current labels
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: prNumber
    })

    const labels = issue.labels.map((l) =>
      typeof l === 'string' ? l : l.name || ''
    )

    // Check if the correct label is already present
    const hasCorrectLabel = labels.includes(newLabel)

    // Remove old size labels
    const oldSizeLabels = labels.filter((label) =>
      label.startsWith(LABEL_PREFIX)
    )

    for (const oldLabel of oldSizeLabels) {
      if (oldLabel !== newLabel) {
        logger.info(`Removing old label: ${oldLabel}`)
        try {
          await octokit.rest.issues.removeLabel({
            owner,
            repo,
            issue_number: prNumber,
            name: oldLabel
          })
        } catch (error) {
          // Ignore errors when removing labels (might not exist)
          logger.warning(`Failed to remove label ${oldLabel}: ${error}`)
        }
      }
    }

    // Add the new label if not already present
    if (!hasCorrectLabel) {
      logger.info(`Adding new label: ${newLabel}`)
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels: [newLabel]
      })

      agent.tookAction()
      agent.setOutput('size_label', newLabel)
      agent.setOutput('size_lines', totalChanges.toString())
      agent.setOutput('issue_number', prNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Added ${newLabel} label to PR #${prNumber} (${totalChanges} lines changed)`
      }
    }

    logger.info(`Label ${newLabel} already present, no action needed`)
    return {
      success: true,
      tookAction: false
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Size plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const sizePlugin: Plugin = {
  name: 'size',
  handlers: {
    pullRequest: pullRequestHandler
  },
  help: {
    description:
      "Automatically labels pull requests based on the number of lines changed. Labels range from 'size/XS' for very small changes to 'size/XXL' for very large changes.",
    commands: []
  }
}
