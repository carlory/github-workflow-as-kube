/**
 * Assign plugin - Assigns/unassigns users to issues/PRs and requests/unrequests reviews
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/assign/assign.go
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

// Matches /assign or /unassign with optional space-separated logins (within a single line)
const assignRe = /^(\/unassign|\/assign)((?:[ \t]+@?[-\w]+)*)[ \t]*$/im

// Matches /cc or /uncc with optional space-separated logins (within a single line)
const ccRe = /^(\/(un)?cc)((?:[ \t]+@?[-/\w]+)*)[ \t]*$/im

/**
 * Parses space-separated logins from the arguments portion of a command,
 * stripping leading '@' characters.
 */
function parseLogins(text: string): string[] {
  return text
    .split(/\s+/)
    .map((p) => p.replace(/^@/, '').trim())
    .filter((p) => p.length > 0)
}

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'assign')

  try {
    const comment = payload.comment
    if (!comment?.body) {
      return { success: true, tookAction: false }
    }

    const body = comment.body
    const commenter = comment.user.login
    const [owner, repo] = payload.repository.full_name.split('/')

    // Determine the issue/PR number
    const issueNumber =
      payload.issue?.number ?? payload.pull_request?.number ?? null
    if (!issueNumber) {
      return { success: true, tookAction: false }
    }

    const token = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('GITHUB_TOKEN not found')
    }

    const octokit = getOctokit(token)
    let assignTookAction = false
    let ccTookAction = false

    // --- Handle /assign and /unassign ---
    const assignMatches = [...body.matchAll(new RegExp(assignRe.source, 'gim'))]
    if (assignMatches.length > 0) {
      const toAdd: string[] = []
      const toRemove: string[] = []

      for (const match of assignMatches) {
        const isUnassign = match[1].toLowerCase() === '/unassign'
        const loginsText = match[2] ?? ''
        const logins =
          loginsText.trim().length > 0 ? parseLogins(loginsText) : [commenter]

        if (isUnassign) {
          toRemove.push(...logins)
        } else {
          toAdd.push(...logins)
        }
      }

      if (toRemove.length > 0) {
        logger.info(
          `Removing assignees from ${owner}/${repo}#${issueNumber}: ${toRemove.join(', ')}`
        )
        await octokit.rest.issues.removeAssignees({
          owner,
          repo,
          issue_number: issueNumber,
          assignees: toRemove
        })
        assignTookAction = true
      }

      if (toAdd.length > 0) {
        logger.info(
          `Adding assignees to ${owner}/${repo}#${issueNumber}: ${toAdd.join(', ')}`
        )
        await octokit.rest.issues.addAssignees({
          owner,
          repo,
          issue_number: issueNumber,
          assignees: toAdd
        })
        assignTookAction = true
      }

      if (assignTookAction) {
        agent.tookAction()
        agent.setOutput('assign_action', 'assignees-updated')
        agent.setOutput('issue_number', issueNumber.toString())
      }
    }

    // --- Handle /cc and /uncc (only for PRs) ---
    const isPR = !!(payload.issue?.pull_request ?? payload.pull_request)
    if (isPR) {
      const ccMatches = [...body.matchAll(new RegExp(ccRe.source, 'gim'))]
      if (ccMatches.length > 0) {
        const toRequest: string[] = []
        const toUnrequest: string[] = []

        for (const match of ccMatches) {
          const isUncc = match[2] === 'un'
          const loginsText = match[3] ?? ''
          const logins =
            loginsText.trim().length > 0 ? parseLogins(loginsText) : [commenter]

          if (isUncc) {
            toUnrequest.push(...logins)
          } else {
            toRequest.push(...logins)
          }
        }

        if (toUnrequest.length > 0) {
          logger.info(
            `Removing review requests from ${owner}/${repo}#${issueNumber}: ${toUnrequest.join(', ')}`
          )
          await octokit.rest.pulls.removeRequestedReviewers({
            owner,
            repo,
            pull_number: issueNumber,
            reviewers: toUnrequest
          })
          ccTookAction = true
        }

        if (toRequest.length > 0) {
          logger.info(
            `Requesting reviews on ${owner}/${repo}#${issueNumber}: ${toRequest.join(', ')}`
          )
          await octokit.rest.pulls.requestReviewers({
            owner,
            repo,
            pull_number: issueNumber,
            reviewers: toRequest
          })
          ccTookAction = true
        }

        if (ccTookAction) {
          agent.tookAction()
          agent.setOutput('assign_action', 'reviewers-updated')
          agent.setOutput('issue_number', issueNumber.toString())
        }
      }
    }

    return { success: true, tookAction: assignTookAction || ccTookAction }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Assign plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return { success: false, tookAction: false, message: errorMessage }
  }
}

export const assignPlugin: Plugin = {
  name: 'assign',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description:
      'Assigns or unassigns users to issues/PRs, and requests or unrequests reviews from users on PRs.',
    commands: [
      {
        name: '/assign',
        description:
          'Assigns the commenter or specified user(s) to the issue or PR',
        example: '/assign @user1 @user2'
      },
      {
        name: '/unassign',
        description:
          'Removes the commenter or specified user(s) from the issue or PR assignees',
        example: '/unassign @user1'
      },
      {
        name: '/cc',
        description:
          'Requests a review from the commenter or specified user(s) on a PR',
        example: '/cc @user1 @user2'
      },
      {
        name: '/uncc',
        description:
          'Removes a review request from the specified user(s) on a PR',
        example: '/uncc @user1'
      }
    ]
  }
}
