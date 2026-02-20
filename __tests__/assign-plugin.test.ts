/**
 * Unit tests for the assign plugin
 */
import { jest } from '@jest/globals'

// Mock dependencies before importing the module
const mockAddAssignees = jest.fn()
const mockRemoveAssignees = jest.fn()
const mockRequestReviewers = jest.fn()
const mockRemoveRequestedReviewers = jest.fn()

const mockGetOctokit = jest.fn(() => ({
  rest: {
    issues: {
      addAssignees: mockAddAssignees,
      removeAssignees: mockRemoveAssignees
    },
    pulls: {
      requestReviewers: mockRequestReviewers,
      removeRequestedReviewers: mockRemoveRequestedReviewers
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
const { assignPlugin } = await import('../src/plugins/assign/assign.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

/** Build a minimal PR-backed issue_comment payload */
function makePRPayload(body: string, commenter = 'commenter') {
  return {
    action: 'created',
    comment: {
      id: 1,
      body,
      user: { login: commenter },
      html_url: 'https://github.com/owner/repo/issues/1#issuecomment-1'
    },
    issue: {
      number: 1,
      title: 'Test PR',
      html_url: 'https://github.com/owner/repo/pull/1',
      state: 'open',
      pull_request: {
        url: 'https://api.github.com/repos/owner/repo/pulls/1',
        html_url: 'https://github.com/owner/repo/pull/1',
        diff_url: 'https://github.com/owner/repo/pull/1.diff',
        patch_url: 'https://github.com/owner/repo/pull/1.patch',
        merged_at: null
      }
    },
    repository: {
      name: 'repo',
      owner: { login: 'owner' },
      full_name: 'owner/repo'
    }
  }
}

/** Build a minimal plain-issue payload (no pull_request key) */
function makeIssuePayload(body: string, commenter = 'commenter') {
  return {
    action: 'created',
    comment: {
      id: 1,
      body,
      user: { login: commenter },
      html_url: 'https://github.com/owner/repo/issues/1#issuecomment-1'
    },
    issue: {
      number: 1,
      title: 'Test Issue',
      html_url: 'https://github.com/owner/repo/issues/1',
      state: 'open'
    },
    repository: {
      name: 'repo',
      owner: { login: 'owner' },
      full_name: 'owner/repo'
    }
  }
}

describe('Assign Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  const getHandler = () => assignPlugin.handlers.genericComment!

  beforeEach(() => {
    agent = new PluginAgentImpl()
    context = {
      eventName: 'issue_comment',
      eventGUID: 'test-guid-123',
      repository: 'owner/repo',
      sha: 'abc123',
      ref: 'refs/heads/main',
      actor: 'test-user',
      workflow: 'test-workflow',
      runId: '123',
      runNumber: '1'
    }

    process.env.GITHUB_TOKEN = 'test-token'
    mockAddAssignees.mockReset()
    mockRemoveAssignees.mockReset()
    mockRequestReviewers.mockReset()
    mockRemoveRequestedReviewers.mockReset()
    mockLoggerInfo.mockReset()
    mockLoggerError.mockReset()
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(assignPlugin.name).toBe('assign')
    })

    it('should have genericComment handler', () => {
      expect(assignPlugin.handlers.genericComment).toBeDefined()
      expect(typeof assignPlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation with 4 commands', () => {
      expect(assignPlugin.help).toBeDefined()
      expect(assignPlugin.help?.commands).toHaveLength(4)
    })
  })

  describe('/assign command', () => {
    it('should assign a specified user', async () => {
      const result = await getHandler()(
        makePRPayload('/assign @alice'),
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddAssignees).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        assignees: ['alice']
      })
      expect(agent.getOutputs()['assign_action']).toBe('assignees-updated')
      expect(agent.getOutputs()['issue_number']).toBe('1')
    })

    it('should assign multiple users', async () => {
      const result = await getHandler()(
        makePRPayload('/assign @alice @bob'),
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: ['alice', 'bob'] })
      )
    })

    it('should assign the commenter when no login is specified', async () => {
      const result = await getHandler()(
        makePRPayload('/assign', 'commenter'),
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: ['commenter'] })
      )
    })

    it('should strip leading @ from logins', async () => {
      await getHandler()(makePRPayload('/assign alice'), context, agent)

      expect(mockAddAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: ['alice'] })
      )
    })

    it('should work on plain issues too', async () => {
      const result = await getHandler()(
        makeIssuePayload('/assign @alice'),
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddAssignees).toHaveBeenCalled()
    })
  })

  describe('/unassign command', () => {
    it('should unassign a specified user', async () => {
      const result = await getHandler()(
        makePRPayload('/unassign @alice'),
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveAssignees).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        assignees: ['alice']
      })
    })

    it('should unassign the commenter when no login is specified', async () => {
      await getHandler()(
        makePRPayload('/unassign', 'commenter'),
        context,
        agent
      )

      expect(mockRemoveAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: ['commenter'] })
      )
    })
  })

  describe('/cc command', () => {
    it('should request a review from a specified user on a PR', async () => {
      const result = await getHandler()(
        makePRPayload('/cc @alice'),
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRequestReviewers).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        reviewers: ['alice']
      })
      expect(agent.getOutputs()['assign_action']).toBe('reviewers-updated')
    })

    it('should request reviews from multiple users', async () => {
      await getHandler()(makePRPayload('/cc @alice @bob'), context, agent)

      expect(mockRequestReviewers).toHaveBeenCalledWith(
        expect.objectContaining({ reviewers: ['alice', 'bob'] })
      )
    })

    it('should request a review from the commenter when no login is specified', async () => {
      await getHandler()(makePRPayload('/cc', 'commenter'), context, agent)

      expect(mockRequestReviewers).toHaveBeenCalledWith(
        expect.objectContaining({ reviewers: ['commenter'] })
      )
    })

    it('should NOT request reviews on plain issues', async () => {
      await getHandler()(makeIssuePayload('/cc @alice'), context, agent)

      expect(mockRequestReviewers).not.toHaveBeenCalled()
    })
  })

  describe('/uncc command', () => {
    it('should remove a review request from a specified user on a PR', async () => {
      const result = await getHandler()(
        makePRPayload('/uncc @alice'),
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveRequestedReviewers).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        reviewers: ['alice']
      })
    })

    it('should remove a review request from the commenter when no login is specified', async () => {
      await getHandler()(makePRPayload('/uncc', 'commenter'), context, agent)

      expect(mockRemoveRequestedReviewers).toHaveBeenCalledWith(
        expect.objectContaining({ reviewers: ['commenter'] })
      )
    })

    it('should NOT remove review requests on plain issues', async () => {
      await getHandler()(makeIssuePayload('/uncc @alice'), context, agent)

      expect(mockRemoveRequestedReviewers).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should return success without action for non-matching comment', async () => {
      const result = await getHandler()(
        makePRPayload('Just a regular comment'),
        context,
        agent
      )

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddAssignees).not.toHaveBeenCalled()
    })

    it('should return success without action when comment is missing', async () => {
      const payload = {
        action: 'created',
        issue: { number: 1, title: 'T', html_url: '', state: 'open' },
        repository: {
          name: 'repo',
          owner: { login: 'owner' },
          full_name: 'owner/repo'
        }
      }
      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const result = await getHandler()(
        makePRPayload('/assign @alice'),
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(agent.hasFailed()).toBe(true)
    })

    it('should handle API errors gracefully', async () => {
      mockAddAssignees.mockRejectedValue(new Error('API Error'))

      const result = await getHandler()(
        makePRPayload('/assign @alice'),
        context,
        agent
      )

      expect(result.success).toBe(false)
      expect(agent.hasFailed()).toBe(true)
      expect(agent.getFailureMessage()).toContain('API Error')
    })

    it('should be case-insensitive for commands', async () => {
      await getHandler()(makePRPayload('/ASSIGN @alice'), context, agent)

      expect(mockAddAssignees).toHaveBeenCalled()
    })

    it('should handle /assign in a multiline comment', async () => {
      await getHandler()(
        makePRPayload('LGTM!\n/assign @alice\nThanks'),
        context,
        agent
      )

      expect(mockAddAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: ['alice'] })
      )
    })

    it('should handle both /assign and /cc in the same comment', async () => {
      await getHandler()(
        makePRPayload('/assign @alice\n/cc @bob'),
        context,
        agent
      )

      expect(mockAddAssignees).toHaveBeenCalledWith(
        expect.objectContaining({ assignees: ['alice'] })
      )
      expect(mockRequestReviewers).toHaveBeenCalledWith(
        expect.objectContaining({ reviewers: ['bob'] })
      )
    })
  })
})
