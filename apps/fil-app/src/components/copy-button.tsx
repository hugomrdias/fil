import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Icon button that copies a value to the clipboard.
 *
 * @param props.value - Text to copy.
 * @param props.label - Accessible label.
 */
export function CopyButton(props: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      aria-label={props.label ?? 'Copy to clipboard'}
      onClick={async (event) => {
        event.preventDefault()
        event.stopPropagation()
        await navigator.clipboard.writeText(props.value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      size="icon-xs"
      variant="ghost"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}
