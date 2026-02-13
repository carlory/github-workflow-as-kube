/**
 * Unit tests for src/plugins/help/help.ts
 */
import { jest } from '@jest/globals'

// Mock dependencies before importing the module
const mockCreateComment = jest.fn()
const mockAddLabels = jest.fn()
const mockRemoveLabel = jest.fn()
const mockGetIssue = jest.fn()
const mockListComments = jest.fn()
const mockDeleteComment = jest.fn()

const mockGetOctokit = jest.fn(() => ({
  rest: {
    issues: {
      createComment: mockCreateComment,
      addLabels: mockAddLabels,
      removeLabel: mockRemoveLabel,
      get: mockGetIssue,
      listComments: mockListComments,
      deleteComment: mockDeleteComment
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
const { helpPlugin } = await import('../src/plugins/help/help.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Help Plugin', () => {
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
      title: 'Test Issue',
      html_url: 'https://github.com/test-owner/test-repo/issues/123',
      state: 'open'
    },
    comment: {
      id: 456,
      body: '/help',
      user: {
        login: 'test-user'
      },
      html_url: 'https://github.com/test-owner/test-repo/issues/123#comment-456'
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

    process.env.GITHUB_TOKEN = 'test-token'

    // Default mock responses
    mockGetIssue.mockResolvedValue({
      data: {
        labels: []
      }
    })

    mockListComments.mockResolvedValue({
      data: []
    })

    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(helpPlugin.name).toBe('help')
    })

    it('should have genericComment handler', () => {
      expect(helpPlugin.handlers.genericComment).toBeDefined()
      expect(typeof helpPlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation', () => {
      expect(helpPlugin.help).toBeDefined()
      expect(helpPlugin.help?.description).toBeDefined()
      expect(helpPlugin.help?.commands).toBeDefined()
      expect(helpPlugin.help?.commands?.length).toBe(4)
    })
  })

  describe('/help command', () => {
    it('should add help label when /help is commented', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        labels: ['help wanted']
      })
      expect(mockCreateComment).toHaveBeenCalled()
    })

    it('should not add help label if already present', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'help wanted' }]
        }
      })

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should post informational comment with help message', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockCreateComment).toHaveBeenCalled()
      const commentCall = mockCreateComment.mock.calls[0][0]
      expect(commentCall.body).toContain(
        'This request has been marked as needing help from a contributor'
      )
      expect(commentCall.body).toContain('/remove-help')
    })
  })

  describe('/remove-help command', () => {
    it('should remove help label when /remove-help is commented', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/remove-help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'help wanted' }]
        }
      })

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        name: 'help wanted'
      })
    })

    it('should not remove help label if not present', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/remove-help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockRemoveLabel).not.toHaveBeenCalled()
    })

    it('should prune old bot comments when removing label', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/remove-help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'help wanted' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: [
          {
            id: 789,
            user: { login: 'github-actions[bot]' },
            body: 'This request has been marked as needing help from a contributor.'
          }
        ]
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockListComments).toHaveBeenCalled()
      expect(mockDeleteComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 789
      })
    })

    it('should also remove good-first-issue label if present', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/remove-help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'help wanted' }, { name: 'good first issue' }]
        }
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        name: 'help wanted'
      })
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        name: 'good first issue'
      })
    })
  })

  describe('/good-first-issue command', () => {
    it('should add both labels when /good-first-issue is commented', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/good-first-issue'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        labels: ['good first issue']
      })
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        labels: ['help wanted']
      })
    })

    it('should not add help label if already present', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/good-first-issue'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'help wanted' }]
        }
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockAddLabels).toHaveBeenCalledTimes(1)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        labels: ['good first issue']
      })
    })

    it('should post informational comment with good-first-issue message', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/good-first-issue'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockCreateComment).toHaveBeenCalled()
      const commentCall = mockCreateComment.mock.calls[0][0]
      expect(commentCall.body).toContain(
        'This request has been marked as suitable for new contributors'
      )
      expect(commentCall.body).toContain('/remove-good-first-issue')
    })
  })

  describe('/remove-good-first-issue command', () => {
    it('should remove only good-first-issue label', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/remove-good-first-issue'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'help wanted' }, { name: 'good first issue' }]
        }
      })

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        name: 'good first issue'
      })
      expect(mockRemoveLabel).toHaveBeenCalledTimes(1)
    })

    it('should prune good-first-issue bot comments', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/remove-good-first-issue'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'good first issue' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: [
          {
            id: 999,
            user: { login: 'github-actions[bot]' },
            body: 'This request has been marked as suitable for new contributors.'
          }
        ]
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockDeleteComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 999
      })
    })
  })

  describe('edge cases', () => {
    it('should return success without action for non-matching comment', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: 'This is just a regular comment'
        }
      }

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
      expect(mockRemoveLabel).not.toHaveBeenCalled()
    })

    it('should handle missing comment body', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: ''
        }
      }

      const result = await helpPlugin.handlers.genericComment!(
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

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle closed issues', async () => {
      const payload = {
        ...basePayload,
        issue: {
          ...basePayload.issue,
          state: 'closed'
        },
        comment: {
          ...basePayload.comment,
          body: '/help'
        }
      }

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/help'
        }
      }

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
    })

    it('should work with pull requests', async () => {
      const payload = {
        ...basePayload,
        issue: undefined,
        pull_request: {
          number: 456,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/456',
          state: 'open'
        },
        comment: {
          ...basePayload.comment,
          body: '/help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockGetIssue).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 456
      })
    })

    it('should be case-insensitive for commands', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/HELP'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await helpPlugin.handlers.genericComment!(
        payload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })

    it('should set correct outputs', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      const outputs = agent.getOutputs()
      expect(outputs.help_action).toBe('help-added')
      expect(outputs.issue_number).toBe('123')
    })
  })

  describe('comment pruning', () => {
    it('should only prune bot comments', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/remove-help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'help wanted' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: [
          {
            id: 111,
            user: { login: 'github-actions[bot]' },
            body: 'This request has been marked as needing help from a contributor.'
          },
          {
            id: 222,
            user: { login: 'human-user' },
            body: 'This request has been marked as needing help from a contributor.'
          }
        ]
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockDeleteComment).toHaveBeenCalledTimes(1)
      expect(mockDeleteComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 111
      })
    })

    it('should only prune comments with matching text', async () => {
      const payload = {
        ...basePayload,
        comment: {
          ...basePayload.comment,
          body: '/remove-help'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'help wanted' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: [
          {
            id: 333,
            user: { login: 'github-actions[bot]' },
            body: 'This request has been marked as needing help from a contributor.'
          },
          {
            id: 444,
            user: { login: 'github-actions[bot]' },
            body: 'Some other bot comment'
          }
        ]
      })

      await helpPlugin.handlers.genericComment!(payload, context, agent)

      expect(mockDeleteComment).toHaveBeenCalledTimes(1)
      expect(mockDeleteComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 333
      })
    })
  })
})
