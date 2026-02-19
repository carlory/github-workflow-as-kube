/**
 * Unit tests for the stage plugin
 */
import { jest } from '@jest/globals'

// Mock dependencies before importing the module
const mockGetIssue = jest.fn()
const mockAddLabels = jest.fn()
const mockRemoveLabel = jest.fn()

const mockGetOctokit = jest.fn(() => ({
  rest: {
    issues: {
      get: mockGetIssue,
      addLabels: mockAddLabels,
      removeLabel: mockRemoveLabel
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

// Import after mocking
const { stagePlugin } = await import('../src/plugins/stage/stage.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Stage Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  // Helper to get the handler
  const getHandler = () => stagePlugin.handlers.genericComment!

  beforeEach(() => {
    agent = new PluginAgentImpl()
    context = {
      eventName: 'issue_comment',
      eventGUID: 'test-guid-123',
      repository: 'test-owner/test-repo',
      sha: 'abc123',
      ref: 'refs/heads/main',
      actor: 'test-user',
      workflow: 'test-workflow',
      runId: '123',
      runNumber: '1'
    }

    process.env.GITHUB_TOKEN = 'test-token'
    mockGetIssue.mockClear()
    mockAddLabels.mockClear()
    mockRemoveLabel.mockClear()
    mockLoggerInfo.mockClear()
    mockLoggerError.mockClear()
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(stagePlugin.name).toBe('stage')
    })

    it('should have genericComment handler', () => {
      expect(stagePlugin.handlers.genericComment).toBeDefined()
      expect(typeof stagePlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation', () => {
      expect(stagePlugin.help).toBeDefined()
      expect(stagePlugin.help?.description).toContain('alpha/beta/stable')
      expect(stagePlugin.help?.commands).toHaveLength(6)
    })
  })

  describe('/stage alpha command', () => {
    it('should add stage/alpha label when /stage alpha is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['stage/alpha']
      })
      expect(mockRemoveLabel).not.toHaveBeenCalled()
    })

    it('should not add stage/alpha label if already present', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'stage/alpha' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
      expect(mockRemoveLabel).not.toHaveBeenCalled()
    })
  })

  describe('/stage beta command', () => {
    it('should add stage/beta label when /stage beta is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage beta',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['stage/beta']
      })
    })
  })

  describe('/stage stable command', () => {
    it('should add stage/stable label when /stage stable is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage stable',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['stage/stable']
      })
    })
  })

  describe('mutual exclusion', () => {
    it('should remove stage/alpha when adding stage/beta', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage beta',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'stage/alpha' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'stage/alpha'
      })
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['stage/beta']
      })
    })

    it('should remove stage/beta when adding stage/stable', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage stable',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'stage/beta' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'stage/beta'
      })
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['stage/stable']
      })
    })

    it('should remove multiple stage labels when adding a new one', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage stable',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'stage/alpha' }, { name: 'stage/beta' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledTimes(2)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['stage/stable']
      })
    })
  })

  describe('/remove-stage command', () => {
    it('should remove stage/alpha label when /remove-stage alpha is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/remove-stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'stage/alpha' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'stage/alpha'
      })
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should remove stage/beta label when /remove-stage beta is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/remove-stage beta',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'stage/beta' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'stage/beta'
      })
    })

    it('should not remove stage label if not present', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/remove-stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockRemoveLabel).not.toHaveBeenCalled()
      expect(mockAddLabels).not.toHaveBeenCalled()
    })
  })

  describe('multiple commands in one comment', () => {
    it('should process multiple stage commands in one comment', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha\n/remove-stage alpha\n/stage beta',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should return success without action for non-matching comment', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: 'This is a regular comment',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should handle missing comment body', async () => {
      const payload = {
        action: 'created',
        comment: {
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing comment', async () => {
      const payload = {
        action: 'created',
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing issue/PR number', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        repository: { full_name: 'test-owner/test-repo' }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.message).toContain('GITHUB_TOKEN')
    })

    it('should be case-insensitive for commands', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/STAGE ALPHA',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalled()
    })

    it('should set correct outputs', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      await handler(payload, context, agent)

      const outputs = agent.getOutputs()
      expect(outputs.stage_action).toBe('stage-updated')
      expect(outputs.issue_number).toBe('1')
    })

    it('should handle API errors gracefully', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockRejectedValue(new Error('API Error'))

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.message).toContain('API Error')
    })

    it('should handle string labels from GitHub API', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: ['stage/beta', 'bug']
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'stage/beta'
      })
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['stage/alpha']
      })
    })
  })

  describe('command variations', () => {
    it('should handle /stage with trailing whitespace', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha   ',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })

    it('should not match /stage without a stage type', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should not match invalid stage types', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage gamma',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should handle /stage in multiline comment', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: 'This is a comment\n/stage alpha\nWith more text',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/issues/1#comment-1'
        },
        issue: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalled()
    })
  })

  describe('works with pull requests', () => {
    it('should work with pull requests', async () => {
      const payload = {
        action: 'created',
        comment: {
          body: '/stage alpha',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test/repo/pull/1#comment-1'
        },
        pull_request: { number: 1, state: 'open' },
        repository: { full_name: 'test-owner/test-repo' }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['stage/alpha']
      })
    })
  })
})
