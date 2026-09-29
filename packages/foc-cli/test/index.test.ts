import assert from 'node:assert/strict'
import { test } from 'node:test'
import { greet } from '../src/index.ts'

test('greet returns the default greeting', () => {
  assert.equal(greet(), 'Hello from foc')
})
