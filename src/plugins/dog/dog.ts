/**
 * Dog plugin - Responds to dog commands with images
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

const DOG_API_URL = 'https://random.dog/woof.json'
const FINE_IMAGES_ROOT = 'https://storage.googleapis.com/this-is-fine-images/'
const FINE_IMG = 'this-is-fine.png'
const NOT_FINE_IMG = 'this-is-not-fine.png'
const UNBEARABLE_IMG = 'this-is-unbearable.png'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const WOOF_REGEX = /^\/(woof|bark)\s*$/i
const FINE_REGEX = /^\/this-is-fine\s*$/i
const NOT_FINE_REGEX = /^\/this-is-not-fine\s*$/i
const UNBEARABLE_REGEX = /^\/this-is-unbearable\s*$/i
const FILETYPES_REGEX = /\.(jpg|jpeg|gif|png)$/i

interface DogImageResponse {
  url: string
  fileSizeBytes?: number
}

async function fetchDogImage(retries = 5): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(DOG_API_URL)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = (await response.json()) as DogImageResponse
      const url = data.url

      if (!FILETYPES_REGEX.test(url)) {
        continue
      }

      const sizeOk = await checkImageSize(url)
      if (sizeOk) {
        return url
      }
    } catch (error) {
      if (i === retries - 1) {
        throw error
      }
    }
  }
  throw new Error('Failed to fetch valid dog image after retries')
}

async function checkImageSize(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const contentLength = response.headers.get('content-length')

    if (contentLength) {
      const size = parseInt(contentLength, 10)
      return size <= MAX_IMAGE_SIZE
    }

    return true
  } catch {
    return true
  }
}

function formatImageURL(
  imageType: 'fine' | 'not-fine' | 'unbearable' | 'random',
  url?: string
): string {
  switch (imageType) {
    case 'fine':
      return `${FINE_IMAGES_ROOT}${FINE_IMG}`
    case 'not-fine':
      return `${FINE_IMAGES_ROOT}${NOT_FINE_IMG}`
    case 'unbearable':
      return `${FINE_IMAGES_ROOT}${UNBEARABLE_IMG}`
    case 'random':
      return url || ''
  }
}

function formatResponseRaw(
  imageURL: string,
  originalComment: string,
  author: string
): string {
  return `![dog](${imageURL})

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
  const logger = new Logger(context.eventName, context.eventGUID, 'dog')

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

    let imageURL: string | null = null
    let commandMatched = false

    if (WOOF_REGEX.test(body)) {
      commandMatched = true
      logger.info('Woof command detected')
      imageURL = await fetchDogImage()
      imageURL = formatImageURL('random', imageURL)
    } else if (FINE_REGEX.test(body)) {
      commandMatched = true
      logger.info('This is fine command detected')
      imageURL = formatImageURL('fine')
    } else if (NOT_FINE_REGEX.test(body)) {
      commandMatched = true
      logger.info('This is not fine command detected')
      imageURL = formatImageURL('not-fine')
    } else if (UNBEARABLE_REGEX.test(body)) {
      commandMatched = true
      logger.info('This is unbearable command detected')
      imageURL = formatImageURL('unbearable')
    }

    if (!commandMatched || !imageURL) {
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

    const issueNumber = payload.issue?.number || payload.pull_request?.number
    if (!issueNumber) {
      throw new Error('No issue or pull request number found')
    }

    const responseBody = formatResponseRaw(imageURL, body, author)

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: responseBody
    })

    logger.info(`Posted dog image to #${issueNumber}`)

    agent.tookAction()
    agent.setOutput('dog_posted', 'true')
    agent.setOutput('issue_number', issueNumber.toString())

    return {
      success: true,
      tookAction: true,
      message: `Posted dog image to #${issueNumber}`
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Dog plugin error: ${errorMessage}`)
    agent.setFailed(errorMessage)

    return {
      success: false,
      tookAction: false,
      message: errorMessage
    }
  }
}

export const dogPlugin: Plugin = {
  name: 'dog',
  handlers: {
    genericComment: genericCommentHandler
  },
  help: {
    description: 'Posts dog images in response to commands',
    commands: [
      {
        name: '/woof',
        description: 'Posts a random dog image',
        example: '/woof'
      },
      {
        name: '/bark',
        description: 'Posts a random dog image (alias for /woof)',
        example: '/bark'
      },
      {
        name: '/this-is-fine',
        description: 'Posts the "this is fine" meme',
        example: '/this-is-fine'
      },
      {
        name: '/this-is-not-fine',
        description: 'Posts the "this is not fine" meme',
        example: '/this-is-not-fine'
      },
      {
        name: '/this-is-unbearable',
        description: 'Posts the "this is unbearable" meme',
        example: '/this-is-unbearable'
      }
    ]
  }
}
