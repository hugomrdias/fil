import { useHydrated } from '@tanstack/react-router'
import { formatTimestamp, UTC_TIMESTAMP_FORMAT } from '@/lib/format'

/**
 * Format a timestamp in the browser's locale and time zone once the page has
 * hydrated, and in UTC before that. The server cannot know the visitor's
 * time zone, so rendering local time there would not match the browser.
 *
 * @see https://tanstack.com/router/latest/docs/api/router/useHydratedHook
 */
export function useLocalTime() {
  const hydrated = useHydrated()
  return (seconds: number | bigint | string) =>
    hydrated
      ? formatTimestamp(seconds)
      : `${formatTimestamp(seconds, UTC_TIMESTAMP_FORMAT)} UTC`
}

/**
 * A Unix timestamp shown with {@link useLocalTime}.
 *
 * @param props.seconds - Unix seconds; integer strings and bigints retain precision.
 */
export function LocalTime(props: { seconds: number | bigint | string }) {
  const format = useLocalTime()
  return <>{format(props.seconds)}</>
}
