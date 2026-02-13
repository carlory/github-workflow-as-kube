/**
 * Help plugin - Adds/removes help and good-first-issue labels
 * Based on https://github.com/kubernetes-sigs/prow/blob/main/pkg/plugins/help/help.go
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

const HELP_LABEL = 'help wanted'
const GOOD_FIRST_ISSUE_LABEL = 'good first issue'

const helpRe = /^\/help\s*$/im
const helpRemoveRe = /^\/remove-help\s*$/im
const helpGoodFirstIssueRe = /^\/good-first-issue\s*$/im
const helpGoodFirstIssueRemoveRe = /^\/remove-good-first-issue\s*$/im

const helpMsgPruneMatch =
  'This request has been marked as needing help from a contributor.'
const goodFirstIssueMsgPruneMatch =
  'This request has been marked as suitable for new contributors.'

interface IssueGuidelines {
  helpGuidelinesURL?: string
  helpGuidelinesSummary?: string
}

function helpMsg(guidelines?: IssueGuidelines): string {
  if (guidelines?.helpGuidelinesSummary) {
    return helpMsgWithGuidelineSummary(guidelines)
  }

  const url =
    guidelines?.helpGuidelinesURL ||
    'https://www.kubernetes.dev/docs/guide/help-wanted/'

  return `
This request has been marked as needing help from a contributor.

Please ensure the request meets the requirements listed [here](${url}).

If this request no longer meets these requirements, the label can be removed
by commenting with the \`/remove-help\` command.
`
}

function helpMsgWithGuidelineSummary(guidelines: IssueGuidelines): string {
  const url =
    guidelines.helpGuidelinesURL ||
    'https://www.kubernetes.dev/docs/guide/help-wanted/'

  return `
This request has been marked as needing help from a contributor.

### Guidelines
${guidelines.helpGuidelinesSummary}

For more details on the requirements of such an issue, please see [here](${url}) and ensure that they are met.

If this request no longer meets these requirements, the label can be removed
by commenting with the \`/remove-help\` command.
`
}

function goodFirstIssueMsg(guidelines?: IssueGuidelines): string {
  if (guidelines?.helpGuidelinesSummary) {
    return goodFirstIssueMsgWithGuidelinesSummary(guidelines)
  }

  const url =
    guidelines?.helpGuidelinesURL ||
    'https://www.kubernetes.dev/docs/guide/help-wanted/'

  return `
This request has been marked as suitable for new contributors.

Please ensure the request meets the requirements listed [here](${url}#good-first-issue).

If this request no longer meets these requirements, the label can be removed
by commenting with the \`/remove-good-first-issue\` command.
`
}

function goodFirstIssueMsgWithGuidelinesSummary(
  guidelines: IssueGuidelines
): string {
  const url =
    guidelines.helpGuidelinesURL ||
    'https://www.kubernetes.dev/docs/guide/help-wanted/'

  return `
This request has been marked as suitable for new contributors.

### Guidelines
${guidelines.helpGuidelinesSummary}

For more details on the requirements of such an issue, please see [here](${url}#good-first-issue) and ensure that they are met.

If this request no longer meets these requirements, the label can be removed
by commenting with the \`/remove-good-first-issue\` command.
`
}

function formatResponseRaw(
  body: string,
  htmlURL: string,
  author: string,
  message: string
): string {
  return `${message}

<details>
<summary>In response to <a href="${htmlURL}">this</a>:</summary>

> ${body.split('\n').join('\n> ')}

Instructions for interacting with me using PR comments are available [here](https://git.k8s.io/community/contributors/guide/pull-requests.md).  If you have questions or suggestions related to my behavior, please file an issue against the [kubernetes/test-infra](https://github.com/kubernetes/test-infra/issues/new?title=Prow%20issue:) repository.
</details>`
}

async function pruneComments(
  octokit: ReturnType<typeof getOctokit>,
  owner: string,
  repo: string,
  issueNumber: number,
  botLogin: string,
  pruneMatch: string,
  logger: Logger
): Promise<void> {
  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber
    })

    for (const comment of comments) {
      if (
        comment.user?.login === botLogin &&
        comment.body?.includes(pruneMatch)
      ) {
        await octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: comment.id
        })
        logger.info(`Pruned comment ${comment.id}`)
      }
    }
  } catch (error) {
    logger.error(
      `Failed to prune comments: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'help')

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

    const issueState = payload.issue?.state || payload.pull_request?.state
    if (issueState !== 'open') {
      return {
        success: true,
        tookAction: false
      }
    }

    const body = comment.body.trim()
    const author = comment.user.login
    const htmlURL = comment.html_url

    const token = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('GITHUB_TOKEN not found')
    }

    const octokit = getOctokit(token)
    const [owner, repo] = payload.repository.full_name.split('/')

    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    })

    const labels = issue.labels.map((l) =>
      typeof l === 'string' ? l : l.name || ''
    )
    const hasHelp = labels.includes(HELP_LABEL)
    const hasGoodFirstIssue = labels.includes(GOOD_FIRST_ISSUE_LABEL)

    const botLogin = 'github-actions[bot]'

    if (hasHelp && helpRemoveRe.test(body)) {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: HELP_LABEL
      })
      logger.info(`Removed ${HELP_LABEL} label from #${issueNumber}`)

      await pruneComments(
        octokit,
        owner,
        repo,
        issueNumber,
        botLogin,
        helpMsgPruneMatch,
        logger
      )

      if (hasGoodFirstIssue) {
        await octokit.rest.issues.removeLabel({
          owner,
          repo,
          issue_number: issueNumber,
          name: GOOD_FIRST_ISSUE_LABEL
        })
        logger.info(
          `Removed ${GOOD_FIRST_ISSUE_LABEL} label from #${issueNumber}`
        )

        await pruneComments(
          octokit,
          owner,
          repo,
          issueNumber,
          botLogin,
          goodFirstIssueMsgPruneMatch,
          logger
        )
      }

      agent.tookAction()
      return {
        success: true,
        tookAction: true,
        message: `Removed help labels from #${issueNumber}`
      }
    }

    if (!hasGoodFirstIssue && helpGoodFirstIssueRe.test(body)) {
      const message = goodFirstIssueMsg()
      const responseBody = formatResponseRaw(body, htmlURL, author, message)

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: responseBody
      })
      logger.info(`Posted good-first-issue comment to #${issueNumber}`)

      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: [GOOD_FIRST_ISSUE_LABEL]
      })
      logger.info(`Added ${GOOD_FIRST_ISSUE_LABEL} label to #${issueNumber}`)

      if (!hasHelp) {
        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: issueNumber,
          labels: [HELP_LABEL]
        })
        logger.info(`Added ${HELP_LABEL} label to #${issueNumber}`)
      }

      agent.tookAction()
      agent.setOutput('help_action', 'good-first-issue-added')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Added good-first-issue label to #${issueNumber}`
      }
    }

    if (!hasHelp && helpRe.test(body)) {
      const message = helpMsg()
      const responseBody = formatResponseRaw(body, htmlURL, author, message)

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: responseBody
      })
      logger.info(`Posted help comment to #${issueNumber}`)

      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: [HELP_LABEL]
      })
      logger.info(`Added ${HELP_LABEL} label to #${issueNumber}`)

      agent.tookAction()
      agent.setOutput('help_action', 'help-added')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Added help label to #${issueNumber}`
      }
    }

    if (hasGoodFirstIssue && helpGoodFirstIssueRemoveRe.test(body)) {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: GOOD_FIRST_ISSUE_LABEL
      })
      logger.info(
        `Removed ${GOOD_FIRST_ISSUE_LABEL} label from #${issueNumber}`
      )

      await pruneComments(
        octokit,
        owner,
        repo,
        issueNumber,
        botLogin,
        goodFirstIssueMsgPruneMatch,
        logger
      )

      agent.tookAction()
      agent.setOutput('help_action', 'good-first-issue-removed')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Removed good-first-issue label from #${issueNumber}`
      }
    }

    return {
      success: true,
      tookAction: false
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Help plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const helpPlugin: Plugin = {
  name: 'help',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description:
      "Adds or removes the 'help wanted' and 'good first issue' labels from issues.",
    commands: [
      {
        name: '/help',
        description: "Applies the 'help wanted' label to an issue",
        example: '/help'
      },
      {
        name: '/remove-help',
        description:
          "Removes the 'help wanted' and 'good first issue' labels from an issue",
        example: '/remove-help'
      },
      {
        name: '/good-first-issue',
        description:
          "Applies the 'good first issue' and 'help wanted' labels to an issue",
        example: '/good-first-issue'
      },
      {
        name: '/remove-good-first-issue',
        description: "Removes the 'good first issue' label from an issue",
        example: '/remove-good-first-issue'
      }
    ]
  }
}
