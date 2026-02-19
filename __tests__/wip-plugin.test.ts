/**
 * Unit tests for the WIP plugin
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
const { wipPlugin } = await import('../src/plugins/wip/wip.js')
const { PluginAgentImpl } = await import('../src/plugins/plugin-agent.js')
import type { EventContext } from '../src/types/index.js'

describe('WIP Plugin', () => {
  let agent: InstanceType<typeof PluginAgentImpl>
  let context: EventContext

  const getHandler = () => wipPlugin.handlers.pullRequest!

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
    mockLoggerInfo.mockClear()
    mockLoggerWarning.mockClear()
    mockLoggerError.mockClear()
  })

  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  describe('plugin structure', () => {
    it('should have correct name', () => {
      expect(wipPlugin.name).toBe('wip')
    })

    it('should have pullRequest handler', () => {
      expect(wipPlugin.handlers.pullRequest).toBeDefined()
      expect(typeof wipPlugin.handlers.pullRequest).toBe('function')
    })

    it('should have help documentation', () => {
      expect(wipPlugin.help).toBeDefined()
      expect(wipPlugin.help?.description).toContain('Work In Progress')
      expect(wipPlugin.help?.description).toContain(
        'do-not-merge/work-in-progress'
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
    })

    it('should process PR when edited', async () => {
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
    })

    it('should process PR when marked ready_for_review', async () => {
      const payload = {
        action: 'ready_for_review',
        pull_request: {
          number: 1,
          title: 'Ready PR',
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/work-in-progress' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        name: 'do-not-merge/work-in-progress'
      })
    })

    it('should process PR when converted_to_draft', async () => {
      const payload = {
        action: 'converted_to_draft',
        pull_request: {
          number: 1,
          title: 'Draft PR',
          state: 'open',
          draft: true,
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
        labels: ['do-not-merge/work-in-progress']
      })
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
      expect(mockGetIssue).not.toHaveBeenCalled()
    })
  })

  describe('WIP title detection', () => {
    it('should add label for title starting with WIP:', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'WIP: Work in progress',
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
        labels: ['do-not-merge/work-in-progress']
      })
    })

    it('should add label for title starting with [WIP]', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: '[WIP] Feature in progress',
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

    it('should add label for lowercase wip title', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'wip - working on it',
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

    it('should NOT add label for title containing WIP in middle', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'This is not WIP anymore',
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

    it('should remove label when WIP prefix is removed from title', async () => {
      const payload = {
        action: 'edited',
        pull_request: {
          number: 1,
          title: 'Ready for review',
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/work-in-progress' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        name: 'do-not-merge/work-in-progress'
      })
    })
  })

  describe('draft PR detection', () => {
    it('should add label when PR is draft', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Normal title',
          state: 'open',
          draft: true,
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
        labels: ['do-not-merge/work-in-progress']
      })
    })

    it('should add label when draft AND has WIP title', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'WIP: Draft PR',
          state: 'open',
          draft: true,
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
        labels: ['do-not-merge/work-in-progress']
      })
    })

    it('should remove label when PR is no longer draft', async () => {
      const payload = {
        action: 'ready_for_review',
        pull_request: {
          number: 1,
          title: 'Ready for review',
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/work-in-progress' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(true)
      expect(mockRemoveLabel).toHaveBeenCalled()
    })
  })

  describe('label management', () => {
    it('should not add label if already present', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'WIP: Work in progress',
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/work-in-progress' }]
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
      expect(result.tookAction).toBe(false)
      expect(mockAddLabels).not.toHaveBeenCalled()
    })

    it('should not remove label if not present', async () => {
      const payload = {
        action: 'edited',
        pull_request: {
          number: 1,
          title: 'Ready for review',
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

    it('should handle string labels from GitHub API', async () => {
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: ['bug', 'enhancement']
        }
      })

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle missing GITHUB_TOKEN', async () => {
      delete process.env.GITHUB_TOKEN

      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'WIP: Test',
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

    it('should handle API errors gracefully', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'WIP: Test',
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

      mockGetIssue.mockRejectedValue(new Error('API Error'))

      const handler = getHandler()
      const result = await handler(payload, context, agent)

      expect(result.success).toBe(false)
      expect(result.message).toContain('API Error')
    })

    it('should handle missing draft property', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 1,
          title: 'Regular PR',
          state: 'open',
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

    it('should set correct outputs on label add', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'WIP: Feature',
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: []
        }
      })

      const handler = getHandler()
      await handler(payload, context, agent)

      expect(agent.didTakeAction()).toBe(true)
      const outputs = agent.getOutputs()
      expect(outputs.wip_action).toBe('label-added')
      expect(outputs.issue_number).toBe('42')
    })

    it('should set correct outputs on label remove', async () => {
      const payload = {
        action: 'edited',
        pull_request: {
          number: 42,
          title: 'Ready for review',
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

      mockGetIssue.mockResolvedValue({
        data: {
          labels: [{ name: 'do-not-merge/work-in-progress' }]
        }
      })

      const handler = getHandler()
      await handler(payload, context, agent)

      expect(agent.didTakeAction()).toBe(true)
      const outputs = agent.getOutputs()
      expect(outputs.wip_action).toBe('label-removed')
      expect(outputs.issue_number).toBe('42')
    })
  })

  describe('title regex variations', () => {
    const testCases = [
      { title: 'WIP: feature', shouldMatch: true },
      { title: 'WIP - feature', shouldMatch: true },
      { title: '[WIP] feature', shouldMatch: true },
      { title: '(WIP) feature', shouldMatch: true },
      { title: 'wip: feature', shouldMatch: true },
      { title: 'Wip: feature', shouldMatch: true },
      { title: 'WiP: feature', shouldMatch: true },
      { title: 'WIP feature', shouldMatch: true },
      { title: 'WIP', shouldMatch: false }, // No delimiter after WIP
      { title: 'WIPP: feature', shouldMatch: false },
      { title: 'My WIP feature', shouldMatch: false },
      { title: 'feature WIP', shouldMatch: false }
    ]

    testCases.forEach(({ title, shouldMatch }) => {
      it(`should ${shouldMatch ? 'match' : 'not match'} title "${title}"`, async () => {
        const payload = {
          action: 'opened',
          pull_request: {
            number: 1,
            title,
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

        mockGetIssue.mockResolvedValue({
          data: {
            labels: []
          }
        })

        const handler = getHandler()
        const result = await handler(payload, context, agent)

        expect(result.success).toBe(true)
        if (shouldMatch) {
          expect(mockAddLabels).toHaveBeenCalled()
        } else {
          expect(mockAddLabels).not.toHaveBeenCalled()
        }
      })
    })
  })
})
