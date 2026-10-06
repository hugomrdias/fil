import {
  epochToDate as coreEpochToDate,
  TIME_CONSTANTS,
} from '@filoz/synapse-core/utils'

/** Filecoin epochs per day. */
export const EPOCHS_PER_DAY = TIME_CONSTANTS.EPOCHS_PER_DAY

/** Filecoin epochs per 30-day month, as used by Warm Storage pricing. */
export const EPOCHS_PER_MONTH = TIME_CONSTANTS.EPOCHS_PER_MONTH

const EPOCH_SECONDS = TIME_CONSTANTS.EPOCH_DURATION

/** JavaScript Date's absolute limit in Unix seconds; see {@link formatTimestamp}. */
const MAX_DATE_SECONDS = 8_640_000_000_000n

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
/**
 * Locale- and time-zone-independent timestamp format. The server and the
 * browser's first render both use it, so hydration matches; see
 * `LocalTime`.
 */
export const UTC_TIMESTAMP_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/**
 * Coerce a decimal string, number or bigint into a bigint.
 *
 * @param value - Integer value, usually a fil-api decimal string.
 */
export function toBigInt(value: bigint | number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0n
  }
  return typeof value === 'bigint' ? value : BigInt(value)
}

/**
 * Shorten a hex address or hash for display.
 *
 * @param value - Address or hash.
 * @param chars - Characters to keep on each side.
 */
export function shortHex(value: string, chars = 4) {
  if (value.length <= chars * 2 + 4) {
    return value
  }
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`
}

/**
 * Shorten an opaque identifier such as a PieceCID.
 *
 * @param value - Identifier.
 * @param chars - Characters to keep on each side.
 */
export function shortId(value: string, chars = 8) {
  if (value.length <= chars * 2 + 1) {
    return value
  }
  return `${value.slice(0, chars)}…${value.slice(-chars)}`
}

/**
 * Group the integer digits of a decimal string with commas.
 *
 * @param value - Decimal string without exponent.
 */
function groupDigits(value: string) {
  const negative = value.startsWith('-')
  const [int, frac] = (negative ? value.slice(1) : value).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`
}

/**
 * Format a token base-unit amount as a human decimal string.
 *
 * @param value - Amount in base units.
 * @param decimals - Token decimals.
 * @param maxFractionDigits - Maximum fraction digits to show.
 * @returns The formatted amount, e.g. `1,234.5`.
 */
export function formatUnitsDisplay(
  value: bigint | number | string | null | undefined,
  decimals = 18,
  maxFractionDigits = 4
) {
  const amount = toBigInt(value)
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const int = abs / base
  const frac = (abs % base).toString().padStart(decimals, '0')
  const trimmed = frac.slice(0, maxFractionDigits).replace(/0+$/, '')
  if (int === 0n && trimmed === '' && abs > 0n) {
    return `${negative ? '-' : ''}<0.${'0'.repeat(Math.max(maxFractionDigits - 1, 0))}1`
  }
  const text = trimmed ? `${int}.${trimmed}` : `${int}`
  return groupDigits(`${negative ? '-' : ''}${text}`)
}

/**
 * Parse a human decimal string into base units.
 *
 * @param value - Decimal string such as `1.5`.
 * @param decimals - Token decimals.
 * @returns The base-unit amount, or `undefined` when the input is invalid.
 */
export function parseUnitsSafe(value: string, decimals = 18) {
  const text = value.trim()
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return undefined
  }
  const [int, frac = ''] = text.split('.')
  if (frac.length > decimals) {
    return undefined
  }
  return (
    BigInt(int) * 10n ** BigInt(decimals) +
    BigInt(frac.padEnd(decimals, '0') || '0')
  )
}

/**
 * Per-day amount for a per-epoch payment rate.
 *
 * @param ratePerEpoch - Payment rate per epoch in base units.
 */
export function ratePerDay(ratePerEpoch: bigint | number | string) {
  return toBigInt(ratePerEpoch) * EPOCHS_PER_DAY
}

