/**
 * Unit tests for the lgtm plugin
 */
import { jest } from '@jest/globals'

// Mock dependencies before importing the module
const mockGetIssue = jest.fn()
const mockAddLabels = jest.fn()
const mockRemoveLabel = jest.fn()
const mockCreateComment = jest.fn()
const mockCheckCollaborator = jest.fn()

const mockGetOctokit = jest.fn(() => ({
  rest: {
    issues: {
      get: mockGetIssue,
      addLabels: mockAddLabels,
      removeLabel: mockRemoveLabel,
      createComment: mockCreateComment
    },
    repos: {
      checkCollaborator: mockCheckCollaborator
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
const { lgtmPlugin } = await import('../src/plugins/lgtm/lgtm.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('LGTM Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  const getGenericHandler = () => lgtmPlugin.handlers.genericComment!
  const getPRHandler = () => lgtmPlugin.handlers.pullRequest!

  const basePayload = {
    action: 'created',
    repository: {
      name: 'test-repo',
      owner: { login: 'test-owner' },
      full_name: 'test-owner/test-repo'
    }
  }

  const prIssuePayload = {
    ...basePayload,
    comment: {
      id: 1,
      body: '/lgtm',
      user: { login: 'reviewer' },
      html_url:
        'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
    },
    issue: {
      number: 1,
      title: 'Test PR',
      html_url: 'https://github.com/test-owner/test-repo/pull/1',
      state: 'open',
      user: { login: 'pr-author' },
      pull_request: {
        url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
        html_url: 'https://github.com/test-owner/test-repo/pull/1',
        diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
        patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
        merged_at: null
      }
    }
  }

  beforeEach(() => {
    agent = new PluginAgentImpl()
    context = {
      eventName: 'issue_comment',
      eventGUID: 'test-guid-123',
      repository: 'test-owner/test-repo',
      sha: 'abc123',
      ref: 'refs/heads/main',
      actor: 'reviewer',
      workflow: 'test-workflow',
      runId: '123',
      runNumber: '1'
    }

    process.env.GITHUB_TOKEN = 'test-token'
    mockGetIssue.mockClear()
    mockAddLabels.mockClear()
    mockRemoveLabel.mockClear()
    mockCreateComment.mockClear()
    mockCheckCollaborator.mockClear()
    mockLoggerInfo.mockClear()
    mockLoggerError.mockClear()

    // Default: collaborator check passes
    mockCheckCollaborator.mockResolvedValue({ status: 204 })
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(lgtmPlugin.name).toBe('lgtm')
    })

    it('should have genericComment handler', () => {
      expect(lgtmPlugin.handlers.genericComment).toBeDefined()
      expect(typeof lgtmPlugin.handlers.genericComment).toBe('function')
    })

    it('should have pullRequest handler', () => {
      expect(lgtmPlugin.handlers.pullRequest).toBeDefined()
      expect(typeof lgtmPlugin.handlers.pullRequest).toBe('function')
    })

    it('should have help documentation', () => {
      expect(lgtmPlugin.help).toBeDefined()
      expect(lgtmPlugin.help?.description).toContain('lgtm')
      expect(lgtmPlugin.help?.commands).toHaveLength(3)
    })
  })

  describe('/lgtm command', () => {
    it('should add lgtm label when /lgtm is commented by a collaborator', async () => {
      mockGetIssue.mockResolvedValue({ data: { labels: [] } })

      const result = await getGenericHandler()(prIssuePayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        labels: ['lgtm']
      })
      expect(agent.getOutputs()['lgtm_action']).toBe('lgtm-added')
      expect(agent.getOutputs()['issue_number']).toBe('1')
    })

    it('should not add lgtm label if already present', async () => {
      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'lgtm' }] }
      })

      const result = await getGenericHandler()(prIssuePayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should not allow PR author to LGTM own PR', async () => {
      const selfLgtmPayload = {
        ...prIssuePayload,
        comment: {
          ...prIssuePayload.comment,
          user: { login: 'pr-author' }
        }
      }

      const result = await getGenericHandler()(selfLgtmPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('cannot LGTM your own PR')
        })
      )
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should reject non-collaborator attempt to add lgtm', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), {
        status: 404
      })
      mockCheckCollaborator.mockRejectedValue(notFoundError)

      const result = await getGenericHandler()(prIssuePayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('restricted to collaborators')
        })
      )
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should handle /lgtm with no-issue option', async () => {
      mockGetIssue.mockResolvedValue({ data: { labels: [] } })

      const payload = {
        ...prIssuePayload,
        comment: { ...prIssuePayload.comment, body: '/lgtm no-issue' }
      }

      const result = await getGenericHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalled()
    })

    it('should handle /lgtm in multiline comment', async () => {
      mockGetIssue.mockResolvedValue({ data: { labels: [] } })

      const payload = {
        ...prIssuePayload,
        comment: {
          ...prIssuePayload.comment,
          body: 'Nice work!\n/lgtm\nKeep it up!'
        }
      }

      const result = await getGenericHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalled()
    })
  })

  describe('/lgtm cancel command', () => {
    it('should remove lgtm label when /lgtm cancel is commented', async () => {
      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'lgtm' }] }
      })

      const payload = {
        ...prIssuePayload,
        comment: { ...prIssuePayload.comment, body: '/lgtm cancel' }
      }

      const result = await getGenericHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'lgtm'
      })
      expect(agent.getOutputs()['lgtm_action']).toBe('lgtm-removed')
    })

    it('should not remove lgtm label if not present', async () => {
      mockGetIssue.mockResolvedValue({ data: { labels: [] } })

      const payload = {
        ...prIssuePayload,
        comment: { ...prIssuePayload.comment, body: '/lgtm cancel' }
      }

      const result = await getGenericHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockRemoveLabel).not.toHaveBeenCalled()
    })

    it('should allow PR author to cancel LGTM', async () => {
      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'lgtm' }] }
      })

      const selfCancelPayload = {
        ...prIssuePayload,
        comment: {
          ...prIssuePayload.comment,
          body: '/lgtm cancel',
          user: { login: 'pr-author' }
        }
      }

      const result = await getGenericHandler()(
        selfCancelPayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      // PR author is also checked as collaborator; assume they pass
      // The important thing: no "cannot LGTM your own PR" error
      expect(mockCreateComment).not.toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('cannot LGTM your own PR')
        })
      )
    })
  })

  describe('/remove-lgtm command', () => {
    it('should remove lgtm label when /remove-lgtm is commented', async () => {
      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'lgtm' }] }
      })

      const payload = {
        ...prIssuePayload,
        comment: { ...prIssuePayload.comment, body: '/remove-lgtm' }
      }

      const result = await getGenericHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalled()
    })
  })

  describe('review-based LGTM', () => {
    const reviewPayload = {
      action: 'submitted',
      review: {
        id: 1,
        body: '',
        state: 'approved',
        user: { login: 'reviewer' }
      },
      pull_request: {
        number: 1,
        title: 'Test PR',
        html_url: 'https://github.com/test-owner/test-repo/pull/1',
        state: 'open',
        user: { login: 'pr-author' }
      },
      repository: {
        name: 'test-repo',
        owner: { login: 'test-owner' },
        full_name: 'test-owner/test-repo'
      }
    }

    it('should add lgtm label when review is approved', async () => {
      mockGetIssue.mockResolvedValue({ data: { labels: [] } })

      const result = await getGenericHandler()(reviewPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ['lgtm'] })
      )
      expect(agent.getOutputs()['lgtm_action']).toBe('lgtm-added')
    })

    it('should remove lgtm label when review requests changes', async () => {
      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'lgtm' }] }
      })

      const changesPayload = {
        ...reviewPayload,
        review: { ...reviewPayload.review, state: 'changes_requested' }
      }

      const result = await getGenericHandler()(changesPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalled()
      expect(agent.getOutputs()['lgtm_action']).toBe('lgtm-removed')
    })

    it('should not add lgtm label when reviewer is PR author', async () => {
      const selfReviewPayload = {
        ...reviewPayload,
        review: { ...reviewPayload.review, user: { login: 'pr-author' } }
      }

      const result = await getGenericHandler()(
        selfReviewPayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('cannot LGTM your own PR')
        })
      )
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should skip non-submitted review actions', async () => {
      const editedPayload = { ...reviewPayload, action: 'edited' }

      const result = await getGenericHandler()(editedPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should skip review with comment state', async () => {
      const commentPayload = {
        ...reviewPayload,
        review: { ...reviewPayload.review, state: 'commented' }
      }

      const result = await getGenericHandler()(commentPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should skip review body with /lgtm command', async () => {
      const reviewWithCommandPayload = {
        ...reviewPayload,
        review: { ...reviewPayload.review, body: '/lgtm' }
      }

      const result = await getGenericHandler()(
        reviewWithCommandPayload,
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })
  })

  describe('pull request synchronize handler', () => {
    const prPayload = {
      action: 'synchronize',
      pull_request: {
        number: 1,
        title: 'Test PR',
        state: 'open',
        draft: false,
        user: { login: 'pr-author' },
        head: { ref: 'feature-branch', sha: 'newsha' },
        base: { ref: 'main', sha: 'basesha' },
        html_url: 'https://github.com/test-owner/test-repo/pull/1'
      },
      repository: {
        name: 'test-repo',
        owner: { login: 'test-owner' },
        full_name: 'test-owner/test-repo'
      }
    }

    beforeEach(() => {
      context = { ...context, eventName: 'pull_request' }
    })

    it('should remove lgtm label when new commits are pushed', async () => {
      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'lgtm' }] }
      })

      const result = await getPRHandler()(prPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'lgtm'
      })
      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('New changes are detected')
        })
      )
      expect(agent.getOutputs()['lgtm_action']).toBe('lgtm-removed')
      expect(agent.getOutputs()['lgtm_reason']).toBe('new-commits')
      expect(agent.getOutputs()['issue_number']).toBe('1')
    })

    it('should do nothing when PR does not have lgtm label', async () => {
      mockGetIssue.mockResolvedValue({ data: { labels: [] } })

      const result = await getPRHandler()(prPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockRemoveLabel).not.toHaveBeenCalled()
      expect(mockCreateComment).not.toHaveBeenCalled()
    })

    it('should ignore non-synchronize PR events', async () => {
      const openedPayload = { ...prPayload, action: 'opened' }

      const result = await getPRHandler()(openedPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should return success without action for non-matching comment', async () => {
      const payload = {
        ...prIssuePayload,
        comment: {
          ...prIssuePayload.comment,
          body: 'This is a regular comment'
        }
      }

      const result = await getGenericHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should not process issues (only PRs)', async () => {
      const issuePayload = {
        ...prIssuePayload,
        issue: {
          number: 1,
          title: 'Test Issue',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          state: 'open'
          // no pull_request field
        }
      }

      const result = await getGenericHandler()(issuePayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should not process closed PRs', async () => {
      const closedPayload = {
        ...prIssuePayload,
        issue: { ...prIssuePayload.issue, state: 'closed' }
      }

      const result = await getGenericHandler()(closedPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockGetIssue).not.toHaveBeenCalled()
    })

    it('should handle missing comment body', async () => {
      const noBodyPayload = {
        ...prIssuePayload,
        comment: { ...prIssuePayload.comment, body: '' }
      }

      const result = await getGenericHandler()(noBodyPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing comment', async () => {
      const noCommentPayload = {
        action: 'created',
        issue: prIssuePayload.issue,
        repository: prIssuePayload.repository
      }

      const result = await getGenericHandler()(noCommentPayload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const result = await getGenericHandler()(prIssuePayload, context, agent)

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(agent.hasFailed()).toBe(true)
    })

    it('should handle API errors gracefully', async () => {
      mockCheckCollaborator.mockResolvedValue({ status: 204 })
      mockGetIssue.mockRejectedValue(
        new Error('API Error: Rate limit exceeded')
      )

      const result = await getGenericHandler()(prIssuePayload, context, agent)

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(agent.hasFailed()).toBe(true)
      expect(agent.getFailureMessage()).toContain('API Error')
    })

    it('should rethrow non-404 collaborator check errors', async () => {
      const serverError = Object.assign(new Error('Internal Server Error'), {
        status: 500
      })
      mockCheckCollaborator.mockRejectedValue(serverError)

      const result = await getGenericHandler()(prIssuePayload, context, agent)

      expect(result.success).toBe(false)
      expect(agent.hasFailed()).toBe(true)
    })
  })
})
