/**
 * Unit tests for src/plugins/dog/dog.ts
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
const { dogPlugin } = await import('../src/plugins/dog/dog.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Dog Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  const basePayload = {
    repository: {
      full_name: 'test-owner/test-repo',
      name: 'test-repo',
      owner: {
        login: 'test-owner'
      }
    }
  }

  beforeEach(() => {
    agent = new PluginAgentImpl()
    context = {
      eventName: 'issue_comment',
      eventGUID: 'test-guid',
      repository: 'test-owner/test-repo',
      sha: 'abc123',
      ref: 'refs/heads/main',
      actor: 'test-user',
      workflow: 'test-workflow',
      runId: '12345',
      runNumber: '1'
    }

    // Set GITHUB_TOKEN for tests
    process.env.GITHUB_TOKEN = 'test-token'

    // Reset mocks
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(dogPlugin.name).toBe('dog')
    })

    it('should have genericComment handler', () => {
      expect(dogPlugin.handlers.genericComment).toBeDefined()
      expect(typeof dogPlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation', () => {
      expect(dogPlugin.help).toBeDefined()
      expect(dogPlugin.help?.description).toBeDefined()
      expect(dogPlugin.help?.commands).toBeDefined()
      expect(dogPlugin.help?.commands?.length).toBeGreaterThan(0)
    })
  })

  describe('command detection', () => {
    it('should detect /woof command', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/woof',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: 'https://example.com/dog.jpg' })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '1000']])
        })

      mockCreateComment.mockResolvedValue({})

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerInfo).toHaveBeenCalledWith('Woof command detected')
      expect(mockCreateComment).toHaveBeenCalled()
    })

    it('should detect /bark command', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/bark',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: 'https://example.com/dog.png' })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '2000']])
        })

      mockCreateComment.mockResolvedValue({})

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })

    it('should detect /this-is-fine command', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/this-is-fine',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockCreateComment.mockResolvedValue({})

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'This is fine command detected'
      )
      expect(mockCreateComment).toHaveBeenCalled()
    })

    it('should detect /this-is-not-fine command', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/this-is-not-fine',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 456,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockCreateComment.mockResolvedValue({})

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'This is not fine command detected'
      )
    })

    it('should detect /this-is-unbearable command', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/this-is-unbearable',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        pull_request: {
          number: 789,
          title: 'Test PR',
          html_url: 'https://github.com/test'
        }
      }

      mockCreateComment.mockResolvedValue({})

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'This is unbearable command detected'
      )
    })
  })

  describe('no command matched', () => {
    it('should return success without action for non-matching comment', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: 'This is a regular comment',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      const result = await dogPlugin.handlers.genericComment!(
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
          id: 1,
          body: '',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      const result = await dogPlugin.handlers.genericComment!(
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
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/this-is-fine',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(result.message).toContain('GITHUB_TOKEN not found')
      expect(agent.hasFailed()).toBe(true)
    })

    it('should handle missing issue number', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/this-is-fine',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        }
      }

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(result.message).toContain('No issue or pull request number found')
    })

    it('should handle API errors during comment creation', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/this-is-fine',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockCreateComment.mockRejectedValue(new Error('API Error'))

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(mockLoggerError).toHaveBeenCalled()
    })
  })

  describe('agent outputs', () => {
    it('should set correct outputs after successful post', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/this-is-fine',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 999,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockCreateComment.mockResolvedValue({})

      await dogPlugin.handlers.genericComment!(payload, context, agent)

      expect(agent.didTakeAction()).toBe(true)
      expect(agent.getOutputs()).toEqual({
        dog_posted: 'true',
        issue_number: '999'
      })
    })

    it('should work with pull request number', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/woof',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        pull_request: {
          number: 555,
          title: 'Test PR',
          html_url: 'https://github.com/test'
        }
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: 'https://example.com/dog.jpg' })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '1000']])
        })

      mockCreateComment.mockResolvedValue({})

      await dogPlugin.handlers.genericComment!(payload, context, agent)

      expect(agent.getOutputs()).toEqual({
        dog_posted: 'true',
        issue_number: '555'
      })
    })
  })

  describe('comment formatting', () => {
    it('should format comment with image and details', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/this-is-fine',
          user: { login: 'awesome-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockCreateComment.mockResolvedValue({})

      await dogPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('![dog](')
      })

      const callArgs = mockCreateComment.mock.calls[0][0]
      expect(callArgs.body).toContain('<details>')
      expect(callArgs.body).toContain('@awesome-user')
      expect(callArgs.body).toContain('/this-is-fine')
    })
  })

  describe('case insensitivity', () => {
    it('should handle uppercase commands', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/WOOF',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: 'https://example.com/dog.jpg' })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '1000']])
        })

      mockCreateComment.mockResolvedValue({})

      const result = await dogPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })
  })
})
