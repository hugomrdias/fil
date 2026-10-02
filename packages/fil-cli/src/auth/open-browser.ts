import { spawn } from 'node:child_process'

/**
 * Open `url` in the default browser without waiting for it. Opening is best
 * effort; callers always print the URL as well.
 */
export function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {
      // Opening is best effort; the URL is always printed as well.
    })
    child.unref()
  } catch {
    // Same as a failed spawn: the printed URL is the fallback.
  }
}
