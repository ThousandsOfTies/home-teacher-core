/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_APP_VERSION?: string
  readonly VITE_APP_NAME?: string
  readonly VITE_APP_DESCRIPTION?: string
  readonly VITE_THEME_COLOR?: string
  readonly VITE_FEATURE_GRADING?: string
  readonly VITE_FEATURE_SNS?: string
  readonly VITE_ADSENSE_CLIENT_ID?: string
  readonly BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
