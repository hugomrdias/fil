import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { pageHead } from '@/components/doc-page'
import { SiteShell } from '@/components/site-shell'
import { Button } from '@/components/ui/button'
import { env } from '@/config/env'
import { DEFAULT_NETWORK } from '@/lib/networks'
import { scriptJson, softwareApplication } from '@/lib/site/discovery'
import { HOME_PAGE } from '@/lib/site/pages'

export const Route = createFileRoute('/')({
  head: () => ({
    ...pageHead(HOME_PAGE, 'fil · Store files on Filecoin'),
    scripts: [
      {
        type: 'application/ld+json',
        children: scriptJson(
          softwareApplication({
            origin: env.siteUrl,
            description: HOME_PAGE.description,
            image: `${env.siteUrl}/og.png`,
          })
        ),
      },
    ],
  }),
  component: Landing,
})

/** Landing page: what fil does, the ways in, and how an agent gets access. */
function Landing() {
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 py-12 sm:px-6 sm:py-16 lg:gap-28 lg:px-8 lg:py-24">
        <Hero />
        <WaysIn />
        <Access />
        <Discovery />
      </div>
    </SiteShell>
  )
}

/** Headline, summary, calls to action, and a `fil put` transcript. */
function Hero() {
  return (
    <section className="flex flex-col gap-10 lg:gap-14">
      <div className="flex flex-col gap-6">
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl lg:leading-[1.05]">
          Store files on Filecoin from your terminal or your agent.
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          <code className="font-mono text-foreground">fil</code> puts a file or
          a folder on a Filecoin storage provider and gives you a link to share.
          Agents can run it too. You approve their key once, and your wallet
          pays.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            nativeButton={false}
            render={<Link params={{ slug: 'quickstart' }} to="/docs/$slug" />}
            size="lg"
          >
            Read the quickstart
          </Button>
          <Button
            nativeButton={false}
            render={<Link to="/agents" />}
            size="lg"
            variant="outline"
          >
            Set up an agent
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          A prototype. It runs on the calibration test network unless you choose
          mainnet.
        </p>
      </div>
      <Transcript />
    </section>
  )
}

/** One JSON line of the transcript, indented by `depth` levels. */
function JsonLine(props: { depth: number; children: ReactNode }) {
  return (
    <span className="block" style={{ paddingInlineStart: `${props.depth}ch` }}>
      {props.children}
    </span>
  )
}

/** A JSON key in the transcript. */
function Key(props: { children: string }) {
  return <span className="text-muted-foreground">"{props.children}"</span>
}

/**
 * An abridged `fil put` run on a folder, as an agent sees it: one JSON
 * object with the link to share.
 */
function Transcript() {
  return (
    <figure className="w-full max-w-4xl min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <figcaption className="border-b px-4 py-2.5 text-xs text-muted-foreground">
        An agent stores a folder
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 sm:p-5 sm:text-sm">
        <code>
          <span className="block">
            <span className="select-none text-brand-500">$ </span>
            fil put ./site
          </span>
          <JsonLine depth={0}>{'{'}</JsonLine>
          <JsonLine depth={2}>
            <Key>data</Key>: {'{'}
          </JsonLine>
          <JsonLine depth={4}>
            <Key>state</Key>: "ready",
          </JsonLine>
          <JsonLine depth={4}>
            <Key>resource</Key>: {'{ '}
            <Key>ref</Key>: "res_7q2…", <Key>kind</Key>: "folder",{' '}
            <Key>size</Key>: 48211 {'}'},
          </JsonLine>
          <JsonLine depth={4}>
            <Key>urls</Key>: {'{'}
          </JsonLine>
          <JsonLine depth={6}>
            <Key>browser</Key>:{' '}
            <span className="text-brand-500">
              "https://fil-api.hugomrdias.dev/get/bafybei…?browser=true"
            </span>
            ,
          </JsonLine>
          <JsonLine depth={6}>
            <Key>piece</Key>: "https://fil-api.hugomrdias.dev/get/bafkzcib…"
          </JsonLine>
          <JsonLine depth={4}>{'}'}</JsonLine>
          <JsonLine depth={2}>{'}'}</JsonLine>
          <JsonLine depth={0}>{'}'}</JsonLine>
        </code>
      </pre>
    </figure>
  )
}

