import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEFAULT_NETWORK } from '@/lib/networks'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/$network',
      params: { network: DEFAULT_NETWORK },
    })
  },
})
