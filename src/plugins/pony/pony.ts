/**
 * Pony plugin - Responds to pony commands with images from theponyapi.com
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

const PONY_API_URL = 'https://theponyapi.com/api/v1/pony/random'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_PONIES = 5

const PONY_REGEX = /^\/pony(?: +([^\r\n]+))?\s*$/gim

interface PonyRepresentations {
  full: string
  small: string
}

interface PonyResultPony {
  representations: PonyRepresentations
}

interface PonyResult {
  pony: PonyResultPony
}

async function checkImageSize(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const contentLength = response.headers.get('content-length')

    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (size > MAX_IMAGE_SIZE) {
        return false
      }
    }

    return true
  } catch {
    return true
  }
}

async function fetchPonyImage(
  tags: string,
  logger: Logger,
  retries = 5
): Promise<string> {
  const queryParam = tags ? `?q=${encodeURIComponent(tags)}` : ''
  const url = `${PONY_API_URL}${queryParam}`

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = (await response.json()) as PonyResult
      const smallImageUrl = data.pony.representations.small
      const fullImageUrl = data.pony.representations.full

      const sizeOk = await checkImageSize(smallImageUrl)
      if (sizeOk) {
        return formatPonyURLs(smallImageUrl, fullImageUrl)
      } else {
        logger.error(
          `Pony image too large, retrying (attempt ${i + 1}/${retries})`
        )
      }
    } catch (error) {
      if (i === retries - 1) {
        throw error
      }
    }
  }
  throw new Error('Failed to fetch valid pony image after retries')
}

function formatPonyURLs(small: string, full: string): string {
  return `[![pony image](${small})](${full})`
}

function formatResponseRaw(
  ponyMarkdown: string,
  originalComment: string,
  author: string
): string {
  return `${ponyMarkdown}

<details>
<summary>Original comment by @${author}</summary>

${originalComment}

</details>`
}

const genericCommentHandler: GenericCommentHandler = async (
  payload,
  context: EventContext,
  agent: PluginAgent
): Promise<HandlerResult> => {
  const logger = new Logger(context.eventName, context.eventGUID, 'pony')

  try {
    const comment = payload.comment
    if (!comment || !comment.body) {
      return {
        success: true,
        tookAction: false
      }
    }

    const body = comment.body
    const author = comment.user.login

    const matches = body.matchAll(PONY_REGEX)
    const matchArray = Array.from(matches).slice(0, MAX_PONIES)

    if (matchArray.length === 0) {
      return {
        success: true,
        tookAction: false
      }
    }

    logger.info(`Pony command detected, found ${matchArray.length} request(s)`)

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

    let responseBuilder = ''
    let tagsSpecified = false

    for (const match of matchArray) {
      const tags = match[1] ? match[1].trim() : ''
      if (tags) {
        tagsSpecified = true
      }

      try {
        const ponyMarkdown = await fetchPonyImage(tags, logger)
        responseBuilder += ponyMarkdown + '\n'
      } catch (error) {
        logger.error(
          `Failed to get pony: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    if (responseBuilder.length > 0) {
      const responseBody = formatResponseRaw(responseBuilder, body, author)

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: responseBody
      })

      logger.info(`Posted pony image(s) to #${issueNumber}`)

      agent.tookAction()
      agent.setOutput('pony_posted', 'true')
      agent.setOutput('issue_number', issueNumber.toString())

      return {
        success: true,
        tookAction: true,
        message: `Posted pony image(s) to #${issueNumber}`
      }
    }

    let errorMsg = ''
    if (tagsSpecified) {
      errorMsg = 'Could not find a pony matching given tag(s).'
    } else {
      errorMsg =
        'Failed to fetch pony image. The API may be temporarily unavailable.'
    }

    const errorBody = formatResponseRaw(errorMsg, body, author)
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: errorBody
    })

    logger.error('Could not find a valid pony image')

    return {
      success: false,
      tookAction: true,
      message: 'Could not find a valid pony image'
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Pony plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const ponyPlugin: Plugin = {
  name: 'pony',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description:
      'Posts pony images from theponyapi.com in response to commands',
    commands: [
      {
        name: '/pony',
        description:
          'Posts a random pony image. You can optionally specify a pony name or tag for a specific pony.',
        example: '/pony'
      },
      {
        name: '/pony [name]',
        description: 'Posts an image of a specific pony by name',
        example: '/pony Twilight Sparkle'
      }
    ]
  }
}
