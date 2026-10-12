import { Tabs } from '@base-ui/react/tabs'
import { TerminalIcon } from 'lucide-react'
import { CopyButton } from '@/components/copy-button'
import type { MarkdownTab, MarkdownTabPart } from '@/lib/site/markdown'

/** Code block languages shown as shell commands. */
const SHELL_LANGS = new Set(['sh', 'bash', 'shell', 'zsh'])

/**
 * One shell line: comments muted, the program plain, and its arguments in
 * the brand color.
 *
 * @param props.line - Source line.
 */
function ShellLine(props: { line: string }) {
  const { line } = props
  if (line.trimStart().startsWith('#')) {
    return <span className="block text-muted-foreground">{line}</span>
  }
  const match = /^(\s*\S+)(.*)$/.exec(line)
  if (match === null) {
    // Keep blank lines one line tall.
    return <span className="block">{line || ' '}</span>
  }
  return (
    <span className="block">
      {match[1]}
      <span className="text-primary">{match[2]}</span>
    </span>
  )
}

/**
 * A code block in a terminal frame with a copy button.
 *
 * @param props.lang - Code block language.
 * @param props.code - Code block source.
 */
function Terminal(props: { lang: string; code: string }) {
  const shell = SHELL_LANGS.has(props.lang)
  return (
    <figure className="overflow-hidden rounded-xl border bg-card">
      <figcaption className="flex items-center gap-2 border-b py-1.5 pr-2 pl-4 text-sm text-muted-foreground">
        {shell && <TerminalIcon aria-hidden className="size-4" />}
        <span>{shell ? 'Terminal' : props.lang || 'Code'}</span>
        <span className="ml-auto">
          <CopyButton
            label={shell ? 'Copy commands' : 'Copy code'}
            value={props.code}
          />
        </span>
      </figcaption>
      <pre className="overflow-x-auto bg-muted/40 px-4 py-4 font-mono text-[13px] leading-6 sm:px-5 sm:text-sm">
        <code>
          {shell
            ? props.code
                .split('\n')
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are static and may repeat
                .map((line, index) => <ShellLine key={index} line={line} />)
            : props.code}
        </code>
      </pre>
    </figure>
  )
}

/**
 * Part of a tab panel: a terminal for code, and a short note for prose.
 *
 * @param props.part - Tab part.
 */
function TabPart(props: { part: MarkdownTabPart }) {
  const { part } = props
  if (part.type === 'code') {
    return <Terminal code={part.code} lang={part.lang} />
  }
  return (
    <div
      className="text-sm text-pretty text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-4 [&_a:hover]:underline [&_code]:font-mono [&_code]:text-foreground [&_p]:my-0"
      // The HTML comes from the Markdown files in src/content.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, server-rendered content
      dangerouslySetInnerHTML={{ __html: part.html }}
    />
  )
}

/**
 * Tabs from a `<!-- tabs -->` block in a docs page, with an underline that
 * slides to the chosen tab. Every panel renders on the server, hidden until
 * chosen, and the block keeps the height of the tallest panel.
 *
 * @param props.tabs - Tabs, in source order.
 * @see https://base-ui.com/react/components/tabs
 */
export function DocTabs(props: { tabs: MarkdownTab[] }) {
  return (
    <Tabs.Root className="not-prose my-8" defaultValue={0}>
      <Tabs.List className="relative flex gap-6 overflow-x-auto border-b [scrollbar-width:none]">
        {props.tabs.map((tab, index) => (
          <Tabs.Tab
            className="shrink-0 rounded-sm py-3 text-[15px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-active:text-foreground"
            key={tab.label}
            value={index}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator
          className="absolute bottom-0 left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-foreground transition-[translate,width] duration-300 ease-out-strong motion-reduce:transition-none"
          renderBeforeHydration
        />
      </Tabs.List>
      {/* Panels share one grid cell, so switching tabs never moves the text below. */}
      <div className="grid grid-cols-1">
        {props.tabs.map((tab, index) => (
          <Tabs.Panel
            className="col-start-1 row-start-1 flex flex-col gap-3 pt-5 outline-none [&[hidden]]:invisible [&[hidden]]:flex"
            keepMounted
            key={tab.label}
            value={index}
          >
            {tab.parts.map((part, partIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts are static
              <TabPart key={partIndex} part={part} />
            ))}
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  )
}
