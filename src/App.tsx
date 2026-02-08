import { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import AdminPanel from './components/admin/AdminPanel'
import StudyPanel from './components/study/StudyPanel'
import { PDFFileRecord, getPDFRecord, getAppSettings, saveAppSettings } from './utils/indexedDB'

type AppView = 'admin' | 'viewer'

function App() {
  const [currentView, setCurrentView] = useState<AppView>('admin')
  const [selectedPDF, setSelectedPDF] = useState<PDFFileRecord | null>(null)

  // PWA update handling
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  // URLパラメータチェック（プレミアム解除 & ドリル再開）
  useEffect(() => {
    // プレミアム解除チェック関数
    const checkPremium = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      // ?premium=true または #premium=true を検知
      const isPremiumUnlock = urlParams.get('premium') === 'true' || window.location.hash.includes('premium=true')

      if (isPremiumUnlock) {
        try {
          const settings = await getAppSettings()
          // 既にプレミアムの場合は何もしない（アラートも出さない）
          if (!settings.isPremium) {
            await saveAppSettings({
              ...settings,
              isPremium: true
            })
            alert('🎉 プレミアム機能が解除されました！\nSNS時間制限を自由に設定できます。')
          }
        } catch (error) {
          console.error('プレミアム解除に失敗:', error)
        }
      }
    }

    // ドリル再開チェック関数（初回のみ）
    const checkRestore = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const pdfId = urlParams.get('pdfId')

      if (pdfId) {
        try {
          const record = await getPDFRecord(pdfId)
          if (record) {
            console.log('📖 SNS終了後: ドリルを再開', { pdfId, fileName: record.fileName })
            setSelectedPDF(record)
            setCurrentView('viewer')
            // URLからパラメータを削除（履歴を残さない）
            window.history.replaceState({}, '', window.location.pathname)
            return
          }
        } catch (error) {
          console.error('ドリルの復元に失敗:', error)
        }
      }

      // 通常起動
      if (!pdfId) {
        console.log('🏠 PWA起動: Home画面を表示')
        // 初期状態がAdminなので明示的なsetStateは不要だが、ログ用に残す
      }
    }

    // 初期化実行
    checkPremium()
    checkRestore()

    // ハッシュ変更を監視（リロードなしで #premium=true を検知できるようにする）
    window.addEventListener('hashchange', checkPremium)

    // クリーンアップ
    return () => {
      window.removeEventListener('hashchange', checkPremium)
    }
  }, [])


  const handleSelectPDF = (record: PDFFileRecord) => {
    setSelectedPDF(record)
    setCurrentView('viewer')
  }

  const handleBackToAdmin = () => {
    setCurrentView('admin')
    setSelectedPDF(null)
  }

  const handleUpdate = () => {
    console.log('🔄 Updating Service Worker...')
    updateServiceWorker(true)
  }

  return (
    <div className="app">
      {currentView === 'admin' ? (
        <AdminPanel
          onSelectPDF={handleSelectPDF}
          hasUpdate={needRefresh}
          onUpdate={handleUpdate}
        />
      ) : selectedPDF ? (
        <StudyPanel
          pdfRecord={selectedPDF}
          pdfId={selectedPDF.id}
          onBack={handleBackToAdmin}
        />
      ) : (
        <div>No PDF selected</div>
      )}
    </div>
  )
}

export default App
