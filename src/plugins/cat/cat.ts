/**
 * Cat plugin - Responds to cat commands with images
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

const CAT_API_URL = 'https://api.thecatapi.com/v1/images/search'
const DEFAULT_GRUMPY_ROOT =
  'https://upload.wikimedia.org/wikipedia/commons/e/ee/'
const GRUMPY_IMG = 'Grumpy_Cat_by_Gage_Skidmore.jpg'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const MEOW_REGEX = /^\/meow(vie)?(?: (.+))?\s*$/im
const GRUMPY_KEYWORDS_REGEX = /^(no|grumpy)\s*$/i

interface CatImageResponse {
  url: string
  width?: number
  height?: number
}

async function checkImageSize(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const contentLength = response.headers.get('content-length')

    if (contentLength) {
      const size = parseInt(contentLength, 10)
      return size <= MAX_IMAGE_SIZE
    }

    // If no content-length header, assume it's OK
    // (some servers don't provide this header)
    return true
  } catch {
    // Log the error but allow the image (better user experience)
    // The actual image fetch will fail if there's a real issue
    return true
  }
}

async function fetchCatImage(
  category: string,
  movieCat: boolean,
  grumpyRoot: string
): Promise<string> {
  // Handle grumpy cat special case
  if (GRUMPY_KEYWORDS_REGEX.test(category)) {
    return `${grumpyRoot}${GRUMPY_IMG}`
  }

  // Build API URL
  let url = `${CAT_API_URL}?format=json&limit=1`

  if (category) {
    url += `&category_ids=${encodeURIComponent(category)}`
  }

  if (movieCat) {
    url += `&mime_types=gif`
  }

  const response = await fetch(url)

  if (!response.ok) {
    // Provide more specific error for 4xx vs 5xx
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`Bad request (status ${response.status})`)
    }
    throw new Error(`API error (status ${response.status})`)
  }

  const data = (await response.json()) as CatImageResponse[]

  if (!data || data.length === 0) {
    throw new Error('No cats in response')
  }

  const imageUrl = data[0].url

  if (!imageUrl) {
    throw new Error('No image URL in response')
  }

  // Check image size
  const sizeOk = await checkImageSize(imageUrl)
  if (!sizeOk) {
    throw new Error(`Longcat is too long: ${imageUrl}`)
  }

  return imageUrl
}

function formatResponseRaw(
  imageURL: string,
  originalComment: string,
  author: string
): string {
  return `![cat](${imageURL})

<details>
<summary>Original comment by @${author}</summary>

${originalComment}

</details>`
}

function formatErrorResponse(
  errorMessage: string,
  originalComment: string,
  author: string
): string {
  return `${errorMessage}

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
  const logger = new Logger(context.eventName, context.eventGUID, 'cat')

  try {
    const comment = payload.comment
    if (!comment || !comment.body) {
      return {
        success: true,
        tookAction: false
      }
    }

    const body = comment.body.trim()
    const author = comment.user.login

    // Check if this is a meow command
    const match = MEOW_REGEX.exec(body)
    if (!match) {
      return {
        success: true,
        tookAction: false
      }
    }

    logger.info('Meow command detected')

    // Parse the match groups
    // match[0] is the full match
    // match[1] is "vie" if present (for movie cats/GIFs)
    // match[2] is the category if present
    const movieCat = !!match[1]
    const category = (match[2] || '').trim()

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

    // Try up to 3 times to get a cat image
    let imageURL: string | null = null
    let lastError: Error | null = null

    for (let i = 0; i < 3; i++) {
      try {
        imageURL = await fetchCatImage(category, movieCat, DEFAULT_GRUMPY_ROOT)
        break
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.error(
          `Failed to get cat img (attempt ${i + 1}): ${lastError.message}`
        )
      }
    }

    // If we couldn't get a cat image after 3 tries, post an error message
    if (!imageURL) {
      let errorMsg =
        'The cat API (thecatapi.com) is currently unavailable. Please try again later.'

      // If the last error indicates a bad request and there was a category, it's likely a bad category
      if (
        category &&
        !GRUMPY_KEYWORDS_REGEX.test(category) &&
        lastError?.message.includes('Bad request')
      ) {
        errorMsg =
          'Invalid category. Please see https://docs.thecatapi.com for valid categories.'
      }

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: formatErrorResponse(errorMsg, body, author)
      })

      throw new Error('Could not find a valid cat image')
    }

    const responseBody = formatResponseRaw(imageURL, body, author)

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: responseBody
    })

    logger.info(`Posted cat image to #${issueNumber}`)

    agent.tookAction()
    agent.setOutput('cat_posted', 'true')
    agent.setOutput('issue_number', issueNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Posted cat image to #${issueNumber}`
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Cat plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const catPlugin: Plugin = {
  name: 'cat',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description: 'Posts cat images in response to commands',
    commands: [
      {
        name: '/meow',
        description: 'Posts a random cat image',
        example: '/meow'
      },
      {
        name: '/meow [category]',
        description: 'Posts a cat image from a specific category',
        example: '/meow caturday'
      },
      {
        name: '/meowvie',
        description: 'Posts a random cat GIF',
        example: '/meowvie'
      },
      {
        name: '/meowvie [category]',
        description: 'Posts a cat GIF from a specific category',
        example: '/meowvie clothes'
      }
    ]
  }
}
