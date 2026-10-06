import { useForm } from '@tanstack/react-form'
import { formatUnits } from 'viem'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { parseUnitsSafe } from '@/lib/format'

/** Props for {@link AmountForm}. */
export interface AmountFormProps {
  /** Field label. */
  label: string
  /** Submit button label. */
  action: string
  /** Token symbol. */
  symbol: string
  /** Token decimals. */
  decimals?: number
  /** Maximum allowed amount in base units. */
  max?: bigint
  /** Description under the field. */
  description?: string
  /** Disable submission. */
  disabled?: boolean
  /** Decimal amount to prefill, e.g. from a deep link. */
  defaultValue?: string
  /**
   * Submit handler with the parsed amount. A rejection keeps the input; the
   * caller reports the error (e.g. in its mutation `onError`).
   */
  onSubmit: (amount: bigint) => Promise<unknown>
}

/**
 * Token amount form with "Max" and balance validation.
 *
 * @see https://tanstack.com/form/latest/docs/framework/react/quick-start
 */
export function AmountForm(props: AmountFormProps) {
  const decimals = props.decimals ?? 18
  const form = useForm({
    defaultValues: { amount: props.defaultValue ?? '' },
    onSubmit: async ({ value, formApi }) => {
      const amount = parseUnitsSafe(value.amount, decimals)
      if (amount === undefined) {
        return
      }
      try {
        await props.onSubmit(amount)
        // Clear rather than restore a prefill, so it is not submitted twice.
        formApi.reset({ amount: '' })
      } catch {
        // The caller's mutation onError reports the failure; keep the input.
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.Field
        name="amount"
        validators={{
          onChange: ({ value }) => {
            if (value === '') {
              return undefined
            }
            const amount = parseUnitsSafe(value, decimals)
            if (amount === undefined || amount === 0n) {
              return 'Enter a positive amount'
            }
            if (props.max !== undefined && amount > props.max) {
              return 'Amount exceeds the available balance'
            }
            return undefined
          },
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor={field.name}>{props.label}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                aria-invalid={field.state.meta.errors.length > 0}
                id={field.name}
                inputMode="decimal"
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="0.0"
                value={field.state.value}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{props.symbol}</InputGroupText>
                {props.max === undefined ? null : (
                  <InputGroupButton
                    onClick={() =>
                      field.handleChange(formatUnits(props.max ?? 0n, decimals))
                    }
                    size="xs"
                  >
                    Max
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
            {props.description ? (
              <FieldDescription>{props.description}</FieldDescription>
            ) : null}
            <FieldError>{field.state.meta.errors.join(', ')}</FieldError>
          </Field>
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) =>
          [state.canSubmit, state.isSubmitting, state.values.amount] as const
        }
      >
        {([canSubmit, isSubmitting, amount]) => (
          <Button
            disabled={
              props.disabled || !canSubmit || isSubmitting || amount === ''
            }
            type="submit"
          >
            {isSubmitting ? <Spinner /> : null}
            {props.action}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
