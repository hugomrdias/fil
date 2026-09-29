#!/usr/bin/env node
/** biome-ignore-all lint/suspicious/noConsole: CLI output */

/**
 * Returns the greeting printed by the `foc` command.
 */
export function greet(name = 'foc'): string {
  return `Hello from ${name}`
}

if (import.meta.main) {
  console.log(greet())
}
