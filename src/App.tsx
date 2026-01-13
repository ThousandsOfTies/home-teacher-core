import { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import AdminPanel from './components/admin/AdminPanel'
import StudyPanel from './components/study/StudyPanel'
import { PDFFileRecord, getPDFRecord } from './utils/indexedDB'

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

  // PWA起動時: URLパラメータでpdfIdがあればドリルを再開、なければHome画面
  useEffect(() => {
    const restoreSession = async () => {
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

      // pdfIdがないか、復元に失敗した場合はHome画面
      setCurrentView('admin')
      setSelectedPDF(null)
      console.log('🏠 PWA起動: Home画面を表示')
    }

    restoreSession()
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
