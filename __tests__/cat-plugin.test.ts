/**
 * Unit tests for src/plugins/cat/cat.ts
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
const { catPlugin } = await import('../src/plugins/cat/cat.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Cat Plugin', () => {
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
      expect(catPlugin.name).toBe('cat')
    })

    it('should have genericComment handler', () => {
      expect(catPlugin.handlers.genericComment).toBeDefined()
      expect(typeof catPlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation', () => {
      expect(catPlugin.help).toBeDefined()
      expect(catPlugin.help?.description).toBeDefined()
      expect(catPlugin.help?.commands).toBeDefined()
      expect(catPlugin.help?.commands?.length).toBeGreaterThan(0)
    })
  })

  describe('command detection', () => {
    it('should not trigger on non-meow comments', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: 'This is just a normal comment',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockCreateComment).not.toHaveBeenCalled()
    })

    it('should trigger on /meow command', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/cat.jpg' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request for size check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '1000']])
      } as Response)

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerInfo).toHaveBeenCalledWith('Meow command detected')
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('![cat](https://example.com/cat.jpg)')
      })
    })

    it('should trigger on /meow with category', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow caturday',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/cat-caturday.jpg' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request for size check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '1000']])
      } as Response)

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalled()
    })

    it('should trigger on /meowvie command for GIFs', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meowvie',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/cat.gif' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request for size check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '1000']])
      } as Response)

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalled()
    })

    it('should handle grumpy cat request', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow grumpy',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('Grumpy_Cat_by_Gage_Skidmore.jpg')
      })
    })

    it('should handle "no" as grumpy cat', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow no',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('Grumpy_Cat_by_Gage_Skidmore.jpg')
      })
    })

    it('should be case insensitive', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/MEOW',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/cat.jpg' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request for size check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '1000']])
      } as Response)

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should retry on API failure', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      // First attempt fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({})
      } as Response)

      // Second attempt succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/cat.jpg' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request for size check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '1000']])
      } as Response)

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalled()
    })

    it('should post error message after 3 failed attempts', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      // All attempts fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({})
      } as Response)

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: expect.stringContaining('thecatapi.com appears to be down')
      })
    })

    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('GITHUB_TOKEN not found')
      )
    })

    it('should handle missing issue number', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        }
      }

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('No issue or pull request number found')
      )
    })

    it('should reject images that are too large', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      // Mock API response with large image
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/large-cat.jpg' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request showing large file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '10000000']]) // 10MB
      } as Response)

      // Second attempt
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/cat.jpg' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request for size check (small enough)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '1000']])
      } as Response)

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })
  })

  describe('pull request support', () => {
    it('should work with pull requests', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        pull_request: {
          number: 456,
          title: 'Test PR',
          html_url: 'https://github.com/test/pr/456'
        }
      }

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/cat.jpg' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request for size check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '1000']])
      } as Response)

      const result = await catPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 456,
        body: expect.stringContaining('![cat](https://example.com/cat.jpg)')
      })
    })
  })

  describe('agent outputs', () => {
    it('should set appropriate outputs on success', async () => {
      const payload = {
        ...basePayload,
        comment: {
          id: 1,
          body: '/meow',
          user: {
            login: 'test-user'
          },
          html_url: 'https://github.com/test/comment/1'
        },
        issue: {
          number: 123,
          title: 'Test Issue',
          html_url: 'https://github.com/test/issue/123'
        }
      }

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ url: 'https://example.com/cat.jpg' }],
        headers: new Map()
      } as Response)

      // Mock HEAD request for size check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-length', '1000']])
      } as Response)

      await catPlugin.handlers.genericComment!(payload, context, agent)

      expect(agent.getOutputs()).toHaveProperty('cat_posted', 'true')
      expect(agent.getOutputs()).toHaveProperty('issue_number', '123')
      expect(agent.didTakeAction()).toBe(true)
    })
  })
})
