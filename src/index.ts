/**
 * The entrypoint for the action. This file imports and runs the action's
 * main logic with proper error handling.
 */
import * as core from '@actions/core'
import { run } from './main.js'

/* istanbul ignore next */
run().catch((error) => {
  core.setFailed(error.message)
  process.exit(1)
})
