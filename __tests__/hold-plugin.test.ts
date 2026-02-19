/**
 * Unit tests for the hold plugin
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
const { holdPlugin } = await import('../src/plugins/hold/hold.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Hold Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  // Helper to get the handler
  const getHandler = () => holdPlugin.handlers.genericComment!

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
      expect(holdPlugin.name).toBe('hold')
    })

    it('should have genericComment handler', () => {
      expect(holdPlugin.handlers.genericComment).toBeDefined()
      expect(typeof holdPlugin.handlers.genericComment).toBe('function')
    })

    it('should have help documentation', () => {
      expect(holdPlugin.help).toBeDefined()
      expect(holdPlugin.help?.description).toContain('do-not-merge/hold')
      expect(holdPlugin.help?.commands).toHaveLength(4)
    })
  })

  describe('/hold command', () => {
    it('should add hold label when /hold is commented on PR without label', async () => {
      // Handler is accessed via getHandler()
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
        labels: ['do-not-merge/hold']
      })
      expect(agent.getOutputs()['hold_action']).toBe('hold-added')
      expect(agent.getOutputs()['issue_number']).toBe('1')
    })

    it('should not add hold label if already present', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'do-not-merge/hold' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
      expect(mockRemoveLabel).not.toHaveBeenCalled()
    })
  })

  describe('/hold cancel command', () => {
    it('should remove hold label when /hold cancel is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold cancel',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'do-not-merge/hold' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'do-not-merge/hold'
      })
      expect(agent.getOutputs()['hold_action']).toBe('hold-removed')
      expect(agent.getOutputs()['issue_number']).toBe('1')
    })

    it('should not remove hold label if not present', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold cancel',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
      expect(mockAddLabels).not.toHaveBeenCalled()
    })
  })

  describe('/unhold command', () => {
    it('should remove hold label when /unhold is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/unhold',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'do-not-merge/hold' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalled()
    })
  })

  describe('/remove-hold command', () => {
    it('should remove hold label when /remove-hold is commented', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/remove-hold',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'do-not-merge/hold' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalled()
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
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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

    it('should not process issues (only PRs)', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold',
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

    it('should handle closed PRs', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'closed',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
          body: '/hold',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
          body: '/HOLD',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
          body: '/hold',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 42,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/42',
            html_url: 'https://github.com/test-owner/test-repo/pull/42',
            diff_url: 'https://github.com/test-owner/test-repo/pull/42.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/42.patch',
            merged_at: null
          }
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

      expect(agent.getOutputs()['hold_action']).toBe('hold-added')
      expect(agent.getOutputs()['issue_number']).toBe('42')
    })

    it('should handle API errors gracefully', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
    it('should handle /hold with trailing whitespace', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold   ',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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

    it('should handle /hold with additional text', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: '/hold waiting for review',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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

    it('should handle /hold in multiline comment', async () => {
      const payload = {
        action: 'created',
        comment: {
          id: 1,
          body: 'Some comments here\n/hold\nMore comments',
          user: { login: 'test-user' },
          html_url:
            'https://github.com/test-owner/test-repo/issues/1#issuecomment-1'
        },
        issue: {
          number: 1,
          title: 'Test PR',
          html_url: 'https://github.com/test-owner/test-repo/pull/1',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/test-owner/test-repo/pulls/1',
            html_url: 'https://github.com/test-owner/test-repo/pull/1',
            diff_url: 'https://github.com/test-owner/test-repo/pull/1.diff',
            patch_url: 'https://github.com/test-owner/test-repo/pull/1.patch',
            merged_at: null
          }
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
  })
})
