import { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import AdminPanel from './components/admin/AdminPanel'
import StudyPanel from './components/study/StudyPanel'
import { PDFFileRecord, getPDFRecord, getAppSettings, saveAppSettings } from './utils/indexedDB'
import { useAppInitializer } from './hooks/useAppInitializer'

type AppView = 'admin' | 'viewer'

function App() {
  const [currentView, setCurrentView] = useState<AppView>('admin')
  const [selectedPDF, setSelectedPDF] = useState<PDFFileRecord | null>(null)

  // Initialization Hook
  const { isInitialized, initialView, initialPDF, settingsVersion } = useAppInitializer()

  // Sync initial state from hook
  useEffect(() => {
    if (isInitialized) {
      if (initialView === 'viewer' && initialPDF) {
        setSelectedPDF(initialPDF)
        setCurrentView('viewer')
      }
    }
  }, [isInitialized, initialView, initialPDF])


  // PWA update handling
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered [v0.2.5]:', r)
      // 起動時に更新チェックを明示的に行う
      if (r) {
        // 定期チェック (10分ごと)
        setInterval(async () => {
          console.log('Checking for sw update...')
          try {
            await r.update()
          } catch (e) {
            console.error('SW update check failed:', e)
          }
        }, 10 * 60 * 1000)

        // 初回チェック
        console.log('Running initial SW update check...')
        r.update().then(() => console.log('Initial SW update check completed')).catch(e => console.error('Initial SW update check failed:', e))
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

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

  if (!isInitialized) {
    return <div className="loading-screen" style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '1.5rem',
      color: '#3498db'
    }}>Loading...</div>
  }

  return (
    <div className="app">
      {currentView === 'admin' ? (
        <AdminPanel
          key={`admin-${settingsVersion}`}
          onSelectPDF={handleSelectPDF}
          hasUpdate={needRefresh}
          onUpdate={handleUpdate}
        />
      ) : selectedPDF ? (
        <StudyPanel
          key={`study-${settingsVersion}-${selectedPDF.id}`}
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
