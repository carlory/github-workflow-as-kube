import { EventDispatcher } from './services/event-dispatcher.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const dispatcher = new EventDispatcher()
  await dispatcher.dispatch()
}
