import { spawn } from 'node:child_process'

/**
 * Open `url` in the default browser without waiting for it. Returns `false`
 * when no opener could be started.
 */
export function openBrowser(url: string): boolean {
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
    return true
  } catch {
    return false
  }
}
