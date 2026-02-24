/**
 * Approve plugin - Adds/removes approved label from PRs
 * Based on https://github.com/kubernetes-sigs/prow/tree/main/pkg/plugins/approve
 */

import { getOctokit } from '@actions/github'
import type {
  Plugin,
  GenericCommentHandler,
  PullRequestHandler,
  EventContext,
  PluginAgent,
  HandlerResult
} from '../../types/index.js'
import { Logger } from '../../utils/logger.js'

const APPROVED_LABEL = 'approved'

const approveRe = /^\/approve(\s+no-issue)?\s*$/im
const approveCancelRe = /^\/(remove-approve|approve\s+cancel)\s*$/im

const removeApprovedComment =
  'New changes are detected. Approved label has been removed.'

type Octokit = ReturnType<typeof getOctokit>

async function applyApproval(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  wantApproved: boolean,
  agent: PluginAgent,
  logger: Logger
): Promise<HandlerResult> {
  const { data: issue } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: prNumber
  })

  const labels = issue.labels.map((l) =>
    typeof l === 'string' ? l : l.name || ''
  )
  const hasApproved = labels.includes(APPROVED_LABEL)

  if (hasApproved && !wantApproved) {
    logger.info(`Removing ${APPROVED_LABEL} label from #${prNumber}`)
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prNumber,
      name: APPROVED_LABEL
    })

    agent.tookAction()
    agent.setOutput('approve_action', 'approved-removed')
    agent.setOutput('issue_number', prNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Removed ${APPROVED_LABEL} label from #${prNumber}`
    }
  } else if (!hasApproved && wantApproved) {
    logger.info(`Adding ${APPROVED_LABEL} label to #${prNumber}`)
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: [APPROVED_LABEL]
    })

    agent.tookAction()
    agent.setOutput('approve_action', 'approved-added')
    agent.setOutput('issue_number', prNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Added ${APPROVED_LABEL} label to #${prNumber}`
    }
  }

  return { success: true, tookAction: false }
}

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'approve')

  try {
    const token = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('GITHUB_TOKEN not found')
    }

    const octokit = getOctokit(token)
    const [owner, repo] = payload.repository.full_name.split('/')

    // Handle pull_request_review events
    if (payload.review) {
      // Only react to submitted reviews
      if (payload.action !== 'submitted' || !payload.pull_request) {
        return { success: true, tookAction: false }
      }

      // If review body contains an /approve or /approve cancel command, skip
      // (the comment handler will handle it)
      const reviewBody = payload.review.body || ''
      if (approveRe.test(reviewBody) || approveCancelRe.test(reviewBody)) {
        return { success: true, tookAction: false }
      }

      const reviewState = payload.review.state?.toLowerCase()
      let wantApproved: boolean
      if (reviewState === 'approved') {
        wantApproved = true
      } else if (reviewState === 'changes_requested') {
        wantApproved = false
      } else {
        return { success: true, tookAction: false }
      }

      const prNumber = payload.pull_request.number
      const reviewer = payload.review.user.login
      const prAuthor = payload.pull_request.user?.login

      // Reviewer cannot approve their own PR
      if (prAuthor && reviewer === prAuthor && wantApproved) {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: `@${reviewer} you cannot approve your own PR.`
        })
        return { success: true, tookAction: false }
      }

      return await applyApproval(
        octokit,
        owner,
        repo,
        prNumber,
        wantApproved,
        agent,
        logger
      )
    }

    // Handle issue_comment events
    if (!payload.comment?.body) {
      return { success: true, tookAction: false }
    }

    // Only process pull requests
    if (!payload.issue?.pull_request) {
      return { success: true, tookAction: false }
    }

    // Only process open PRs
    if (payload.issue.state !== 'open') {
      return { success: true, tookAction: false }
    }

    const issueNumber = payload.issue.number
    const body = payload.comment.body.trim()
    const commenter = payload.comment.user.login

    let wantApproved: boolean
    if (approveRe.test(body)) {
      wantApproved = true
    } else if (approveCancelRe.test(body)) {
      wantApproved = false
    } else {
      return { success: true, tookAction: false }
    }

    // Author cannot approve own PR (but can cancel approval)
    const issueAuthor = payload.issue.user?.login
    if (issueAuthor && commenter === issueAuthor && wantApproved) {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: `@${commenter} you cannot approve your own PR.`
      })
      return { success: true, tookAction: false }
    }

    // Check if commenter is a collaborator
    try {
      await octokit.rest.repos.checkCollaborator({
        owner,
        repo,
        username: commenter
      })
    } catch (collaboratorError: unknown) {
      const status = (collaboratorError as { status?: number }).status
      if (status === 404) {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body: `@${commenter} changing approval is restricted to collaborators`
        })
        return { success: true, tookAction: false }
      }
      throw collaboratorError
    }

    return await applyApproval(
      octokit,
      owner,
      repo,
      issueNumber,
      wantApproved,
      agent,
      logger
    )
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Approve plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

const pullRequestHandler: PullRequestHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'approve')

  try {
    // Only handle synchronize events (new commits pushed to a PR)
    if (payload.action !== 'synchronize') {
      return { success: true, tookAction: false }
    }

    const token = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('GITHUB_TOKEN not found')
    }

    const octokit = getOctokit(token)
    const [owner, repo] = payload.repository.full_name.split('/')
    const prNumber = payload.pull_request.number

    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: prNumber
    })

    const labels = issue.labels.map((l) =>
      typeof l === 'string' ? l : l.name || ''
    )

    if (!labels.includes(APPROVED_LABEL)) {
      return { success: true, tookAction: false }
    }

    logger.info(
      `Removing ${APPROVED_LABEL} label from #${prNumber} due to new commits`
    )
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prNumber,
      name: APPROVED_LABEL
    })

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: removeApprovedComment
    })

    agent.tookAction()
    agent.setOutput('approve_action', 'approved-removed')
    agent.setOutput('approve_reason', 'new-commits')
    agent.setOutput('issue_number', prNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Removed ${APPROVED_LABEL} label from #${prNumber} due to new commits`
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Approve plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const approvePlugin: Plugin = {
  name: 'approve',
  handlers: {
    genericComment: genericCommentHandler,
    pullRequest: pullRequestHandler
  },
  help: {
    description:
      "The approve plugin manages the application and removal of the 'approved' label which is used to gate merging. Approval is restricted to collaborators.",
    commands: [
      {
        name: '/approve',
        description: "Adds the 'approved' label to a PR",
        example: '/approve'
      },
      {
        name: '/approve no-issue',
        description:
          "Adds the 'approved' label to a PR without requiring an associated issue",
        example: '/approve no-issue'
      },
      {
        name: '/approve cancel',
        description: "Removes the 'approved' label from a PR",
        example: '/approve cancel'
      },
      {
        name: '/remove-approve',
        description:
          "Removes the 'approved' label from a PR (alias for /approve cancel)",
        example: '/remove-approve'
      }
    ]
  }
}
