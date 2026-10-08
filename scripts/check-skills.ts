/**
 * Checks the agent skills the repository publishes. The root `skills/`
 * directory is their only source: the fil-cli build copies it for
 * `fil skills install`, fil-app serves it under `/.well-known/agent-skills/`,
 * and `npx skills add hugomrdias/fil` reads it from GitHub.
 *
 * Fails when a skill breaks the rules those consumers rely on, or when a
 * development skill in `.agents/skills` is missing from `skills-lock.json`,
 * because `npx skills add` offers every unlocked skill it finds there.
 *
 * @see https://agentskills.io/specification
 * @see https://github.com/cloudflare/agent-skills-discovery-rfc
 * @see https://github.com/vercel-labs/skills
 */
import { readdir, readFile } from 'node:fs/promises'

/** Skill names allowed by the Agent Skills specification. */
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Longest description the specification and the discovery index allow. */
const MAX_DESCRIPTION = 1024

const problems: string[] = []

/**
 * Lists the subdirectories of a directory, or none when it is missing.
 *
 * @param path - Directory to read.
 */
async function directories(path: string) {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/**
 * Reads single-line `key: value` fields from a `SKILL.md` frontmatter.
 *
 * @param markdown - Contents of a `SKILL.md` file.
 */
function frontmatter(markdown: string) {
  const fields = new Map<string, string>()
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? ''
  for (const line of block.split(/\r?\n/)) {
    const field = /^([a-z-]+):\s*(.*)$/.exec(line)
    if (field?.[1] && field[2] !== undefined) {
      fields.set(field[1], field[2].trim())
    }
  }
  return fields
}

const published = await directories('skills')
if (published.length === 0) {
  problems.push('skills/ has no skills')
}

for (const dir of published) {
  const files = await readdir(`skills/${dir}`, { recursive: true })
  // fil-app serves each skill as one `skill-md` entry, not an archive.
  if (files.length !== 1 || files[0] !== 'SKILL.md') {
    problems.push(`skills/${dir} must contain only SKILL.md`)
    continue
  }
  const fields = frontmatter(await readFile(`skills/${dir}/SKILL.md`, 'utf8'))
  const name = fields.get('name')
  const description = fields.get('description')
  if (name !== dir) {
    problems.push(`skills/${dir}/SKILL.md must have name: ${dir}`)
  }
  if (!NAME.test(dir) || dir.length > 64) {
    problems.push(`skills/${dir} is not a valid skill name`)
  }
  if (!description || description.length > MAX_DESCRIPTION) {
    problems.push(
      `skills/${dir}/SKILL.md needs a description of 1 to ${MAX_DESCRIPTION} characters`
    )
  }
}

const lock = JSON.parse(await readFile('skills-lock.json', 'utf8')) as {
  skills: Record<string, unknown>
}
for (const dir of await directories('.agents/skills')) {
  if (!(dir in lock.skills)) {
    problems.push(
      `.agents/skills/${dir} is not in skills-lock.json, so npx skills add would publish it`
    )
  }
  if (published.includes(dir)) {
    problems.push(`.agents/skills/${dir} has the name of a published skill`)
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'))
  process.exit(1)
}
console.log(`${published.length} published skills: ${published.join(', ')}`)
