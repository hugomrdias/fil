import { XIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { isAddress } from 'viem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ID_RE } from '@/lib/search'
import { cn } from '@/lib/utils'

/** Horizontal wrapper for filter controls. */
export function FilterBar(props: {
  children: ReactNode
  onClear?: () => void
  active?: boolean
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {props.children}
      {props.active && props.onClear ? (
        <Button onClick={props.onClear} size="sm" variant="ghost">
          <XIcon />
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Text filter input that commits on Enter/blur when valid.
 *
 * @param props.label - Field label.
 * @param props.value - Current committed value.
 * @param props.onChange - Commit callback (undefined clears).
 * @param props.isValid - Whether non-empty text can be committed.
 * @param props.normalize - Transform applied before committing.
 */
function TextFilter(props: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  isValid: (text: string) => boolean
  normalize?: (text: string) => string
  className: string
  inputMode?: 'numeric'
  placeholder?: string
}) {
  const [text, setText] = useState(props.value ?? '')
  useEffect(() => setText(props.value ?? ''), [props.value])
  const invalid = text !== '' && !props.isValid(text)
  const commit = () => {
    if (text === '') {
      props.onChange(undefined)
    } else if (!invalid) {
      props.onChange(props.normalize ? props.normalize(text) : text)
    }
  }
  const id = `filter-${props.label.toLowerCase().replaceAll(' ', '-')}`
  return (
    <div className={cn('flex flex-col gap-1.5', props.className)}>
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        aria-invalid={invalid}
        id={id}
        inputMode={props.inputMode}
        onBlur={commit}
        onChange={(event) => setText(event.target.value.trim())}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
          }
        }}
        placeholder={props.placeholder}
        value={text}
      />
    </div>
  )
}

/** Props shared by {@link AddressFilter} and {@link IdFilter}. */
interface FilterInputProps {
  /** Field label. */
  label: string
  /** Current committed value. */
  value: string | undefined
  /** Commit callback (undefined clears). */
  onChange: (value: string | undefined) => void
}

/**
 * Address filter input; commits lowercase addresses.
 *
 * @param props - {@link FilterInputProps}
 */
export function AddressFilter(props: FilterInputProps) {
  return (
    <TextFilter
      {...props}
      className="w-full sm:w-80"
      isValid={(text) => isAddress(text, { strict: false })}
      normalize={(text) => text.toLowerCase()}
      placeholder="0x…"
    />
  )
}

/**
 * Numeric id filter input.
 *
 * @param props - {@link FilterInputProps}
 */
export function IdFilter(props: FilterInputProps) {
  return (
    <TextFilter
      {...props}
      className="w-32"
      inputMode="numeric"
      isValid={(text) => ID_RE.test(text)}
    />
  )
}

/**
 * Select filter with an "Any" option.
 *
 * @param props.label - Field label.
 * @param props.value - Current value.
 * @param props.options - Value/label pairs.
 * @param props.onChange - Change callback (undefined for Any).
 */
export function SelectFilter<T extends string>(props: {
  label: string
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (value: T | undefined) => void
}) {
  const items = [{ value: 'any', label: 'Any' }, ...props.options]
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{props.label}</Label>
      <Select
        items={items}
        onValueChange={(value) =>
          props.onChange(value === 'any' ? undefined : (value as T))
        }
        value={props.value ?? 'any'}
      >
        <SelectTrigger aria-label={props.label} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Boolean filter options in fil-api's string form. */
export const BOOL_OPTIONS = [
  { value: 'true' as const, label: 'Yes' },
  { value: 'false' as const, label: 'No' },
]