/** The three ways to use fil, each with what you type or open. */
function WaysIn() {
  const ways = [
    {
      name: 'CLI',
      text: 'Store, retrieve, list, and delete files and folders. A failed upload resumes without paying twice.',
      code: 'fil put ./report.pdf',
      link: (
        <Link
          className="text-primary underline-offset-4 hover:underline"
          params={{ slug: 'cli' }}
          to="/docs/$slug"
        >
          CLI docs
        </Link>
      ),
    },
    {
      name: 'MCP server',
      text: 'Read-only tools for providers, data sets, pieces, payment rails, and session keys, with no sign-up.',
      code: 'https://fil-api.hugomrdias.dev/mcp',
      link: (
        <Link
          className="text-primary underline-offset-4 hover:underline"
          params={{ slug: 'api' }}
          to="/docs/$slug"
        >
          API and MCP docs
        </Link>
      ),
    },
    {
      name: 'Web app',
      text: 'Explore what is stored on chain, fund your account, and approve or revoke the keys your agents use.',
      code: 'fil-app.hugomrdias.dev',
      link: (
        <Link
          className="text-primary underline-offset-4 hover:underline"
          params={{ network: DEFAULT_NETWORK }}
          to="/$network"
        >
          Open the explorer
        </Link>
      ),
    },
  ]
  return (
    <section className="flex flex-col gap-8">
      <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
        One storage account, three ways in
      </h2>
      <dl className="grid border-t md:grid-cols-3">
        {ways.map((way) => (
          <div
            className="flex flex-col gap-3 border-b py-6 md:border-b-0 md:border-l md:px-6 md:first:border-l-0 md:first:pl-0"
            key={way.name}
          >
            <dt className="text-lg font-medium">{way.name}</dt>
            <dd className="flex flex-1 flex-col gap-4">
              <p className="text-pretty text-muted-foreground">{way.text}</p>
              <code className="mt-auto font-mono text-sm break-all">
                {way.code}
              </code>
              <span className="text-sm">{way.link}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** How an agent gets a key that the wallet owner approves. */
function Access() {
  const steps = [
    {
      action: 'fil login',
      text: 'The agent makes a session key on its own machine and returns an approval link.',
    },
    {
      action: 'Approve in fil-app',
      text: 'You review the request, choose its permissions and expiry, and sign with your wallet.',
    },
    {
      action: 'fil put',
      text: 'The key signs storage requests and your wallet pays. The key can never move funds.',
    },
  ]
  return (
    <section className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Your agent never holds your wallet
        </h2>
        <p className="max-w-md text-pretty text-muted-foreground">
          Storage needs a signature, not your private key. You approve a limited
          session key once, and revoke it whenever you want.
        </p>
      </div>
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 border-t py-5 last:border-b"
            key={step.action}
          >
            <span className="font-mono text-sm text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-medium">{step.action}</span>
              <span className="text-pretty text-muted-foreground">
                {step.text}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Discovery files and Markdown versions for agents that read the site. */
function Discovery() {
  const paths = [
    '/llms.txt',
    '/.well-known/api-catalog',
    '/.well-known/mcp/server-card.json',
    '/.well-known/agent-skills/index.json',
  ]
  return (
    <section className="flex flex-col gap-6 rounded-2xl bg-muted/50 p-6 sm:p-8">
      <div className="flex max-w-2xl flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Agents can read this site
        </h2>
        <p className="text-pretty text-muted-foreground">
          Every docs page has a Markdown version. Add <code>.md</code> to the
          path or send <code>Accept: text/markdown</code>. These files describe
          the API, the MCP server, and the skill:
        </p>
      </div>
      <ul className="flex flex-col gap-2 font-mono text-sm">
        {paths.map((path) => (
          <li className="min-w-0 truncate" key={path}>
            <a
              className="text-primary underline-offset-4 hover:underline"
              href={path}
            >
              {path}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <Link
          className="text-primary underline-offset-4 hover:underline"
          to="/agents"
        >
          How to set up an agent
        </Link>
      </p>
    </section>
  )
}
