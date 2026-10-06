import { calibration, mainnet } from '@filoz/synapse-core/chains'
import {
  calibrationTransport,
  mainnetTransport,
} from '@filoz/synapse-core/client'
import { createConfig, createStorage, injected } from 'wagmi'

/**
 * wagmi config with the Synapse Filecoin chains and EIP-6963 injected wallets.
 *
 * @see https://wagmi.sh/react/api/createConfig
 * @see https://wagmi.sh/react/guides/ssr
 */
export const wagmiConfig = createConfig({
  // Pages render on the server, so restore the stored connection after
  // hydration instead of during the first render.
  ssr: true,
  chains: [mainnet, calibration],
  connectors: [injected()],
  transports: {
    [mainnet.id]: mainnetTransport,
    [calibration.id]: calibrationTransport,
  },
  storage: createStorage({
    key: 'fil-app.wagmi',
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
  }),
})

declare module 'wagmi' {
  /** Register the config so hooks infer the chains. */
  interface Register {
    config: typeof wagmiConfig
  }
}
