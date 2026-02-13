/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => ({
  context: {
    eventName: 'push',
    runId: 12345,
    repo: { owner: 'test-owner', repo: 'test-repo' },
    sha: 'abc123',
    ref: 'refs/heads/main',
    actor: 'test-user',
    workflow: 'test-workflow',
    runNumber: 1,
    payload: {
      repository: {
        full_name: 'test-owner/test-repo'
      }
    }
  },
  getOctokit: jest.fn()
}))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation((name: string) => {
      if (name === 'github-token') return 'test-token'
      if (name === 'plugins') return 'dog'
      return ''
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Sets the event outputs', async () => {
    await run()

    // Verify the event outputs were set.
    expect(core.setOutput).toHaveBeenCalledWith('event_name', 'push')
    expect(core.setOutput).toHaveBeenCalledWith('event_guid', '12345')
    expect(core.setOutput).toHaveBeenCalledWith(
      'repository',
      'test-owner/test-repo'
    )
    expect(core.setOutput).toHaveBeenCalledWith('plugins_enabled', 'dog')
  })

  it('Sets a failed status on error', async () => {
    // Clear the getInput mock and return an invalid value.
    core.getInput.mockClear().mockImplementation(() => {
      throw new Error('Input error')
    })

    await run()

    // Verify that the action was marked as failed.
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Input error')
    )
  })
})
