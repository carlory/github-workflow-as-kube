/**
 * Merge Commit Blocker plugin - Detects and labels PRs containing merge commits
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/mergecommitblocker/mergecommitblocker.go
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

const MERGE_COMMITS_LABEL = 'do-not-merge/contains-merge-commits'
const BOT_NAME = 'github-actions[bot]'

const COMMENT_BODY = `Adding label \`${MERGE_COMMITS_LABEL}\` because PR contains merge commits, which are not allowed in this repository.
Use \`git rebase\` to reapply your commits on top of the target branch. Detailed instructions for doing so can be found [here](https://git-scm.com/book/en/v2/Git-Branching-Rebasing).`

/**
 * Determines if the PR action should trigger merge commit check
 */
function isPRActionRelevant(action: string): boolean {
  return (
    action === 'opened' || action === 'reopened' || action === 'synchronize'
  )
}

/**
 * Checks if any commits in the list are merge commits
 * A merge commit has more than one parent
 */
async function hasMergeCommits(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  commits: Array<{ sha: string }>
): Promise<boolean> {
  for (const commit of commits) {
    try {
      const { data } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: commit.sha
      })

      // A merge commit has more than one parent
      if (data.parents && data.parents.length > 1) {
        return true
      }
    } catch (error) {
      // Continue checking other commits if one fails
      console.warn(
        `Failed to fetch commit ${commit.sha}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  return false
}

/**
 * Deletes old bot comments matching the comment body
 */
async function deleteOldComments(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  logger: Logger
): Promise<void> {
  try {
    // Get all comments on the PR
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber
    })

    // Find bot comments that match our comment body
    for (const comment of comments) {
      if (
        comment.user?.login === BOT_NAME &&
        comment.body?.includes(MERGE_COMMITS_LABEL)
      ) {
        logger.info(`Deleting old bot comment #${comment.id}`)
        await octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: comment.id
        })
      }
    }
  } catch (error) {
    logger.warning(
      `Failed to delete old comments: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

const pullRequestHandler: PullRequestHandler = async (
  payload: PullRequestEventPayload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(
    context.eventName,
    context.eventGUID,
    'merge-commit-blocker'
  )

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

    logger.info(`Processing PR #${prNumber} for merge commit detection`)

    // Get all commits in the PR
    let allCommits: Array<{ sha: string }> = []
    let page = 1
    const perPage = 100

    while (true) {
      const { data: commits } = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: perPage,
        page
      })

      if (commits.length === 0) {
        break
      }

      allCommits = allCommits.concat(commits)

      if (commits.length < perPage) {
        break
      }

      page++
    }

    logger.info(`Found ${allCommits.length} commits in PR`)

    // Check for merge commits
    const existMergeCommits = await hasMergeCommits(
      octokit,
      owner,
      repo,
      allCommits
    )

    logger.info(`Merge commits detected: ${existMergeCommits}`)

    // Get current labels
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: prNumber
    })

    const labels = issue.labels.map((l) =>
      typeof l === 'string' ? l : l.name || ''
    )
    const hasLabel = labels.includes(MERGE_COMMITS_LABEL)

    logger.info(`Has label: ${hasLabel}, Needs label: ${existMergeCommits}`)

    // Case 1: Had label, but merge commits are now fixed
    if (hasLabel && !existMergeCommits) {
      logger.info(`Removing ${MERGE_COMMITS_LABEL} label from PR #${prNumber}`)

      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: MERGE_COMMITS_LABEL
      })

      // Delete old bot comments
      await deleteOldComments(octokit, owner, repo, prNumber, logger)

      agent.tookAction()
      agent.setOutput('merge_commit_blocker_action', 'label-removed')
      agent.setOutput('issue_number', prNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Removed ${MERGE_COMMITS_LABEL} label from PR #${prNumber}`
      }
    }
    // Case 2: Doesn't have label, but merge commits detected
    else if (!hasLabel && existMergeCommits) {
      logger.info(`Adding ${MERGE_COMMITS_LABEL} label to PR #${prNumber}`)

      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels: [MERGE_COMMITS_LABEL]
      })

      // Post comment
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: COMMENT_BODY
      })

      agent.tookAction()
      agent.setOutput('merge_commit_blocker_action', 'label-added')
      agent.setOutput('issue_number', prNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Added ${MERGE_COMMITS_LABEL} label to PR #${prNumber}`
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
    logger.error(`Merge commit blocker plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const mergeCommitBlockerPlugin: Plugin = {
  name: 'merge-commit-blocker',
  handlers: {
    pullRequest: pullRequestHandler
  },
  help: {
    description:
      "The merge commit blocker plugin adds the 'do-not-merge/contains-merge-commits' label to pull requests that contain merge commits. This helps enforce a rebase-only workflow. The plugin automatically removes the label when the merge commits are fixed.",
    commands: []
  }
}
