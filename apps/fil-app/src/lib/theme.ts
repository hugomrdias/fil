import { useSyncExternalStore } from 'react'

/** User theme preference. */
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'fil-app:theme'
const listeners = new Set<() => void>()

/** Read the stored preference, defaulting to dark. */
function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return 'dark'
}

/**
 * Resolve a preference to the concrete theme.
 *
 * @param preference - Theme preference.
 */
function resolve(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') {
    return preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Inline script that applies the stored theme before the first paint. The
 * server always renders the dark theme, because it cannot read
 * `localStorage`. Keep it in sync with `readPreference` and `resolve`.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var t=p==='light'?'light':p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):'dark';var e=document.documentElement;e.classList.toggle('dark',t==='dark');e.style.colorScheme=t}catch(_){}})()`

/** Apply the current preference to `<html>`. */
export function applyTheme() {
  const theme = resolve(readPreference())
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

/**
 * Persist and apply a theme preference.
 *
 * @param preference - New preference.
 */
function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Ignore storage failures; the theme still applies for this session.
  }
  applyTheme()
  for (const listener of listeners) {
    listener()
  }
}

/**
 * Subscribe to theme changes, including OS changes under `system`.
 *
 * @param listener - Change callback.
 */
function subscribe(listener: () => void) {
  listeners.add(listener)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onMedia = () => {
    applyTheme()
    listener()
  }
  media.addEventListener('change', onMedia)
  return () => {
    listeners.delete(listener)
    media.removeEventListener('change', onMedia)
  }
}

/**
 * Current theme preference and setter.
 *
 * @see https://react.dev/reference/react/useSyncExternalStore
 */
export function useTheme() {
  const theme = useSyncExternalStore<ThemePreference>(
    subscribe,
    readPreference,
    () => 'dark'
  )
  return { theme, setTheme: setThemePreference }
}
