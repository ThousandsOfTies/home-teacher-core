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

  // PWA起動時: URLパラメータチェック（復元 & プレミアム解除）
  useEffect(() => {
    const checkUrlParams = async () => {
      const urlParams = new URLSearchParams(window.location.search)

      // 1. プレミアム解除チェック (?premium=true または #premium=true)
      const isPremiumUnlock = urlParams.get('premium') === 'true' || window.location.hash.includes('premium=true')
      if (isPremiumUnlock) {
        try {
          // 設定を読み込んで更新
          // 設定を読み込んで更新
          const settings = await getAppSettings()
          if (!settings.isPremium) {
            await saveAppSettings({
              ...settings,
              isPremium: true
            })
            alert('🎉 プレミアム機能が解除されました！\nSNS時間制限を自由に設定できます。')
          }

          // URLからパラメータを削除しない（PWAインストール時にパラメータを引き継ぐため）
          // urlParams.delete('premium')
          // const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '')
          // window.history.replaceState({}, '', newUrl)
        } catch (error) {
          console.error('プレミアム解除に失敗:', error)
        }
      }

      // 2. ドリル再開チェック (?pdfId=...)
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

      // 3. 通常起動 (Home画面)
      if (!pdfId) {
        setCurrentView('admin')
        setSelectedPDF(null)
        console.log('🏠 PWA起動: Home画面を表示')
      }
    }

    checkUrlParams()
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
