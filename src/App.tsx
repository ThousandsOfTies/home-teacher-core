import { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import AdminPanel from './components/admin/AdminPanel'
import PDFViewer from './components/pdf/PDFViewer'
import { PDFFileRecord } from './utils/indexedDB'

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

  // PWA起動時に常にHome画面（管理画面）に戻る
  useEffect(() => {
    // ページロード時（PWA再起動時）にadmin画面にリセット
    setCurrentView('admin')
    setSelectedPDF(null)
    console.log('🏠 PWA起動: Home画面を表示')
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
        <PDFViewer
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
