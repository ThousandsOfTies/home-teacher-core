import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

const getInitialLanguage = () => {
    const saved = localStorage.getItem('language');
    if (saved) return saved;
    return navigator.language.startsWith('ja') ? 'ja' : 'en';
};

i18n
    .use(HttpBackend) // HTTP経由で翻訳ファイルを読み込む
    .use(initReactI18next) // react-i18nextを初期化
    .init({
        lng: getInitialLanguage(), // ブラウザの言語設定に基づいて初期値を設定
        fallbackLng: 'ja', // フォールバック言語
        backend: {
            loadPath: import.meta.env.BASE_URL + 'locales/{{lng}}/translation.json' // 翻訳ファイルのパス
        },
        interpolation: {
            escapeValue: false // Reactは既にXSS対策済み
        }
    });

export default i18n;

