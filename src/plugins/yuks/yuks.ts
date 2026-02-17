/**
 * Yuks plugin - Responds to /joke command with dad jokes
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

const JOKE_API_URL = 'https://icanhazdadjoke.com'
const JOKE_REGEX = /^\/joke\s*$/im
const SIMPLE_REGEX = /^[\w?'!., ]+$/

interface JokeResponse {
  joke: string
}

/**
 * Escapes markdown syntax in a string by converting special characters
 * to numeric character references
 */
function escapeMarkdown(s: string): string {
  let result = ''
  for (let i = 0; i < s.length; i++) {
    const char = s[i]
    if (SIMPLE_REGEX.test(char)) {
      result += char
    } else {
      result += `&#${s.charCodeAt(i)};`
    }
  }
  return result
}

/**
 * Fetches a joke from the icanhazdadjoke.com API
 */
async function fetchJoke(): Promise<string> {
  const response = await fetch(JOKE_API_URL, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data = (await response.json()) as JokeResponse
  if (!data.joke) {
    throw new Error('No joke found in response')
  }

  return data.joke
}

function formatResponseRaw(
  joke: string,
  originalComment: string,
  author: string,
  commentURL: string
): string {
  return `${joke}

<details>
<summary>Original comment by @${author}</summary>

[${originalComment}](${commentURL})

</details>`
}

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'yuks')

  try {
    const comment = payload.comment
    if (!comment || !comment.body) {
      return {
        success: true,
        tookAction: false
      }
    }

    const body = comment.body.trim()

    if (!JOKE_REGEX.test(body)) {
      return {
        success: true,
        tookAction: false
      }
    }

    logger.info('Joke command detected')

    const token = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('GITHUB_TOKEN not found')
    }

    const octokit = getOctokit(token)
    const [owner, repo] = payload.repository.full_name.split('/')

    const issueNumber = payload.issue?.number || payload.pull_request?.number
    if (!issueNumber) {
      throw new Error('No issue or pull request number found')
    }

    const errorBudget = 5
    let joke: string | null = null

    for (let attempt = 1; attempt <= errorBudget; attempt++) {
      try {
        joke = await fetchJoke()
        if (joke && joke.length > 0) {
          break
        }
        logger.info(
          `Joke is empty. Retrying (attempt ${attempt}/${errorBudget})`
        )
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        logger.info(
          `Failed to get joke: ${errorMessage}. Retrying (attempt ${attempt}/${errorBudget})`
        )
        if (attempt === errorBudget) {
          throw new Error(`Failed to get joke after ${errorBudget} attempts`)
        }
      }
    }

    if (!joke) {
      throw new Error('Failed to get valid joke')
    }

    const sanitizedJoke = escapeMarkdown(joke)
    logger.info(`Commenting with joke: "${sanitizedJoke}"`)

    const commentURL = comment.html_url || ''
    const responseBody = formatResponseRaw(
      sanitizedJoke,
      body,
      comment.user.login,
      commentURL
    )

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: responseBody
    })

    logger.info(`Posted joke to #${issueNumber}`)

    agent.tookAction()
    agent.setOutput('joke_posted', 'true')
    agent.setOutput('issue_number', issueNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Posted joke to #${issueNumber}`
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Yuks plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const yuksPlugin: Plugin = {
  name: 'yuks',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description:
      'The yuks plugin comments with jokes in response to the `/joke` command.',
    commands: [
      {
        name: '/joke',
        description: 'Tells a joke.',
        example: '/joke'
      }
    ]
  }
}
