import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as Piece from '@filoz/synapse-core/piece'
import { defineHandler } from 'clipact'
import { get } from '../commands/get.ts'
import { notFound } from '../errors.ts'
import { findResourcesByCid, type Resource } from '../state/resources.ts'
import {
  downloadArtifact,
  downloadPiece,
  outputExists,
} from '../storage/get.ts'
import { resourceUrls } from '../storage/urls.ts'
import { accountScope, appFor, findResource } from './context.ts'

/** Refuse to overwrite an existing file unless forced. */
async function assertWritable(path: string, force: boolean): Promise<void> {
  if (force) return
  if (await stat(path).catch(() => undefined)) throw outputExists(path)
}

/**
 * Retrieve a managed resource by ref (or a PieceCID or root CID) from Curio
 * and verify it. Files are written as-is; artifacts are extracted to a
 * directory. An unmanaged PieceCID is located through the payer's data sets.
 */
export default defineHandler(get, async (ctx) => {
  const { input } = ctx
  const app = appFor(ctx)
  const { target } = input
  let resource: Resource | undefined
  if (target.startsWith('res_')) {
    resource = findResource(app, target)
  } else {
    resource = findResourcesByCid(app.db(), accountScope(app), target)[0]
  }

  if (!resource) {
    const pieceCid = Piece.tryFrom(target)
    if (!pieceCid) {
      throw notFound(`No managed resource or PieceCID ${target}.`, {
        by: 'agent',
        command: 'fil ls',
        description: 'List managed resources',
      })
    }
    const url = await Piece.resolvePieceUrl({
      client: app.client,
      address: accountScope(app).payer as `0x${string}`,
      pieceCid,
      signal: ctx.signal,
    }).catch((error: unknown) => {
      if (ctx.signal.aborted) throw error
      throw notFound(`No provider serves ${target}: ${String(error)}`)
    })
    const output = resolve(input.output ?? target)
    await assertWritable(output, input.force)
    const { size } = await downloadPiece({
      url,
      pieceCid: target,
      output,
      signal: ctx.signal,
    })
    return ctx.ok({ kind: 'file', pieceCid: target, output, size, url })
  }

  const urls = resourceUrls(resource)
  const output = resolve(input.output ?? resource.name)
  if (resource.kind === 'artifact' && resource.rootCid) {
    const { size, files } = await downloadArtifact({
      url: urls.piece,
      pieceCid: resource.pieceCid,
      rootCid: resource.rootCid,
      output,
      signal: ctx.signal,
    })
    return ctx.ok({
      kind: resource.kind,
      ref: resource.ref,
      pieceCid: resource.pieceCid,
      output,
      size,
      files,
      url: urls.piece,
    })
  }
  await assertWritable(output, input.force)
  const { size } = await downloadPiece({
    url: urls.piece,
    pieceCid: resource.pieceCid,
    output,
    signal: ctx.signal,
  })
  return ctx.ok({
    kind: resource.kind,
    ref: resource.ref,
    pieceCid: resource.pieceCid,
    output,
    size,
    url: urls.piece,
  })
})
