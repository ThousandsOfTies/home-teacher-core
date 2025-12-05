/**
 * TutoTuto 機能設定
 * 環境変数によってバージョンごとの機能を制御
 */

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'kids'
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'TutoTuto'
export const APP_DESCRIPTION = import.meta.env.VITE_APP_DESCRIPTION || '子供向け学習支援アプリ'
export const THEME_COLOR = import.meta.env.VITE_THEME_COLOR || '#3498db'

// 機能フラグ
export const FEATURES = {
  // AI採点機能（子供用のみ）
  grading: import.meta.env.VITE_FEATURE_GRADING === 'true',

  // SNS報酬機能（子供用のみ）
  sns: import.meta.env.VITE_FEATURE_SNS === 'true',
}

// バージョン判定
export const isKidsVersion = APP_VERSION === 'kids'
export const isDiscussVersion = APP_VERSION === 'discuss'

// デバッグ情報をコンソールに出力
console.log('🎨 TutoTuto Version:', APP_VERSION)
console.log('📱 App Name:', APP_NAME)
console.log('🎯 Features:', FEATURES)
