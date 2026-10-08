/**
 * Checks the agent skills the repository publishes from the fil plugin's
 * `plugins/fil/skills/` directory. The plugin installs them, the fil-cli
 * build copies them, fil-app's build publishes them with
 * `@hugomrdias/vite-plugin-agent-skills`, and `npx skills add hugomrdias/fil`
 * finds them on GitHub through `.claude-plugin/marketplace.json`.
 *
 * - Every skill must pass the Vite plugin's validation, which fil-app's build
 *   would otherwise only run at deploy time.
 * - Every development skill directory in `.agents/skills` and
 *   `.claude/skills` must be in `skills-lock.json`. The `skills` CLI also
 *   reads those directories and skips only locked skills, so an unlocked one
 *   would be published too. It never follows symbolic links, so links, such
 *   as those from `.claude/skills` to `.agents/skills`, are fine.
 *
 * @see https://github.com/vercel-labs/skills
 * @see ../packages/vite-plugin-agent-skills/README.md
 */
import { readdir, readFile } from 'node:fs/promises'
import { publishSkills } from '@hugomrdias/vite-plugin-agent-skills'

/** The only source of the published skills. */
const SKILLS = 'plugins/fil/skills'

/**
 * Lists the subdirectories of a directory, without symbolic links, or none
 * when it is missing.
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

const problems: string[] = []
const published = await directories(SKILLS)
try {
  await publishSkills(SKILLS)
} catch (error) {
  problems.push((error as Error).message)
}
const lock = JSON.parse(await readFile('skills-lock.json', 'utf8')) as {
  skills: Record<string, unknown>
}
for (const root of ['.agents/skills', '.claude/skills']) {
  for (const dir of await directories(root)) {
    if (!(dir in lock.skills)) {
      problems.push(
        `${root}/${dir} is not in skills-lock.json, so npx skills add would publish it`
      )
    }
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'))
  process.exit(1)
}
console.log(`${published.length} published skills: ${published.join(', ')}`)
