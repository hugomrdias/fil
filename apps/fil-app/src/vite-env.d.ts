/// <reference types="vite/client" />

/** Typed `VITE_*` variables. */
interface ImportMetaEnv {
  readonly VITE_FIL_API_URL?: string
}

/** Vite `import.meta` with the typed env. */
interface ImportMeta {
  readonly env: ImportMetaEnv
}
