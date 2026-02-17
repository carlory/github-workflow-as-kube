/**
 * Unit tests for src/plugins/pony/pony.ts
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
const { ponyPlugin } = await import('../src/plugins/pony/pony.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Pony Plugin', () => {
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
      expect(ponyPlugin.name).toBe('pony')
    })

    it('should have genericComment handler', () => {
      expect(ponyPlugin.handlers.genericComment).toBeDefined()
      expect(typeof ponyPlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation', () => {
      expect(ponyPlugin.help).toBeDefined()
      expect(ponyPlugin.help?.description).toBeDefined()
      expect(ponyPlugin.help?.commands).toBeDefined()
      expect(ponyPlugin.help?.commands?.length).toBeGreaterThan(0)
    })
  })

  describe('command detection', () => {
    it('should detect /pony command without tags', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/pony',
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
          json: async () => ({
            pony: {
              representations: {
                small: 'https://example.com/pony-small.jpg',
                full: 'https://example.com/pony-full.jpg'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '1000']])
        })

      mockCreateComment.mockResolvedValue({})

      const result = await ponyPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Pony command detected, found 1 request(s)'
      )
      expect(mockCreateComment).toHaveBeenCalled()
    })

    it('should detect /pony command with tags', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/pony Twilight Sparkle',
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
          json: async () => ({
            pony: {
              representations: {
                small: 'https://example.com/twilight-small.jpg',
                full: 'https://example.com/twilight-full.jpg'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '2000']])
        })

      mockCreateComment.mockResolvedValue({})

      const result = await ponyPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('?q=Twilight%20Sparkle')
      )
    })

    it('should detect multiple /pony commands', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/pony\n/pony Rainbow Dash',
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
          json: async () => ({
            pony: {
              representations: {
                small: 'https://example.com/pony1-small.jpg',
                full: 'https://example.com/pony1-full.jpg'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '1000']])
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            pony: {
              representations: {
                small: 'https://example.com/pony2-small.jpg',
                full: 'https://example.com/pony2-full.jpg'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '2000']])
        })

      mockCreateComment.mockResolvedValue({})

      const result = await ponyPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Pony command detected, found 2 request(s)'
      )
    })

    it('should limit to maximum number of ponies', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/pony\n/pony\n/pony\n/pony\n/pony\n/pony',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          pony: {
            representations: {
              small: 'https://example.com/pony-small.jpg',
              full: 'https://example.com/pony-full.jpg'
            }
          }
        })
      })

      mockCreateComment.mockResolvedValue({})

      const result = await ponyPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Pony command detected, found 5 request(s)'
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

      const result = await ponyPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockCreateComment).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle API failure', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/pony',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      mockFetch.mockRejectedValue(new Error('API error'))
      mockCreateComment.mockResolvedValue({})

      const result = await ponyPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('theponyapi.com appears to be down')
        })
      )
    })

    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/pony',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test'
        }
      }

      const result = await ponyPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Pony plugin error: GITHUB_TOKEN not found'
      )
    })
  })

  describe('image size validation', () => {
    it('should reject images that are too large', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/pony',
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
          json: async () => ({
            pony: {
              representations: {
                small: 'https://example.com/pony-small.jpg',
                full: 'https://example.com/pony-full.jpg'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '10000000']])
        })

      await ponyPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('pull request support', () => {
    it('should work with pull requests', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/pony',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test'
        },
        pull_request: {
          number: 456,
          title: 'Test PR',
          html_url: 'https://github.com/test'
        }
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            pony: {
              representations: {
                small: 'https://example.com/pony-small.jpg',
                full: 'https://example.com/pony-full.jpg'
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-length', '1000']])
        })

      mockCreateComment.mockResolvedValue({})

      const result = await ponyPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 456
        })
      )
    })
  })
})
