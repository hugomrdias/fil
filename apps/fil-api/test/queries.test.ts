import { describe, expect, it } from 'vitest'
import { ident, logIndex, Where } from '../src/db.ts'
import { ApiError } from '../src/errors.ts'
import { NETWORKS } from '../src/networks.ts'
import {
  decodeCursor,
  encodeCursor,
  isInt8,
  toPage,
} from '../src/pagination.ts'
import { listDataSets } from '../src/queries/data-sets.ts'
import { listPieces } from '../src/queries/pieces.ts'
import {
  getRail,
  listRailSettlements,
  listRails,
  railState,
} from '../src/queries/rails.ts'
import {
  listSessionKeyEvents,
  listSessionKeys,
  mapSessionKey,
} from '../src/queries/session-keys.ts'
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

  it('orders same-block events by numeric log index', () => {
    expect(logIndex('x')).toBe("split_part(x.id, '-', 2)::int")
    expect(logIndex()).toBe("split_part(id, '-', 2)::int")
  })
})

describe('pagination', () => {
  it('round-trips cursors', () => {
    const cursor = encodeCursor(['40938', '0'])
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(cursor, ['int8', 'int8'])).toEqual(['40938', '0'])
  })

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('zzz', ['int8'])).toThrow(ApiError)
    expect(() => decodeCursor(encodeCursor(['1']), ['int8', 'int8'])).toThrow(
      ApiError
    )
  })

  it('rejects cursor parts that would fail their SQL cast', () => {
    expect(() => decodeCursor(encodeCursor(['abc']), ['int8'])).toThrow(
      ApiError
    )
    expect(() =>
      decodeCursor(encodeCursor(['99999999999999999999']), ['int8'])
    ).toThrow(ApiError)
    expect(() =>
      decodeCursor(encodeCursor(['0xZZ', '1']), ['address', 'int8'])
    ).toThrow(ApiError)
    const address = '0x44f08d1befe61255b3c3a349c392c560fa333759'
    expect(
      decodeCursor(encodeCursor([address, address]), ['address', 'address'])
    ).toEqual([address, address])
  })

  it('bounds ids to the bigint range', () => {
    expect(isInt8('9223372036854775807')).toBe(true)
    expect(isInt8('9223372036854775808')).toBe(false)
    expect(isInt8('-1')).toBe(false)
  })

  it('uses the extra row to emit nextCursor', () => {
    const page = toPage(
      [{ id: 3 }, { id: 2 }, { id: 1 }],
      2,
      (r) => r.id,
      (r) => [r.id]
    )
    expect(page.data).toEqual([3, 2])
    expect(decodeCursor(page.nextCursor ?? '', ['int8'])).toEqual(['2'])
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
  it('filters data sets by owner (payer)', async () => {
    const { db, queries } = fakeDb()
    await listDataSets(db, schemas, {
      owner: '0x480c51fe9fc90e01fa742c51300cc29e151a71cd',
      provider_id: '2',
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
      owner: '0x305025d07c1dee47f25a4990179eff2becddca0b',
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

  it('picks the latest same-block event by log index', async () => {
    const { db, queries } = fakeDb(() => [rows.rail])
    await getRail(db, schemas, '1')
    const text = queries[0]?.text ?? ''
    expect(text).toContain(
      `order by x.block_number desc, ${logIndex('x')} desc`
    )
    expect(text).not.toContain('x.id desc')
  })

  it('limits the page before aggregating settlements', async () => {
    const { db, queries } = fakeDb()
    await listRails(db, schemas, { state: 'finalized', limit: 2 })
    const text = queries[0]?.text ?? ''
    const limit = text.indexOf('order by c.rail_id desc limit $1')
    const settled = text.indexOf('fp_rail_settled')
    expect(limit).toBeGreaterThan(-1)
    expect(settled).toBeGreaterThan(limit)
    expect(text).toContain('where x.rail_id = page.rail_id')
  })

  it('pages settlements by block and log index', async () => {
    const { db, queries } = fakeDb(() => [
      { ...rows.settlement, log_index: 12 },
      { ...rows.settlement, log_index: 3 },
    ])
    const page = await listRailSettlements(db, schemas, {
      railId: '12818',
      limit: 1,
    })
    expect(decodeCursor(page.nextCursor ?? '', ['int8', 'int8'])).toEqual([
      '4121949',
      '12',
    ])
    await listRailSettlements(db, schemas, {
      railId: '12818',
      limit: 1,
      cursor: page.nextCursor ?? '',
    })
    expect(queries[1]?.text).toContain(
      `(block_number, ${logIndex()}) < ($2::numeric, $3::int)`
    )
    expect(queries[1]?.params).toEqual(['12818', '4121949', '12', 2])
  })

  it('throws 404 for a missing rail and lowercases addresses', async () => {
    await expect(getRail(fakeDb().db, schemas, '9')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
    const { db } = fakeDb(() => [
      { ...rows.rail, payer: '0x290C51F674ECF478E7EC20810B600BB6526622B4' },
    ])
    const rail = await getRail(db, schemas, '1')
    expect(rail.payer).toBe('0x290c51f674ecf478e7ec20810b600bb6526622b4')
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
      identity: '0x44f08d1befe61255b3c3a349c392c560fa333759',
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

describe('session key ordering', () => {
  it('folds the latest authorization by log index within a block', async () => {
    const { db, queries } = fakeDb()
    await listSessionKeys(db, schemas, { now: 0, limit: 1 })
    expect(queries[0]?.text).toContain(
      `s.block_number desc,\n         ${logIndex('s')} desc`
    )
  })

  it('pages events by block and log index', async () => {
    const { db, queries } = fakeDb(() => [
      { ...rows.sessionKeyEvent, log_index: 7 },
      { ...rows.sessionKeyEvent, log_index: 2 },
    ])
    const page = await listSessionKeyEvents(db, schemas, { limit: 1 })
    expect(decodeCursor(page.nextCursor ?? '', ['int8', 'int8'])).toEqual([
      '3187939',
      '7',
    ])
    expect(queries[0]?.text).toContain(
      'order by block_number desc, log_index desc'
    )
  })
})
