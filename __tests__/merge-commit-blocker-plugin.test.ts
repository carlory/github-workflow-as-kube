/**
 * Unit tests for the Merge Commit Blocker plugin
 */
import { jest } from '@jest/globals'

// Mock dependencies before importing the module
const mockGetIssue = jest.fn()
const mockAddLabels = jest.fn()
const mockRemoveLabel = jest.fn()
const mockListCommits = jest.fn()
const mockGetCommit = jest.fn()
const mockListComments = jest.fn()
const mockDeleteComment = jest.fn()
const mockCreateComment = jest.fn()

const mockGetOctokit = jest.fn(() => ({
  rest: {
    issues: {
      get: mockGetIssue,
      addLabels: mockAddLabels,
      removeLabel: mockRemoveLabel,
      listComments: mockListComments,
      deleteComment: mockDeleteComment,
      createComment: mockCreateComment
    },
    pulls: {
      listCommits: mockListCommits
    },
    repos: {
      getCommit: mockGetCommit
    }
  }
}))

const mockLoggerInfo = jest.fn()
const mockLoggerWarning = jest.fn()
const mockLoggerError = jest.fn()

jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit
}))

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: mockLoggerInfo,
    warning: mockLoggerWarning,
    error: mockLoggerError,
    debug: jest.fn()
  }))
}))

