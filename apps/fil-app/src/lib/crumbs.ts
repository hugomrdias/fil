import { shortHex, shortId } from './format.ts'
import { isNetwork, NETWORK_LABELS } from './networks.ts'

/** One breadcrumb; the last one is the current page and has no link. */
export interface Crumb {
  /** Visible label. */
  label: string
  /** Path to link to, when the crumb is a page of its own. */
  href?: string
}

/** Section labels by path segment. */
const SECTIONS: Record<string, string> = {
  'data-sets': 'Data sets',
  providers: 'Providers',
  rails: 'Rails',
  'session-keys': 'Session keys',
  account: 'Pay account',
  approvals: 'Approvals',
  upload: 'Upload',
  setup: 'Setup request',
  search: 'Search',
}

/** Record labels by section, for `/{section}/{id}` paths. */
const RECORDS: Record<string, (id: string) => string> = {
  'data-sets': (id) => `Data set #${id}`,
  providers: (id) => `Provider #${id}`,
  rails: (id) => `Rail #${id}`,
  address: (id) => shortHex(id),
  pieces: (id) => shortId(id, 10),
}

/**
 * Breadcrumbs for an explorer or dashboard pathname. The explorer home
 * (`/mainnet`) has none; the dashboard home is a single current crumb.
 *
 * @param pathname - Router pathname, e.g. `/mainnet/rails/5`.
 * @example crumbsFor('/mainnet/rails/5')
 * // [{ label: 'Mainnet', href: '/mainnet' },
 * //  { label: 'Rails', href: '/mainnet/rails' },
 * //  { label: 'Rail #5' }]
 */
export function crumbsFor(pathname: string): Crumb[] {
  const [root, section, id] = pathname.split('/').filter(Boolean)
  if (root === 'dashboard' && !section) {
    // The dashboard header always shows where you are, even on its home.
    return [{ label: 'Dashboard' }]
  }
  if (!section || !root) {
    return []
  }
  const home: Crumb | undefined =
    root === 'dashboard'
      ? { label: 'Dashboard', href: '/dashboard' }
      : isNetwork(root)
        ? { label: NETWORK_LABELS[root], href: `/${root}` }
        : undefined
  if (!home) {
    return []
  }
  const record = RECORDS[section]
  if (id && record) {
    const label = SECTIONS[section]
    return label
      ? [home, { label, href: `/${root}/${section}` }, { label: record(id) }]
      : [home, { label: record(id) }]
  }
  return [home, { label: SECTIONS[section] ?? section }]
}
