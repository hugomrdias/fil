/**
 * Build-time configuration read from `VITE_*` environment variables.
 *
 * @see https://vite.dev/guide/env-and-mode
 */
export const env = {
  /** Base URL of the fil-api REST API. */
  filApiUrl:
    import.meta.env.VITE_FIL_API_URL ?? 'https://fil-api.hugomrdias.dev',
}