// Import after mocking
const { mergeCommitBlockerPlugin } =
  await import('../src/plugins/merge-commit-blocker/merge-commit-blocker.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Merge Commit Blocker Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  const getHandler = () => mergeCommitBlockerPlugin.handlers.pullRequest!

  beforeEach(() => {
    agent = new PluginAgentImpl()
    context = {
      eventName: 'pull_request',
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
    mockListCommits.mockClear()
    mockGetCommit.mockClear()
    mockListComments.mockClear()
    mockDeleteComment.mockClear()
    mockCreateComment.mockClear()
    mockLoggerInfo.mockClear()
    mockLoggerWarning.mockClear()
    mockLoggerError.mockClear()
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(mergeCommitBlockerPlugin.name).toBe('merge-commit-blocker')
    })

    it('should have pullRequest handler', () => {
      expect(mergeCommitBlockerPlugin.handlers.pullRequest).toBeDefined()
      expect(typeof mergeCommitBlockerPlugin.handlers.pullRequest).toBe(
        'function'
      )
    })

    it('should have help documentation', () => {
      expect(mergeCommitBlockerPlugin.help).toBeDefined()
      expect(mergeCommitBlockerPlugin.help?.description).toContain(
        'merge commit blocker'
      )
      expect(mergeCommitBlockerPlugin.help?.description).toContain(
        'do-not-merge/contains-merge-commits'
      )
    })
  })

  describe('PR actions', () => {
    it('should process PR when opened', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Regular PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'commit1' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(mockListCommits).toHaveBeenCalled()
    })

    it('should process PR when reopened', async () => {
      const payload = {
        action: 'reopened',
        pull_request: {
          number: 1,
          title: 'Regular PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'commit1' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(mockListCommits).toHaveBeenCalled()
    })

    it('should process PR when synchronized', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'Regular PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'commit1' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(mockListCommits).toHaveBeenCalled()
    })

    it('should skip PR when edited', async () => {
      const payload = {
        action: 'edited',
        pull_request: {
          number: 1,
          title: 'Updated PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockListCommits).not.toHaveBeenCalled()
    })

    it('should skip PR when closed', async () => {
      const payload = {
        action: 'closed',
        pull_request: {
          number: 1,
          title: 'Closed PR',
          state: 'closed',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockListCommits).not.toHaveBeenCalled()
    })

    it('should skip PR when labeled', async () => {
      const payload = {
        action: 'labeled',
        pull_request: {
          number: 1,
          title: 'Regular PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockListCommits).not.toHaveBeenCalled()
    })
  })

  describe('merge commit detection', () => {
    it('should detect merge commit with multiple parents', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'PR with merge commit',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'merge-commit-sha' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }]
        }
      })

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
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        labels: ['do-not-merge/contains-merge-commits']
      })
    })

    it('should NOT detect merge commit with single parent', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'PR without merge commit',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'regular-commit-sha' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should detect merge commit among multiple commits', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'PR with mixed commits',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [
          { sha: 'regular-commit-1' },
          { sha: 'merge-commit' },
          { sha: 'regular-commit-2' }
        ]
      })

      mockGetCommit
        .mockResolvedValueOnce({
          data: {
            parents: [{ sha: 'parent1' }]
          }
        })
        .mockResolvedValueOnce({
          data: {
            parents: [{ sha: 'parent1' }, { sha: 'parent2' }]
          }
        })

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

    it('should handle commit with no parents (root commit)', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'PR with root commit',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'root-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: []
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
    })
  })

  describe('label addition', () => {
    it('should add label when merge commits are detected', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'PR with merge commit',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'merge-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }]
        }
      })

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
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        labels: ['do-not-merge/contains-merge-commits']
      })
    })

    it('should not add label if already present', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'PR with merge commit',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'merge-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/contains-merge-commits' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
    })
  })

  describe('label removal', () => {
    it('should remove label when merge commits are fixed', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'PR fixed by rebase',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'regular-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/contains-merge-commits' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: []
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        name: 'do-not-merge/contains-merge-commits'
      })
    })

    it('should not remove label if not present', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'Clean PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'regular-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

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
    })
  })

  describe('comment posting', () => {
    it('should post comment when label is added', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'PR with merge commit',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'merge-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        body: expect.stringContaining('do-not-merge/contains-merge-commits')
      })
      expect(mockCreateComment).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        body: expect.stringContaining('git rebase')
      })
    })
  })

  describe('comment deletion', () => {
    it('should delete old bot comments when label is removed', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'PR fixed by rebase',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'regular-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/contains-merge-commits' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: [
          {
            id: 123,
            user: { login: 'github-actions[bot]' },
            body: 'Adding label `do-not-merge/contains-merge-commits`'
          }
        ]
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockListComments).toHaveBeenCalled()
      expect(mockDeleteComment).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        comment_id: 123
      })
    })

    it('should not delete comments from other users', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'PR fixed by rebase',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'regular-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/contains-merge-commits' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: [
          {
            id: 123,
            user: { login: 'regular-user' },
            body: 'Adding label `do-not-merge/contains-merge-commits`'
          }
        ]
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockDeleteComment).not.toHaveBeenCalled()
    })

    it('should handle errors when deleting comments', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'PR fixed by rebase',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'regular-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/contains-merge-commits' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: [
          {
            id: 123,
            user: { login: 'github-actions[bot]' },
            body: 'Adding label `do-not-merge/contains-merge-commits`'
          }
        ]
      })

      mockDeleteComment.mockRejectedValue(new Error('Delete failed'))

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockLoggerWarning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete old comments')
      )
    })
  })

  describe('edge cases', () => {
    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.message).toContain('GITHUB_TOKEN not found')
    })

    it('should handle API errors when listing commits', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockRejectedValue(new Error('API Error'))

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.message).toContain('API Error')
    })

    it('should handle API errors when getting commit details', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'commit1' }]
      })

      mockGetCommit.mockRejectedValue(new Error('Commit not found'))

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })

    it('should handle API errors when adding labels', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'merge-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      mockAddLabels.mockRejectedValue(new Error('Label add failed'))

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Label add failed')
    })

    it('should handle string labels from GitHub API', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'regular-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: ['bug', 'enhancement']
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
    })

    it('should set correct outputs on label add', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/42'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'merge-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }, { sha: 'parent2' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      mockAddLabels.mockResolvedValue({})
      mockCreateComment.mockResolvedValue({})

      const handler = getHandler()
      await handler(payload, context, agent)

      expect(agent.didTakeAction()).toBe(true)
      const outputs = agent.getOutputs()
      expect(outputs.merge_commit_blocker_action).toBe('label-added')
      expect(outputs.issue_number).toBe('42')
    })

    it('should set correct outputs on label remove', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 42,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/42'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: [{ sha: 'regular-commit' }]
      })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/contains-merge-commits' }]
        }
      })

      mockListComments.mockResolvedValue({
        data: []
      })

      const handler = getHandler()
      await handler(payload, context, agent)

      expect(agent.didTakeAction()).toBe(true)
      const outputs = agent.getOutputs()
      expect(outputs.merge_commit_blocker_action).toBe('label-removed')
      expect(outputs.issue_number).toBe('42')
    })

    it('should handle pagination when listing commits', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      const firstPageCommits = Array(100)
        .fill(null)
        .map((_, i) => ({ sha: `commit-${i}` }))
      const secondPageCommits = [{ sha: 'commit-100' }]

      mockListCommits
        .mockResolvedValueOnce({
          data: firstPageCommits
        })
        .mockResolvedValueOnce({
          data: secondPageCommits
        })

      mockGetCommit.mockResolvedValue({
        data: {
          parents: [{ sha: 'parent1' }]
        }
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(mockListCommits).toHaveBeenCalledTimes(2)
    })

    it('should handle empty commit list', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          state: 'open',
          draft: false,
          user: { login: 'user1' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test/repo/pull/1'
        },
        repository: {
          name: 'repo',
          owner: { login: 'test' },
          full_name: 'test/repo'
        }
      }

      mockListCommits.mockResolvedValue({
        data: []
      })

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
    })
  })
})
