import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, WalletIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { type Connector, useConnect, useConnectors } from 'wagmi'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * Centered full-page frame for dashboard screens shown before the sidebar
 * shell: connect and switch network.
 *
 * @param props.title - Heading.
 * @param props.description - What the user needs to do.
 * @param props.children - Actions.
 */
export function GateFrame(props: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 items-center px-4">
        <Button
          nativeButton={false}
          render={<Link to="/" />}
          size="sm"
          variant="ghost"
        >
          <ArrowLeftIcon />
          Home
        </Button>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12svh] pb-16">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-4">
            <Logo className="size-11" />
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {props.title}
            </h1>
            <p className="text-sm text-pretty text-muted-foreground">
              {props.description}
            </p>
          </div>
          <div className="flex flex-col gap-2">{props.children}</div>
        </div>
      </main>
    </div>
  )
}

/**
 * Connect screen listing every detected browser wallet (EIP-6963).
 *
 * @param props.title - Heading; defaults to the dashboard's.
 * @param props.description - What connecting unlocks; defaults to the dashboard's.
 * @see https://wagmi.sh/react/api/hooks/useConnect
 */
export function ConnectGate(props: { title?: string; description?: string }) {
  const connectors: readonly Connector[] = useConnectors()
  const {
    mutate: connect,
    isPending,
    variables,
  } = useConnect({
    mutation: { onError: (error) => toast.error(error.message.split('\n')[0]) },
  })
  return (
    <GateFrame
      description={
        props.description ??
        'Your dashboard manages your Filecoin Pay account, Warm Storage approval, data sets, uploads, rails and session keys.'
      }
      title={props.title ?? 'Connect a wallet to open your dashboard'}
    >
      {connectors.length === 0 ? (
        <p className="rounded-3xl border border-dashed p-5 text-sm text-muted-foreground">
          No browser wallet found. Install one such as MetaMask or Rabby, then
          reload this page.
        </p>
      ) : null}
      {connectors.map((connector) => {
        const pending = isPending && variables?.connector === connector
        return (
          <Button
            className="h-12 justify-start gap-3 px-4"
            disabled={isPending}
            key={connector.uid}
            onClick={() => connect({ connector })}
            size="lg"
            variant="outline"
          >
            {connector.icon ? (
              <img
                alt=""
                className="size-6"
                height={24}
                src={connector.icon}
                width={24}
              />
            ) : (
              <WalletIcon className="size-5" />
            )}
            <span className="flex-1 text-left">{connector.name}</span>
            {pending ? <Spinner /> : null}
          </Button>
        )
      })}
    </GateFrame>
  )
}