/**
 * Convert a chain epoch into a Date.
 *
 * @param epoch - Chain epoch.
 * @param genesisTimestamp - Chain genesis in Unix seconds.
 */
export function epochToDate(
  epoch: bigint | number | string,
  genesisTimestamp: number
) {
  return coreEpochToDate(Number(toBigInt(epoch)), genesisTimestamp)
}

/**
 * Chain epoch at a wall-clock time, and how far into it that time is.
 *
 * @param genesisTimestamp - Chain genesis in Unix seconds.
 * @param nowMs - Wall-clock time in milliseconds.
 * @returns The epoch and the seconds elapsed within it.
 */
export function epochAt(genesisTimestamp: number, nowMs: number) {
  const seconds = nowMs / 1000 - genesisTimestamp
  return {
    epoch: Math.floor(seconds / EPOCH_SECONDS),
    elapsed: seconds % EPOCH_SECONDS,
  }
}

/**
 * Human duration for a number of epochs, e.g. `30 days` or `2 hours`.
 *
 * @param epochs - Number of epochs.
 */
export function formatEpochs(epochs: bigint | number | string) {
  return formatDuration(Number(toBigInt(epochs)) * EPOCH_SECONDS)
}

/**
 * Human duration for a number of seconds, using the largest whole unit.
 *
 * @param totalSeconds - Duration in seconds.
 */
export function formatDuration(totalSeconds: number) {
  const units: [string, number][] = [
    ['year', 365 * 86_400],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [name, size] of units) {
    if (Math.abs(totalSeconds) >= size) {
      const count = Math.floor(totalSeconds / size)
      return `${count} ${name}${count === 1 ? '' : 's'}`
    }
  }
  return `${Math.max(Math.floor(totalSeconds), 0)} seconds`
}

/**
 * Format a byte count with binary units, e.g. `1.5 GiB`.
 *
 * @param value - Number of bytes.
 */
export function formatBytes(
  value: bigint | number | string | null | undefined
) {
  const bytes = Number(toBigInt(value))
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  const digits = unit === 0 || size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(digits)} ${units[unit]}`
}

/**
 * Format a Unix timestamp (seconds) as a locale date and time.
 * Label timestamps outside JavaScript's date range without throwing.
 *
 * @param seconds - Unix seconds; integer strings and bigints retain precision.
 * @param format - Date formatter. Default: the browser's locale and time zone.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#the_epoch_timestamps_and_invalid_date
 */
export function formatTimestamp(
  seconds: number | bigint | string,
  format: Intl.DateTimeFormat = TIMESTAMP_FORMAT
) {
  const timestamp = typeof seconds === 'string' ? BigInt(seconds) : seconds
  if (
    typeof timestamp === 'bigint' &&
    (timestamp > MAX_DATE_SECONDS || timestamp < -MAX_DATE_SECONDS)
  ) {
    return 'Beyond date range'
  }
  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime())
    ? 'Beyond date range'
    : format.format(date)
}

/**
 * Relative time from now, e.g. `3 hours ago` or `in 2 days`.
 *
 * @param date - Target time.
 * @param now - Reference time.
 */
export function formatRelative(date: Date, now: Date = new Date()) {
  const diff = Math.round((date.getTime() - now.getTime()) / 1000)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86_400],
    ['month', 30 * 86_400],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(diff) >= size) {
      return RELATIVE_FORMAT.format(Math.trunc(diff / size), unit)
    }
  }
  return RELATIVE_FORMAT.format(diff, 'second')
}

/**
 * Format basis points as a percentage, e.g. `250` → `2.5%`.
 *
 * @param bps - Basis points.
 */
export function formatBps(bps: bigint | number | string) {
  return `${Number(toBigInt(bps)) / 100}%`
}

/**
 * Host of a URL for display, or the raw value when it does not parse.
 *
 * @param value - URL string from provider registration.
 */
export function urlHost(value: string) {
  try {
    return new URL(value).host || value
  } catch {
    return value
  }
}
