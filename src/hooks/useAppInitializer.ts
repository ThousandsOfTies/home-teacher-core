import { useState, useEffect, useCallback } from 'react'
import { getAppSettings, saveAppSettings, getPDFRecord, PDFFileRecord } from '../utils/indexedDB'

interface AppInitializerResult {
    isInitialized: boolean
    initialView: 'admin' | 'viewer'
    initialPDF: PDFFileRecord | null
    settingsVersion: number
}

export const useAppInitializer = () => {
    const [isInitialized, setIsInitialized] = useState(false)
    const [initialView, setInitialView] = useState<'admin' | 'viewer'>('admin')
    const [initialPDF, setInitialPDF] = useState<PDFFileRecord | null>(null)
    const [settingsVersion, setSettingsVersion] = useState(0)

    // プレミアム解除チェック
    const checkPremium = useCallback(async () => {
        const urlParams = new URLSearchParams(window.location.search)
        // ?premium=true または #premium=true を検知
        const isPremiumUnlock = urlParams.get('premium') === 'true' || window.location.hash.includes('premium=true')

        if (isPremiumUnlock) {
            try {
                const settings = await getAppSettings()
                // 既にプレミアムの場合は何もしない
                if (!settings.isPremium) {
                    await saveAppSettings({
                        ...settings,
                        isPremium: true
                    })
                    setSettingsVersion(v => v + 1)
                    alert('🎉 プレミアム機能が解除されました！\nSNS時間制限を自由に設定できます。')
                }
            } catch (error) {
                console.error('プレミアム解除に失敗:', error)
            }
        }
    }, [])

    // 初期化プロセス
    useEffect(() => {
        const initialize = async () => {
            try {
                // 1. プレミアムチェック（同期的に待機することで競合を防ぐ）
                await checkPremium()

                // 2. ドリル再開チェック
                const urlParams = new URLSearchParams(window.location.search)
                const pdfId = urlParams.get('pdfId')

                if (pdfId) {
                    try {
                        const record = await getPDFRecord(pdfId)
                        if (record) {
                            console.log('📖 SNS終了後: ドリルを再開', { pdfId, fileName: record.fileName })
                            setInitialPDF(record)
                            setInitialView('viewer')
                            // URLからパラメータを削除
                            window.history.replaceState({}, '', window.location.pathname)
                        }
                    } catch (error) {
                        console.error('ドリルの復元に失敗:', error)
                    }
                }
            } catch (error) {
                console.error('アプリ初期化中にエラーが発生しました:', error)
            } finally {
                setIsInitialized(true)
            }
        }

        initialize()
        console.log('App initialization started [v1.0.1]')

        // ハッシュ変更監視（初期化後も有効にする）
        const handleHashChange = () => {
            checkPremium();
        }
        window.addEventListener('hashchange', handleHashChange)

        return () => {
            window.removeEventListener('hashchange', handleHashChange)
        }
    }, [checkPremium])

    return {
        isInitialized,
        initialView,
        initialPDF,
        settingsVersion
    }
}
