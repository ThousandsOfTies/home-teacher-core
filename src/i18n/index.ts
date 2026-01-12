import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
    .use(HttpBackend) // HTTP経由で翻訳ファイルを読み込む
    .use(initReactI18next) // react-i18nextを初期化
    .init({
        lng: localStorage.getItem('language') || 'ja', // デフォルト言語（日本語）
        fallbackLng: 'ja', // フォールバック言語
        backend: {
            loadPath: import.meta.env.BASE_URL + 'locales/{{lng}}/translation.json' // 翻訳ファイルのパス
        },
        interpolation: {
            escapeValue: false // Reactは既にXSS対策済み
        }
    });

export default i18n;

