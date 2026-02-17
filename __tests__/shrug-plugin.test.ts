/**
 * Unit tests for the shrug plugin
 */
import { jest } from '@jest/globals'

// Mock dependencies before importing the module
const mockGetIssue = jest.fn()
const mockAddLabels = jest.fn()
const mockRemoveLabel = jest.fn()
const mockCreateComment = jest.fn()

const mockGetOctokit = jest.fn(() => ({
  rest: {
    issues: {
      get: mockGetIssue,
      addLabels: mockAddLabels,
      removeLabel: mockRemoveLabel,
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

// Import after mocking
const { shrugPlugin } = await import('../src/plugins/shrug/shrug.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Shrug Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  // Helper to get the handler
  const getHandler = () => shrugPlugin.handlers.genericComment!

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
    mockCreateComment.mockClear()
    mockLoggerInfo.mockClear()
    mockLoggerError.mockClear()
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(shrugPlugin.name).toBe('shrug')
    })

    it('should have genericComment handler', () => {
      expect(shrugPlugin.handlers.genericComment).toBeDefined()
      expect(typeof shrugPlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation', () => {
      expect(shrugPlugin.help).toBeDefined()
      expect(shrugPlugin.help?.description).toContain('shrug')
      expect(shrugPlugin.help?.commands).toHaveLength(2)
    })
  })

  describe('/shrug command', () => {
    it('should add shrug label when /shrug is commented on issue without label', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['shrug']
      })
      expect(agent.getOutputs()['shrug_action']).toBe('shrug-added')
      expect(agent.getOutputs()['issue_number']).toBe('1')
    })

    it('should add shrug label when /shrug is commented on PR without label', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/pull/1#issuecomment-1'
        },
        pull_request: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['shrug']
      })
      expect(agent.getOutputs()['shrug_action']).toBe('shrug-added')
      expect(agent.getOutputs()['issue_number']).toBe('1')
    })

    it('should not add shrug label if already present', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'shrug' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
      expect(mockRemoveLabel).not.toHaveBeenCalled()
      expect(mockCreateComment).not.toHaveBeenCalled()
    })
  })

  describe('/unshrug command', () => {
    it('should remove shrug label and post comment when /unshrug is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/unshrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'shrug' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        body: '¯\\\\\\_(ツ)\\_/¯'
      })
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'shrug'
      })
      expect(agent.getOutputs()['shrug_action']).toBe('shrug-removed')
      expect(agent.getOutputs()['issue_number']).toBe('1')
    })

    it('should not remove shrug label if not present', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/unshrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockRemoveLabel).not.toHaveBeenCalled()
      expect(mockCreateComment).not.toHaveBeenCalled()
      expect(mockAddLabels).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should return success without action for non-matching comment', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: 'This is a regular comment',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should handle missing comment body', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing comment', async () => {
      const payload = {
        action: 'created',
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing issue/PR number', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should handle closed issues', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'closed'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should handle closed PRs', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/pull/1#issuecomment-1'
        },
        pull_request: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'closed'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(agent.hasFailed()).toBe(true)
    })

    it('should be case-insensitive for commands', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/SHRUG',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalled()
    })

    it('should set correct outputs', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/42#issuecomment-1'
        },
        issue: {
          number: 42,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/42',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(agent.getOutputs()['shrug_action']).toBe('shrug-added')
      expect(agent.getOutputs()['issue_number']).toBe('42')
    })

    it('should handle API errors gracefully', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockRejectedValue(
        new Error('API Error: Rate limit exceeded')
      )

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(agent.hasFailed()).toBe(true)
      expect(agent.getFailureMessage()).toContain('API Error')
    })
  })

  describe('command variations', () => {
    it('should handle /shrug with trailing whitespace', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/shrug   ',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalled()
    })

    it('should handle /shrug in multiline comment', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: 'Some comments here\n/shrug\nMore comments',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalled()
    })

    it('should handle /unshrug in multiline comment', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: 'Some text\n/unshrug\nMore text',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'shrug' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalled()
      expect(mockRemoveLabel).toHaveBeenCalled()
    })

    it('should handle /UNSHRUG case-insensitive', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/UNSHRUG',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'shrug' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalled()
      expect(mockRemoveLabel).toHaveBeenCalled()
    })
  })
})
