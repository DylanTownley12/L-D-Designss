/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'sim' | 'live'
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
