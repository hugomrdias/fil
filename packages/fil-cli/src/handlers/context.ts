import type { Context } from 'clipact'
import { type App, createApp } from '../app.ts'
import type { ScopeId } from '../auth/scopes.ts'
import {
  notLoggedIn,
  requireSession,
  resolveCredentials,
} from '../auth/session.ts'
import { notFound, resumeStep } from '../errors.ts'
import type { Network } from '../network.ts'
import { getOperation, type Operation } from '../state/operations.ts'
import {
  type AccountScope,
  getResource,
  type Resource,
} from '../state/resources.ts'
import type { JobContext } from '../storage/jobs.ts'
import { createSynapseBackend } from '../storage/synapse.ts'

/** The shared account input of a command (`commands/shared.ts`). */
export type AccountInput = {
  network?: Network | undefined
  sessionKey?: string | undefined
  rootAddress?: string | undefined
}

/** The parts of a clipact handler context that jobs report through. */
export type JobReporter = Pick<
  // biome-ignore lint/suspicious/noExplicitAny: any command's context
  Context<any, any>,
  'signal' | 'progress' | 'checkpoint'>

/**
 * Build the invocation context from a handler's account input and signal.
 * Shared setup is a plain function each handler calls; clipact has no
 * middleware.
 *
 * @see ../../../../docs/agent-cli/framework-design.md#defining-commands
 */
export function appFor(ctx: { input: AccountInput; signal: AbortSignal }): App {
  const { network, sessionKey, rootAddress } = ctx.input
  return createApp({ network, sessionKey, rootAddress, signal: ctx.signal })
}

/**
 * Account scope for local state queries. Needs a session, or at least its
 * owner; reports a pending login or invalid credentials as such.
 */
export function accountScope(app: App): AccountScope {
  const credentials = resolveCredentials(app)
  if (!credentials) throw notLoggedIn()
  return { chainId: app.chain.id.toString(), payer: credentials.rootAddress }
}

/**
 * Build a job context: a session key holding `scopes`, the synapse-core
 * backend, and the handler's signal, progress, and checkpoint. The operation
 * ID is printed as soon as the job is saved, so it survives a SIGKILL.
 */
export async function jobContext(
  app: App,
  scopes: readonly ScopeId[],
  ctx: JobReporter
): Promise<JobContext> {
  const sessionKey = await requireSession(app, scopes)
  return {
    db: app.db(),
    backend: createSynapseBackend(app, sessionKey),
    chainId: app.chain.id.toString(),
    payer: sessionKey.rootAddress,
    apiUrl: app.apiUrl,
    stagingDir: app.stagingDir,
    signal: ctx.signal,
    progress: (event) => ctx.progress(event),
    onOperation: (op) =>
      ctx.checkpoint({ id: op.id, next: [resumeStep(op.id)] }),
  }
}

/** Resolve a managed resource in the current account scope. */
export function findResource(app: App, ref: string): Resource {
  const resource = getResource(app.db(), ref, accountScope(app))
  if (!resource) {
    throw notFound(`No managed resource ${ref}.`, {
      by: 'agent',
      command: 'fil ls',
      description: 'List managed resources',
    })
  }
  return resource
}

/** Resolve an operation in the current account scope. */
export function findOperation(app: App, id: string): Operation {
  const op = getOperation(app.db(), id, accountScope(app))
  if (!op) {
    throw notFound(`No operation ${id}.`, {
      by: 'agent',
      command: 'fil operations ls',
      description: 'List operations',
    })
  }
  return op
}
