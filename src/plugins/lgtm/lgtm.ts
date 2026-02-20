/**
 * LGTM plugin - Adds/removes lgtm label from PRs
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/lgtm/lgtm.go
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

const LGTM_LABEL = 'lgtm'

const lgtmRe = /^\/lgtm(\s+no-issue)?\s*$/im
const lgtmCancelRe = /^\/(remove-lgtm|lgtm\s+cancel)\s*$/im

const removeLGTMComment =
  'New changes are detected. LGTM label has been removed.'

type Octokit = ReturnType<typeof getOctokit>

async function applyLGTM(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  wantLGTM: boolean,
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
  const hasLGTM = labels.includes(LGTM_LABEL)

  if (hasLGTM && !wantLGTM) {
    logger.info(`Removing ${LGTM_LABEL} label from #${prNumber}`)
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prNumber,
      name: LGTM_LABEL
    })

    agent.tookAction()
    agent.setOutput('lgtm_action', 'lgtm-removed')
    agent.setOutput('issue_number', prNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Removed ${LGTM_LABEL} label from #${prNumber}`
    }
  } else if (!hasLGTM && wantLGTM) {
    logger.info(`Adding ${LGTM_LABEL} label to #${prNumber}`)
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: [LGTM_LABEL]
    })

    agent.tookAction()
    agent.setOutput('lgtm_action', 'lgtm-added')
    agent.setOutput('issue_number', prNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Added ${LGTM_LABEL} label to #${prNumber}`
    }
  }

  return { success: true, tookAction: false }
}

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'lgtm')

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

      // If review body contains an /lgtm or /lgtm cancel command, skip
      const reviewBody = payload.review.body || ''
      if (lgtmRe.test(reviewBody) || lgtmCancelRe.test(reviewBody)) {
        return { success: true, tookAction: false }
      }

      const reviewState = payload.review.state?.toLowerCase()
      let wantLGTM: boolean
      if (reviewState === 'approved') {
        wantLGTM = true
      } else if (reviewState === 'changes_requested') {
        wantLGTM = false
      } else {
        return { success: true, tookAction: false }
      }

      const prNumber = payload.pull_request.number
      const reviewer = payload.review.user.login
      const prAuthor = payload.pull_request.user?.login

      // Reviewer cannot LGTM their own PR
      if (prAuthor && reviewer === prAuthor && wantLGTM) {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: `@${reviewer} you cannot LGTM your own PR.`
        })
        return { success: true, tookAction: false }
      }

      return await applyLGTM(
        octokit,
        owner,
        repo,
        prNumber,
        wantLGTM,
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

    let wantLGTM: boolean
    if (lgtmRe.test(body)) {
      wantLGTM = true
    } else if (lgtmCancelRe.test(body)) {
      wantLGTM = false
    } else {
      return { success: true, tookAction: false }
    }

    // Author cannot LGTM own PR
    const issueAuthor = payload.issue.user?.login
    if (issueAuthor && commenter === issueAuthor && wantLGTM) {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: `@${commenter} you cannot LGTM your own PR.`
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
          body: `@${commenter} changing LGTM is restricted to collaborators`
        })
        return { success: true, tookAction: false }
      }
      throw collaboratorError
    }

    return await applyLGTM(
      octokit,
      owner,
      repo,
      issueNumber,
      wantLGTM,
      agent,
      logger
    )
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`LGTM plugin error: ${errorMessage}`)
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
  const logger = new Logger(context.eventName, context.eventGUID, 'lgtm')

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

    if (!labels.includes(LGTM_LABEL)) {
      return { success: true, tookAction: false }
    }

    logger.info(
      `Removing ${LGTM_LABEL} label from #${prNumber} due to new commits`
    )
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prNumber,
      name: LGTM_LABEL
    })

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: removeLGTMComment
    })

    agent.tookAction()
    agent.setOutput('lgtm_action', 'lgtm-removed')
    agent.setOutput('lgtm_reason', 'new-commits')
    agent.setOutput('issue_number', prNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Removed ${LGTM_LABEL} label from #${prNumber} due to new commits`
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`LGTM plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const lgtmPlugin: Plugin = {
  name: 'lgtm',
  handlers: {
    genericComment: genericCommentHandler,
    pullRequest: pullRequestHandler
  },
  help: {
    description:
      "The lgtm plugin manages the application and removal of the 'lgtm' (Looks Good To Me) label which is typically used to gate merging.",
    commands: [
      {
        name: '/lgtm',
        description: "Adds the 'lgtm' label to a PR",
        example: '/lgtm'
      },
      {
        name: '/lgtm cancel',
        description: "Removes the 'lgtm' label from a PR",
        example: '/lgtm cancel'
      },
      {
        name: '/remove-lgtm',
        description:
          "Removes the 'lgtm' label from a PR (alias for /lgtm cancel)",
        example: '/remove-lgtm'
      }
    ]
  }
}
