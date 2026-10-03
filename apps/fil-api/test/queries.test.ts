import { describe, expect, it } from 'vitest'
import { ident, Where } from '../src/db.ts'
import { ApiError } from '../src/errors.ts'
import { NETWORKS } from '../src/networks.ts'
import { decodeCursor, encodeCursor, toPage } from '../src/pagination.ts'
import { listDataSets } from '../src/queries/data-sets.ts'
import { listPieces } from '../src/queries/pieces.ts'
import { listRails, railState } from '../src/queries/rails.ts'
import { listSessionKeys, mapSessionKey } from '../src/queries/session-keys.ts'
import { getStatus, parseCheckpoint } from '../src/queries/status.ts'
import { fakeDb, rows } from './helpers.ts'

const schemas = NETWORKS.calibration.schemas

describe('sql helpers', () => {
  it('quotes identifiers', () => {
    expect(ident('early-repair')).toBe('"early-repair"')
    expect(ident('a"b')).toBe('"a""b"')
  })

  it('numbers placeholders in order', () => {
    const where = new Where()
      .maybe('x', (p) => `a = ${p}`)
      .maybe(undefined, (p) => `b = ${p}`)
      .add((p, q) => `(c, d) < (${p}, ${q})`, 1, 2)
    expect(where.toString()).toBe('where a = $1 and (c, d) < ($2, $3)')
    expect(where.params).toEqual(['x', 1, 2])
    expect(new Where().toString()).toBe('')
  })
})

describe('pagination', () => {
  it('round-trips cursors', () => {
    const cursor = encodeCursor(['40938', '0'])
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(cursor, 2)).toEqual(['40938', '0'])
  })

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('zzz', 1)).toThrow(ApiError)
    expect(() => decodeCursor(encodeCursor(['1']), 2)).toThrow(ApiError)
  })

  it('uses the extra row to emit nextCursor', () => {
    const page = toPage(
      [{ id: 3 }, { id: 2 }, { id: 1 }],
      2,
      (r) => r.id,
      (r) => [r.id]
    )
    expect(page.data).toEqual([3, 2])
    expect(decodeCursor(page.nextCursor ?? '', 1)).toEqual(['2'])
    expect(
      toPage(
        [{ id: 1 }],
        2,
        (r) => r,
        (r) => [r.id]
      ).nextCursor
    ).toBeNull()
  })
})

describe('parseCheckpoint', () => {
  it('decodes timestamp and block number', () => {
    expect(parseCheckpoint(rows.checkpoint.latest_checkpoint)).toEqual({
      timestamp: 1790983380,
      blockNumber: 4121900,
    })
    expect(parseCheckpoint(null)).toBeNull()
    expect(parseCheckpoint('123')).toBeNull()
  })
})

describe('owner filters', () => {
  it('lowercases owner and filters data sets by payer', async () => {
    const { db, queries } = fakeDb()
    await listDataSets(db, schemas, {
      owner: '0x480C51FE9FC90E01FA742C51300CC29E151A71CD',
      providerId: '2',
      limit: 10,
    })
    const [q] = queries
    expect(q?.text).toContain('from "early-repair".data_sets')
    expect(q?.text).toContain('payer = $1')
    expect(q?.text).toContain('provider_id = $2::bigint')
    expect(q?.params).toEqual([
      '0x480c51fe9fc90e01fa742c51300cc29e151a71cd',
      '2',
      11,
    ])
  })

  it('joins pieces to data sets for owner and keyset cursor', async () => {
    const { db, queries } = fakeDb()
    await listPieces(db, schemas, {
      owner: '0x305025D07C1DEE47F25A4990179EFF2BECDDCA0B',
      cursor: encodeCursor(['40938', '0']),
      limit: 5,
    })
    const [q] = queries
    expect(q?.text).toContain(
      'join "early-repair".data_sets d on d.data_set_id = p.data_set_id'
    )
    expect(q?.text).toContain('d.payer = $1')
    expect(q?.text).toContain(
      '(p.data_set_id, p.piece_id) < ($2::bigint, $3::bigint)'
    )
    expect(q?.params).toEqual([
      '0x305025d07c1dee47f25a4990179eff2becddca0b',
      '40938',
      '0',
      6,
    ])
  })
})

describe('rails', () => {
  it('filters by state from folded events', async () => {
    const { db, queries } = fakeDb()
    await listRails(db, schemas, { state: 'terminated', limit: 1 })
    expect(queries[0]?.text).toContain('from "foc-observer".fp_rail_created c')
    expect(queries[0]?.text).toContain(
      't.end_epoch is not null and f.finalized is null'
    )
  })

  it('derives the rail state', () => {
    expect(railState({ end_epoch: null, finalized: null })).toBe('active')
    expect(railState({ end_epoch: '5', finalized: null })).toBe('terminated')
    expect(railState({ end_epoch: '5', finalized: true })).toBe('finalized')
  })
})

describe('session keys', () => {
  it('names known permissions and evaluates expiry', () => {
    const key = mapSessionKey(rows.sessionKey, 1_700_000_000)
    expect(key.active).toBe(true)
    expect(key.permissions.map((p) => [p.name, p.active, p.origin])).toEqual([
      ['AddPieces', true, 'synapse'],
      [null, false, null],
    ])
    expect(mapSessionKey(rows.sessionKey, 1_800_000_000).active).toBe(false)
  })

  it('names synapse-core permissions including renamed typehashes', () => {
    const names = (permission: string) =>
      mapSessionKey(
        {
          ...rows.sessionKey,
          permissions: [{ ...rows.sessionKey.permissions[0], permission }],
        },
        0
      ).permissions[0]?.name
    expect(
      names(
        '0x522bd88a11de1cdc6574394dde7a21ae488ff13e16e7408d0ea721dd8479dffc'
      )
    ).toBe('TerminateService')
    expect(
      names(
        '0xb0988e9a1e5723860e0f59e0469113fb8a0ce9e83f8a1dd9109527eaad225b37'
      )
    ).toBe('DeleteDataSet')
  })

  it('applies the active filter in HAVING', async () => {
    const { db, queries } = fakeDb()
    await listSessionKeys(db, schemas, {
      identity: '0x44F08D1BEFE61255B3C3A349C392C560FA333759',
      active: true,
      now: 100,
      limit: 2,
    })
    const [q] = queries
    expect(q?.text).toContain('s.identity = $1')
    expect(q?.text).toContain('having (max(expiry) > $2::numeric) = $3')
    expect(q?.params).toEqual([
      '0x44f08d1befe61255b3c3a349c392c560fa333759',
      100,
      true,
      3,
    ])
  })
})

describe('status', () => {
  it('reads checkpoints from every schema', async () => {
    const { db, queries } = fakeDb(() => [rows.checkpoint])
    const status = await getStatus(db, NETWORKS.calibration)
    expect(queries[0]?.text).toContain('"foc-observer"._ponder_checkpoint')
    expect(queries[0]?.text).toContain('"early-repair"._ponder_checkpoint')
    expect(status.indexers[0]).toMatchObject({
      chainId: 314159,
      latest: { blockNumber: 4121900 },
      finalized: null,
    })
  })
})
