/**
 * Checks the fil agent plugin in `plugins/fil` and the two marketplaces that
 * list it. The plugin carries a portable Agent Plugins manifest and a Claude
 * Code manifest, which must describe the same plugin.
 *
 * - `plugin.json` and `mcp.json` target Agent Plugins 1.0.0. The manifest
 *   holds only the portable fields, with client fields under `extensions`,
 *   and its name follows the specification's rules.
 * - `.claude-plugin/plugin.json` repeats the portable metadata and declares
 *   the same MCP servers. Claude Code calls `streamable-http` `http`.
 * - `.claude-plugin/marketplace.json`, which Claude Code and
 *   `npx skills add` read, and `.agents/plugins/marketplace.json`, which
 *   Codex reads, each list the plugin once, at its directory.
 * - The Claude Code marketplace entry declares every skill in the plugin's
 *   `skills/`. The `skills` CLI documents discovery only for declared skill
 *   paths; Claude Code scans `skills/` either way and loads each skill once.
 *
 * `claude plugin validate` checks Claude Code's own rules; CI does not have
 * Claude Code, so run it by hand as `plugins/fil/README.md` describes.
 *
 * @see https://agent-plugins.org/specification
 * @see https://code.claude.com/docs/en/plugins-reference
 * @see https://developers.openai.com/plugins/build/plugins
 */
import { readdir, readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'

/** A parsed JSON object. */
type Json = Record<string, unknown>

/** The plugin root, relative to the repository root. */
const ROOT = 'plugins/fil'

/** Base of the Agent Plugins 1.0.0 schema identifiers. */
const SCHEMAS = 'https://agent-plugins.org/schemas/1.0.0'

/** The closed set of top-level fields in an Agent Plugins manifest. */
const MANIFEST_FIELDS = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions',
])

/** Metadata the Claude Code manifest repeats from the portable manifest. */
const SHARED_FIELDS = [
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
]

/**
 * Claude Code's name for each remote Agent Plugins transport. fil's MCP
 * server is remote; a stdio server would also need `${PLUGIN_ROOT}` mapped to
 * `${CLAUDE_PLUGIN_ROOT}`.
 */
const CLAUDE_TRANSPORTS: Record<string, string> = {
  'streamable-http': 'http',
  sse: 'sse',
}

/**
 * Reads a JSON object from a file.
 *
 * @param path - File path, relative to the repository root.
 */
async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as Json
}

const problems: string[] = []
const manifest = await readJson(`${ROOT}/plugin.json`)
const mcp = await readJson(`${ROOT}/mcp.json`)
const claude = await readJson(`${ROOT}/.claude-plugin/plugin.json`)
const name = String(manifest.name)

if (manifest.$schema !== `${SCHEMAS}/plugin.schema.json`) {
  problems.push(`plugin.json: $schema must be ${SCHEMAS}/plugin.schema.json`)
}
for (const field of Object.keys(manifest)) {
  if (!MANIFEST_FIELDS.has(field)) {
    problems.push(
      `plugin.json: unknown field "${field}"; client fields belong under extensions`
    )
  }
}
if (
  !/^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/.test(name) ||
  /--|\.\./.test(name)
) {
  problems.push(`plugin.json: "${name}" is not a valid Agent Plugins name`)
}

if (mcp.$schema !== `${SCHEMAS}/mcp.schema.json`) {
  problems.push(`mcp.json: $schema must be ${SCHEMAS}/mcp.schema.json`)
}
const claudeServers: Record<string, Json> = {}
for (const [id, server] of Object.entries(mcp.mcpServers as Json)) {
  const { type, url } = server as Json
  const claudeType = CLAUDE_TRANSPORTS[String(type)]
  if (claudeType === undefined) {
    problems.push(`mcp.json: ${id} must be a remote server, not ${type}`)
    continue
  }
  if (!String(url).startsWith('https://')) {
    problems.push(`mcp.json: ${id} must use an https:// URL`)
  }
  claudeServers[id] = { ...(server as Json), type: claudeType }
}

for (const field of SHARED_FIELDS) {
  if (!isDeepStrictEqual(claude[field], manifest[field])) {
    problems.push(
      `.claude-plugin/plugin.json: ${field} differs from plugin.json`
    )
  }
}
if (!isDeepStrictEqual(claude.mcpServers, claudeServers)) {
  problems.push('.claude-plugin/plugin.json: mcpServers differs from mcp.json')
}

const marketplaces: [string, (entry: Json) => unknown][] = [
  ['.claude-plugin/marketplace.json', (entry) => entry.source],
  ['.agents/plugins/marketplace.json', (entry) => (entry.source as Json).path],
]
for (const [file, source] of marketplaces) {
  const marketplace = await readJson(file)
  const entries = (marketplace.plugins as Json[]).filter(
    (entry) => entry.name === name
  )
  if (entries.length !== 1 || source(entries[0] as Json) !== `./${ROOT}`) {
    problems.push(`${file}: must list ${name} once, at ./${ROOT}`)
  }
}

const skills = (await readdir(`${ROOT}/skills`, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => `./skills/${entry.name}`)
  .sort()
const claudeMarketplace = await readJson('.claude-plugin/marketplace.json')
const claudeEntry = (claudeMarketplace.plugins as Json[]).find(
  (entry) => entry.name === name
)
const declared = [...((claudeEntry?.skills as string[] | undefined) ?? [])]
if (!isDeepStrictEqual(declared.sort(), skills)) {
  problems.push(
    `.claude-plugin/marketplace.json: skills must list ${skills.join(', ')}, so npx skills add finds them`
  )
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'))
  process.exit(1)
}
console.log(`${name} plugin: manifests and marketplaces agree`)
