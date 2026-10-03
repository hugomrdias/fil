/**
 * A composable, parameterized SQL fragment built with the {@link sql} tag.
 * Rendering ({@link render}) numbers the parameters, so fragments can be
 * nested and reordered without tracking `$n` placeholders by hand.
 *
 * @see https://www.postgresql.org/docs/current/sql-prepare.html
 */
export class Sql {
  /** Literal SQL text around each value; one longer than `values`. */
  readonly strings: readonly string[]
  /** Interpolated values: parameters, or nested fragments to inline. */
  readonly values: readonly unknown[]

  /** Prefer the {@link sql} tag, {@link raw} or {@link join}. */
  constructor(strings: readonly string[], values: readonly unknown[]) {
    this.strings = strings
    this.values = values
  }
}

/**
 * Tag a SQL template. Interpolated {@link Sql} fragments are inlined; every
 * other value becomes a positional parameter. `false` and `undefined` are
 * parameters too, so filter optional conditions with {@link where}.
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): Sql {
  return new Sql(strings, values)
}

/** Trusted SQL text with no parameters, such as a keyword or identifier. */
export function raw(text: string): Sql {
  return new Sql([text], [])
}

/** Quote a trusted SQL identifier such as a configured schema name. */
export function ident(name: string): Sql {
  return raw(`"${name.replaceAll('"', '""')}"`)
}

/** Join fragments with a literal separator. */
export function join(parts: readonly Sql[], separator: string): Sql {
  if (parts.length === 0) return raw('')
  return new Sql(['', ...parts.slice(1).map(() => separator), ''], parts)
}

/**
 * Render `<keyword> a and b ...` from the conditions that are fragments, or
 * nothing when none are. Pass `cond !== undefined && sql\`...\`` for optional
 * filters.
 */
export function where(
  conditions: readonly (Sql | false | undefined)[],
  keyword: 'where' | 'having' = 'where'
): Sql {
  const parts = conditions.filter((c): c is Sql => c instanceof Sql)
  return parts.length === 0
    ? raw('')
    : sql`${raw(keyword)} ${join(parts, ' and ')}`
}

/** SQL text with `$n` placeholders and the matching parameters. */
export interface RenderedSql {
  text: string
  params: unknown[]
}

/** Render a fragment to SQL text and positional parameters. */
export function render(query: Sql): RenderedSql {
  const params: unknown[] = []
  const walk = (fragment: Sql): string => {
    let text = fragment.strings[0] ?? ''
    fragment.values.forEach((value, i) => {
      text += value instanceof Sql ? walk(value) : `$${params.push(value)}`
      text += fragment.strings[i + 1] ?? ''
    })
    return text
  }
  return { text: walk(query), params }
}
