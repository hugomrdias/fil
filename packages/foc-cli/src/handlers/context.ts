import type { Context } from 'clipact'
import { type App, createApp } from '../app.ts'
import type { ScopeId } from '../auth/scopes.ts'
import {
  notLoggedIn,
  requireSession,
  resolveCredentials,
} from '../auth/session.ts'
import { abortable, notFound, resumeStep } from '../errors.ts'
import type { Network } from '../network.ts'
import { getOperation, type Operation } from '../state/operations.ts'
import { getResource, type Resource } from '../state/resources.ts'
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
 * Build the invocation context from a command's account input. Shared setup
 * is a plain function each handler calls; clipact has no middleware.
 *
 * @see ../../../../docs/cli-framework-design.md#defining-commands
 */
export function appFor(input: AccountInput): App {
  return createApp({
    network: input.network,
    sessionKey: input.sessionKey,
    rootAddress: input.rootAddress,
  })
}

/**
 * Account scope for local state queries. Needs a session, or at least its
 * owner; reports a pending login or invalid credentials as such.
 */
export function accountScope(app: App): { chainId: string; payer: string } {
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
  const sessionKey = await abortable(requireSession(app, scopes), ctx.signal)
  return {
    db: app.db(),
    backend: createSynapseBackend(app, sessionKey),
    chainId: app.chain.id.toString(),
    payer: sessionKey.rootAddress,
    stagingDir: app.stagingDir,
    signal: ctx.signal,
    progress: (event) => ctx.progress(event),
    onOperation: (op) =>
      ctx.checkpoint({ id: op.id, next: [resumeStep(op.id)] }),
  }
}

/** Resolve a managed resource in the current account scope. */
export function findResource(app: App, ref: string): Resource {
  const resource = getResource(app.db(), ref)
  const { chainId, payer } = accountScope(app)
  if (!resource || resource.chainId !== chainId || resource.payer !== payer) {
    throw notFound(`No managed resource ${ref}.`, {
      by: 'agent',
      command: 'foc ls',
      description: 'List managed resources',
    })
  }
  return resource
}

/** Resolve an operation in the current account scope. */
export function findOperation(app: App, id: string): Operation {
  const op = getOperation(app.db(), id)
  const { chainId, payer } = accountScope(app)
  if (!op || op.chainId !== chainId || op.payer !== payer) {
    throw notFound(`No operation ${id}.`, {
      by: 'agent',
      command: 'foc operations ls',
      description: 'List operations',
    })
  }
  return op
}
