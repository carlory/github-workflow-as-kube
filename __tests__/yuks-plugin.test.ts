/**
 * Unit tests for src/plugins/yuks/yuks.ts
 */
import { jest } from '@jest/globals'

// Mock dependencies before importing the module
const mockCreateComment = jest.fn()
const mockGetOctokit = jest.fn(() => ({
  rest: {
    issues: {
      createComment: mockCreateComment
    }
  }
}))

const mockLoggerInfo = jest.fn()
const mockLoggerError = jest.fn()

jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit
}))

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: mockLoggerInfo,
    error: mockLoggerError,
    debug: jest.fn(),
    warning: jest.fn(),
    setFailed: jest.fn()
  }))
}))

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

// Import after mocking
const { yuksPlugin } = await import('../src/plugins/yuks/yuks.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Yuks Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  const basePayload = {
    repository: {
      full_name: 'test-owner/test-repo',
      name: 'test-repo',
      owner: {
        login: 'test-owner'
      }
    },
    issue: {
      number: 123,
      state: 'open'
    },
    comment: {
      body: '/joke',
      user: {
        login: 'test-user'
      },
      html_url:
        'https://github.com/test-owner/test-repo/issues/123#issuecomment-1'
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GITHUB_TOKEN = 'test-token'

    context = {
      eventName: 'issue_comment',
      eventGUID: 'test-guid',
      repository: 'test-owner/test-repo',
      sha: 'abc123',
      ref: 'refs/heads/main',
      actor: 'test-actor',
      workflow: 'test-workflow',
      runId: '123',
      runNumber: '1'
    }

    agent = new PluginAgentImpl()
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(yuksPlugin.name).toBe('yuks')
    })

    it('should have genericComment handler', () => {
      expect(yuksPlugin.handlers.genericComment).toBeDefined()
      expect(typeof yuksPlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation', () => {
      expect(yuksPlugin.help).toBeDefined()
      expect(yuksPlugin.help?.description).toContain('joke')
      expect(yuksPlugin.help?.commands).toHaveLength(1)
      expect(yuksPlugin.help?.commands?.[0].name).toBe('/joke')
    })
  })

  describe('command detection', () => {
    it('should detect /joke command', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: 'Why did the chicken cross the road?' })
      })

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalled()
    })

    it('should be case-insensitive', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: 'Test joke' })
      })

      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/JOKE'
        }
      }

      const result = await yuksPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })

    it('should match /joke with trailing whitespace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: 'Test joke' })
      })

      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/joke  \n'
        }
      }

      const result = await yuksPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })
  })

  describe('no command matched', () => {
    it('should return success without action for non-matching comment', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: 'This is just a regular comment'
        }
      }

      const result = await yuksPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockCreateComment).not.toHaveBeenCalled()
    })

    it('should handle missing comment body', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: ''
        }
      }

      const result = await yuksPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing comment', async () => {
      const payload = {
        ...basePayload,
        comment: undefined
      }

      const result = await yuksPlugin.handlers.genericComment!(
        payload as typeof basePayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })
  })

  describe('joke fetching', () => {
    it('should fetch joke from API', async () => {
      const testJoke =
        'Why did the scarecrow win an award? He was outstanding in his field!'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: testJoke })
      })

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith('https://icanhazdadjoke.com', {
        headers: { Accept: 'application/json' }
      })
      expect(mockCreateComment).toHaveBeenCalled()

      const commentBody = mockCreateComment.mock.calls[0][0].body
      expect(commentBody).toContain(testJoke)
    })

    it('should retry on empty joke', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ joke: '' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ joke: 'A good joke!' })
        })

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should retry on fetch error', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ joke: 'A good joke!' })
        })

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(5)
    })

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(false)
    })

    it('should handle missing joke in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(false)
    })
  })

  describe('markdown escaping', () => {
    it('should escape markdown special characters', async () => {
      const jokeWithMarkdown =
        "What's a developer's favorite drink? Java<script>"
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: jokeWithMarkdown })
      })

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      const commentBody = mockCreateComment.mock.calls[0][0].body
      expect(commentBody).toContain('&#60;')
      expect(commentBody).toContain('&#62;')
    })

    it('should not escape simple characters', async () => {
      const simpleJoke =
        'Why did the chicken cross the road? To get to the other side!'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: simpleJoke })
      })

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      const commentBody = mockCreateComment.mock.calls[0][0].body
      expect(commentBody).toContain(simpleJoke)
    })
  })

  describe('error handling', () => {
    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(result.message).toContain('GITHUB_TOKEN')
    })

    it('should handle missing issue number', async () => {
      const payload = {
        ...basePayload,
        issue: undefined
      }

      const result = await yuksPlugin.handlers.genericComment!(
        payload as typeof basePayload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(result.message).toContain('issue or pull request number')
    })

    it('should handle API errors during comment creation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: 'Test joke' })
      })

      mockCreateComment.mockRejectedValueOnce(new Error('API error'))

      const result = await yuksPlugin.handlers.genericComment!(
        basePayload,
        context,
        agent
      )

      expect(result.success).toBe(false)
    })
  })

  describe('agent outputs', () => {
    it('should set correct outputs after successful post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: 'Test joke' })
      })

      const setOutputSpy = jest.spyOn(agent, 'setOutput')
      const tookActionSpy = jest.spyOn(agent, 'tookAction')

      await yuksPlugin.handlers.genericComment!(basePayload, context, agent)

      expect(tookActionSpy).toHaveBeenCalled()
      expect(setOutputSpy).toHaveBeenCalledWith('joke_posted', 'true')
      expect(setOutputSpy).toHaveBeenCalledWith('issue_number', '123')
    })

    it('should work with pull request number', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: 'Test joke' })
      })

      const payload = {
        ...basePayload,
        issue: undefined,
        pull_request: {
          number: 456
        }
      }

      const result = await yuksPlugin.handlers.genericComment!(
        payload as typeof basePayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 456
        })
      )
    })
  })

  describe('comment formatting', () => {
    it('should format comment with joke and details', async () => {
      const testJoke = 'Test joke content'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ joke: testJoke })
      })

      await yuksPlugin.handlers.genericComment!(basePayload, context, agent)

      const commentBody = mockCreateComment.mock.calls[0][0].body
      expect(commentBody).toContain(testJoke)
      expect(commentBody).toContain('<details>')
      expect(commentBody).toContain('Original comment by @test-user')
      expect(commentBody).toContain('/joke')
    })
  })
})
