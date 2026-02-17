/**
 * Unit tests for the size plugin
 */
import { jest } from '@jest/globals'

// Mock dependencies before importing the module
const mockListFiles = jest.fn()
const mockGetIssue = jest.fn()
const mockAddLabels = jest.fn()
const mockRemoveLabel = jest.fn()

const mockGetOctokit = jest.fn(() => ({
  rest: {
    pulls: {
      listFiles: mockListFiles
    },
    issues: {
      get: mockGetIssue,
      addLabels: mockAddLabels,
      removeLabel: mockRemoveLabel
    }
  }
}))

const mockLoggerInfo = jest.fn()
const mockLoggerWarn = jest.fn()
const mockLoggerError = jest.fn()

jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit
}))

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: jest.fn()
  }))
}))

// Import after mocking
const { sizePlugin } = await import('../src/plugins/size/size.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('Size Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  const getHandler = () => sizePlugin.handlers.pullRequest!

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
    mockListFiles.mockClear()
    mockGetIssue.mockClear()
    mockAddLabels.mockClear()
    mockRemoveLabel.mockClear()
    mockLoggerInfo.mockClear()
    mockLoggerWarn.mockClear()
    mockLoggerError.mockClear()
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(sizePlugin.name).toBe('size')
    })

    it('should have pullRequest handler', () => {
      expect(sizePlugin.handlers.pullRequest).toBeDefined()
      expect(typeof sizePlugin.handlers.pullRequest).toBe('function')
    })

    it('should have help documentation', () => {
      expect(sizePlugin.help).toBeDefined()
      expect(sizePlugin.help?.description).toContain('lines changed')
    })
  })

  describe('PR actions', () => {
    it('should process PR when opened', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [
          { additions: 5, deletions: 2, filename: 'file1.ts' },
          { additions: 3, deletions: 1, filename: 'file2.ts' }
        ]
      })

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
        labels: ['size/XS']
      })
      expect(agent.getOutputs()['size_label']).toBe('size/XS')
      expect(agent.getOutputs()['size_lines']).toBe('11')
    })

    it('should process PR when synchronized', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 10, deletions: 5, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
    })

    it('should skip PR when closed', async () => {
      const payload = {
        action: 'closed',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'closed',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
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
      expect(mockListFiles).not.toHaveBeenCalled()
    })
  })

  describe('size labeling', () => {
    it('should label XS for changes < 10 lines', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 5, deletions: 2, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/XS']
        })
      )
    })

    it('should label S for changes 10-29 lines', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 15, deletions: 5, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/S']
        })
      )
    })

    it('should label M for changes 30-99 lines', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 40, deletions: 20, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/M']
        })
      )
    })

    it('should label L for changes 100-499 lines', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 150, deletions: 100, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/L']
        })
      )
    })

    it('should label XL for changes 500-999 lines', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 400, deletions: 300, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/XL']
        })
      )
    })

    it('should label XXL for changes >= 1000 lines', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 600, deletions: 500, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/XXL']
        })
      )
    })
  })

  describe('label management', () => {
    it('should not add label if already present', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 5, deletions: 2, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'size/XS' }] }
      })

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should remove old size label and add new one', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 40, deletions: 20, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'size/XS' }, { name: 'bug' }] }
      })

      await getHandler()(payload, context, agent)

      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        name: 'size/XS'
      })
      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/M']
        })
      )
    })

    it('should not remove non-size labels', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 5, deletions: 2, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'bug' }, { name: 'enhancement' }] }
      })

      await getHandler()(payload, context, agent)

      expect(mockRemoveLabel).not.toHaveBeenCalled()
      expect(mockAddLabels).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle zero changes', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: []
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/XS']
        })
      )
    })

    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
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

    it('should handle API errors gracefully', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockRejectedValue(
        new Error('API Error: Rate limit exceeded')
      )

      const result = await getHandler()(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.tookAction).toBe(false)
      expect(agent.hasFailed()).toBe(true)
    })

    it('should handle label removal errors gracefully', async () => {
      const payload = {
        action: 'synchronize',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [{ additions: 40, deletions: 20, filename: 'file1.ts' }]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [{ name: 'size/XS' }] }
      })

      mockRemoveLabel.mockRejectedValue(new Error('Label not found'))

      const result = await getHandler()(payload, context, agent)

      // Should still succeed and add new label
      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockAddLabels).toHaveBeenCalled()
      expect(mockLoggerWarn).toHaveBeenCalled()
    })

    it('should handle multiple files', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Test PR',
          body: 'Test body',
          state: 'open',
          user: { login: 'test-user' },
          head: { ref: 'feature', sha: 'abc123' },
          base: { ref: 'main', sha: 'def456' },
          html_url: 'https://github.com/test-owner/test-repo/pull/1'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          full_name: 'test-owner/test-repo'
        }
      }

      mockListFiles.mockResolvedValue({
        data: [
          { additions: 10, deletions: 5, filename: 'file1.ts' },
          { additions: 20, deletions: 10, filename: 'file2.ts' },
          { additions: 15, deletions: 10, filename: 'file3.ts' }
        ]
      })

      mockGetIssue.mockResolvedValue({
        data: { labels: [] }
      })

      await getHandler()(payload, context, agent)

      expect(agent.getOutputs()['size_lines']).toBe('70')
      expect(mockAddLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: ['size/M']
        })
      )
    })
  })
})
