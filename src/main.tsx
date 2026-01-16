import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n' // i18nの初期化
import { APP_NAME, APP_DESCRIPTION, THEME_COLOR } from './config/features'

// モバイルデバッグ用 DevTools (iPad/iPhone でコンソールを確認可能)
// NOTE: 本番環境でも有効だが、画面右下のボタンを押さない限り表示されない
import eruda from 'eruda'
import { initDebugLogger } from './utils/debugLogger'

eruda.init()
initDebugLogger() // 画面上にログを表示（Eruda が動作しない場合のフォールバック）

// Eruda 動作確認用ログ
console.log('🚀 App Started!', new Date().toISOString())
console.log('✅ Eruda is working!')
console.log('✅ Debug Logger initialized!')

// アプリ名とテーマカラーを動的に設定
document.title = APP_NAME
const metaDescription = document.querySelector('meta[name="description"]')
if (metaDescription) {
  metaDescription.setAttribute('content', APP_DESCRIPTION)
}
const metaThemeColor = document.querySelector('meta[name="theme-color"]')
if (metaThemeColor) {
  metaThemeColor.setAttribute('content', THEME_COLOR)
}

// グローバルエラーハンドラー
window.addEventListener('error', (event) => {
  console.error('グローバルエラー:', event.error)
  console.error('メッセージ:', event.message)
  console.error('ファイル:', event.filename)
  console.error('行:', event.lineno, '列:', event.colno)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('未処理のPromise拒否:', event.reason)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
