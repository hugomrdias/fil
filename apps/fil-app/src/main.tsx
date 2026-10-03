import './styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { TooltipProvider } from '@/components/ui/tooltip'
import { wagmiConfig } from '@/config/wagmi'
import { applyTheme } from '@/lib/theme'
import { queryClient, router } from '@/router'

applyTheme()

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
)
