/**
 * Unit tests for src/plugins/registry.ts
 */
import { PluginRegistry } from '../src/plugins/registry.js'
import type { Plugin } from '../src/types/index.js'

describe('PluginRegistry', () => {
  let registry: PluginRegistry

  // Mock plugins for testing
  const mockPlugin1: Plugin = {
    name: 'test-plugin-1',
    handlers: {
      issue: async () => ({ success: true, tookAction: false })
    },
    config: { enabled: true }
  }

  const mockPlugin2: Plugin = {
    name: 'test-plugin-2',
    handlers: {
      pullRequest: async () => ({ success: true, tookAction: false }),
      genericComment: async () => ({ success: true, tookAction: false })
    },
    config: { enabled: true }
  }

  const mockPlugin3: Plugin = {
    name: 'test-plugin-3',
    handlers: {
      push: async () => ({ success: true, tookAction: false }),
      issueComment: async () => ({ success: true, tookAction: false })
    },
    config: { enabled: false }
  }

  const mockPlugin4: Plugin = {
    name: 'test-plugin-4',
    handlers: {
      review: async () => ({ success: true, tookAction: false })
    }
    // No config means enabled by default
  }

  beforeEach(() => {
    registry = new PluginRegistry()
  })

  describe('register and get', () => {
    it('should register and retrieve a plugin', () => {
      registry.register(mockPlugin1)
      const plugin = registry.get('test-plugin-1')
      expect(plugin).toBe(mockPlugin1)
    })

    it('should return undefined for non-existent plugin', () => {
      const plugin = registry.get('non-existent')
      expect(plugin).toBeUndefined()
    })

    it('should overwrite plugin with same name', () => {
      registry.register(mockPlugin1)
      const updatedPlugin = { ...mockPlugin1, config: { enabled: false } }
      registry.register(updatedPlugin)

      const plugin = registry.get('test-plugin-1')
      expect(plugin?.config?.enabled).toBe(false)
    })
  })

  describe('getAll', () => {
    it('should return empty array when no plugins registered', () => {
      const plugins = registry.getAll()
      expect(plugins).toEqual([])
    })

    it('should return all registered plugins', () => {
      registry.register(mockPlugin1)
      registry.register(mockPlugin2)
      registry.register(mockPlugin3)

      const plugins = registry.getAll()
      expect(plugins).toHaveLength(3)
      expect(plugins).toContain(mockPlugin1)
      expect(plugins).toContain(mockPlugin2)
      expect(plugins).toContain(mockPlugin3)
    })
  })

  describe('getEnabled', () => {
    it('should return only enabled plugins', () => {
      registry.register(mockPlugin1) // enabled: true
      registry.register(mockPlugin3) // enabled: false

      const plugins = registry.getEnabled()
      expect(plugins).toHaveLength(1)
      expect(plugins).toContain(mockPlugin1)
      expect(plugins).not.toContain(mockPlugin3)
    })

    it('should include plugins without config (enabled by default)', () => {
      registry.register(mockPlugin4) // no config

      const plugins = registry.getEnabled()
      expect(plugins).toHaveLength(1)
      expect(plugins).toContain(mockPlugin4)
    })

    it('should return all plugins when all are enabled', () => {
      registry.register(mockPlugin1)
      registry.register(mockPlugin2)
      registry.register(mockPlugin4)

      const plugins = registry.getEnabled()
      expect(plugins).toHaveLength(3)
    })
  })

  describe('getIssueHandlers', () => {
    it('should return issue handlers from enabled plugins', () => {
      registry.register(mockPlugin1) // has issue handler, enabled
      registry.register(mockPlugin2) // no issue handler
      registry.register(mockPlugin3) // no issue handler, disabled

      const handlers = registry.getIssueHandlers()
      expect(handlers).toHaveLength(1)
      expect(handlers[0].plugin).toBe(mockPlugin1)
      expect(handlers[0].handler).toBe(mockPlugin1.handlers.issue)
    })

    it('should return empty array when no issue handlers', () => {
      registry.register(mockPlugin2)

      const handlers = registry.getIssueHandlers()
      expect(handlers).toEqual([])
    })
  })

  describe('getPullRequestHandlers', () => {
    it('should return pull request handlers from enabled plugins', () => {
      registry.register(mockPlugin1) // no PR handler
      registry.register(mockPlugin2) // has PR handler, enabled

      const handlers = registry.getPullRequestHandlers()
      expect(handlers).toHaveLength(1)
      expect(handlers[0].plugin).toBe(mockPlugin2)
      expect(handlers[0].handler).toBe(mockPlugin2.handlers.pullRequest)
    })
  })

  describe('getPushHandlers', () => {
    it('should return push handlers from enabled plugins only', () => {
      registry.register(mockPlugin3) // has push handler, disabled
      registry.register(mockPlugin1) // no push handler

      const handlers = registry.getPushHandlers()
      expect(handlers).toEqual([])
    })
  })

  describe('getIssueCommentHandlers', () => {
    it('should return issue comment handlers from enabled plugins only', () => {
      registry.register(mockPlugin3) // has issueComment handler, disabled
      registry.register(mockPlugin2) // no issueComment handler

      const handlers = registry.getIssueCommentHandlers()
      expect(handlers).toEqual([])
    })
  })

  describe('getReviewHandlers', () => {
    it('should return review handlers from enabled plugins', () => {
      registry.register(mockPlugin4) // has review handler, no config (enabled)

      const handlers = registry.getReviewHandlers()
      expect(handlers).toHaveLength(1)
      expect(handlers[0].plugin).toBe(mockPlugin4)
      expect(handlers[0].handler).toBe(mockPlugin4.handlers.review)
    })
  })

  describe('getGenericCommentHandlers', () => {
    it('should return generic comment handlers from enabled plugins', () => {
      registry.register(mockPlugin1) // no genericComment handler
      registry.register(mockPlugin2) // has genericComment handler, enabled

      const handlers = registry.getGenericCommentHandlers()
      expect(handlers).toHaveLength(1)
      expect(handlers[0].plugin).toBe(mockPlugin2)
      expect(handlers[0].handler).toBe(mockPlugin2.handlers.genericComment)
    })
  })

  describe('multiple handler types', () => {
    it('should handle plugin with multiple handler types', () => {
      registry.register(mockPlugin2) // has pullRequest and genericComment

      const prHandlers = registry.getPullRequestHandlers()
      const commentHandlers = registry.getGenericCommentHandlers()

      expect(prHandlers).toHaveLength(1)
      expect(commentHandlers).toHaveLength(1)
    })
  })
})
