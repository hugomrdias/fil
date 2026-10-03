import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EPOCHS_PER_DAY,
  epochAt,
  epochToDate,
  formatBps,
  formatBytes,
  formatDuration,
  formatEpochs,
  formatUnitsDisplay,
  parseUnitsSafe,
  ratePerDay,
  shortHex,
  shortId,
  toBigInt,
} from '../src/lib/format.ts'

describe('format', () => {
  it('finds the epoch at a wall-clock time', () => {
    assert.deepEqual(epochAt(1000, 1_000_000 + 95_000), {
      epoch: 3,
      elapsed: 5,
    })
    assert.deepEqual(epochAt(1000, 1_000_000), { epoch: 0, elapsed: 0 })
  })

  it('coerces api integers to bigint', () => {
    assert.equal(toBigInt('42'), 42n)
    assert.equal(toBigInt(null), 0n)
    assert.equal(toBigInt(''), 0n)
    assert.equal(toBigInt(7), 7n)
  })

  it('shortens hex and ids', () => {
    assert.equal(
      shortHex('0x480c51fe9fc90e01fa742c51300cc29e151a71cd'),
      '0x480c…71cd'
    )
    assert.equal(shortHex('0x1234'), '0x1234')
    assert.equal(shortId('bafkzcibabcdefghijklmnopqrstuvwxyz', 4), 'bafk…wxyz')
  })

  it('formats token amounts with grouping and truncation', () => {
    assert.equal(formatUnitsDisplay(10n ** 18n), '1')
    assert.equal(
      formatUnitsDisplay(1_234_567_890_000_000_000_000n),
      '1,234.5678'
    )
    assert.equal(formatUnitsDisplay('1500000', 6, 2), '1.5')
    assert.equal(formatUnitsDisplay(1n), '<0.0001')
    assert.equal(formatUnitsDisplay(-(10n ** 18n) * 2n), '-2')
    assert.equal(formatUnitsDisplay(0n), '0')
  })

  it('parses decimal input into base units', () => {
    assert.equal(parseUnitsSafe('1.5'), 1_500_000_000_000_000_000n)
    assert.equal(parseUnitsSafe('0'), 0n)
    assert.equal(parseUnitsSafe(' 2 '), 2n * 10n ** 18n)
    assert.equal(parseUnitsSafe('1.1234567', 6), undefined)
    assert.equal(parseUnitsSafe('abc'), undefined)
    assert.equal(parseUnitsSafe('-1'), undefined)
  })

  it('converts per-epoch rates to per-day', () => {
    assert.equal(ratePerDay('10'), 10n * EPOCHS_PER_DAY)
  })

  it('converts epochs to dates', () => {
    const genesis = 1_598_306_400
    const date = epochToDate(2880, genesis)
    assert.equal(date.getTime(), (genesis + 2880 * 30) * 1000)
  })

  it('formats durations and epochs', () => {
    assert.equal(formatDuration(86_400 * 3), '3 days')
    assert.equal(formatDuration(3600), '1 hour')
    assert.equal(formatDuration(5), '5 seconds')
    assert.equal(formatEpochs(EPOCHS_PER_DAY * 30n), '30 days')
  })

  it('formats bytes with binary units', () => {
    assert.equal(formatBytes(0), '0 B')
    assert.equal(formatBytes(1536), '1.50 KiB')
    assert.equal(formatBytes(2n ** 40n), '1.00 TiB')
    assert.equal(formatBytes('127000000'), '121 MiB')
  })

  it('formats basis points', () => {
    assert.equal(formatBps('250'), '2.5%')
  })
})
