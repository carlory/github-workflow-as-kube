/**
 * Unit tests for src/plugins/plugin-agent.ts
 */
import { PluginAgentImpl } from '../src/plugins/plugin-agent.js'

describe('PluginAgentImpl', () => {
  let agent: PluginAgentImpl

  beforeEach(() => {
    agent = new PluginAgentImpl()
  })

  describe('setOutput and getOutputs', () => {
    it('should set and get a single output', () => {
      agent.setOutput('key1', 'value1')
      const outputs = agent.getOutputs()
      expect(outputs).toEqual({ key1: 'value1' })
    })

    it('should set and get multiple outputs', () => {
      agent.setOutput('key1', 'value1')
      agent.setOutput('key2', 'value2')
      agent.setOutput('key3', 'value3')

      const outputs = agent.getOutputs()
      expect(outputs).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3'
      })
    })

    it('should return a copy of outputs', () => {
      agent.setOutput('key1', 'value1')
      const outputs1 = agent.getOutputs()
      const outputs2 = agent.getOutputs()

      expect(outputs1).toEqual(outputs2)
      expect(outputs1).not.toBe(outputs2)
    })

    it('should overwrite existing output with same key', () => {
      agent.setOutput('key1', 'value1')
      agent.setOutput('key1', 'value2')

      const outputs = agent.getOutputs()
      expect(outputs).toEqual({ key1: 'value2' })
    })
  })

  describe('tookAction and didTakeAction', () => {
    it('should initially return false for didTakeAction', () => {
      expect(agent.didTakeAction()).toBe(false)
    })

    it('should return true after calling tookAction', () => {
      agent.tookAction()
      expect(agent.didTakeAction()).toBe(true)
    })

    it('should remain true after multiple calls to tookAction', () => {
      agent.tookAction()
      agent.tookAction()
      expect(agent.didTakeAction()).toBe(true)
    })
  })

  describe('setFailed, hasFailed, and getFailureMessage', () => {
    it('should initially return false for hasFailed', () => {
      expect(agent.hasFailed()).toBe(false)
    })

    it('should initially return undefined for getFailureMessage', () => {
      expect(agent.getFailureMessage()).toBeUndefined()
    })

    it('should set failure message and return true for hasFailed', () => {
      agent.setFailed('Test error message')
      expect(agent.hasFailed()).toBe(true)
      expect(agent.getFailureMessage()).toBe('Test error message')
    })

    it('should overwrite failure message on subsequent calls', () => {
      agent.setFailed('First error')
      agent.setFailed('Second error')
      expect(agent.hasFailed()).toBe(true)
      expect(agent.getFailureMessage()).toBe('Second error')
    })
  })

  describe('combined operations', () => {
    it('should handle all operations independently', () => {
      agent.setOutput('output1', 'value1')
      agent.tookAction()
      agent.setFailed('error message')

      expect(agent.getOutputs()).toEqual({ output1: 'value1' })
      expect(agent.didTakeAction()).toBe(true)
      expect(agent.hasFailed()).toBe(true)
      expect(agent.getFailureMessage()).toBe('error message')
    })
  })
})
