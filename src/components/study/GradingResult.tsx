import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GradingResponseResult } from '../../services/api'
import { SNSLinkRecord } from '../../utils/indexedDB'
import { getSNSIcon } from '../../constants/sns'
import './GradingResult.css'

interface GradingResultProps {
  result: GradingResponseResult | null
  onClose: () => void
  snsLinks?: SNSLinkRecord[]
  timeLimitMinutes?: number // SNS利用時間制限（分）
  modelName?: string | null
  responseTime?: number | null
  pdfId?: string // SNS終了後に戻るドリルのID
}

const GradingResult = ({ result, onClose, snsLinks = [], timeLimitMinutes = 30, modelName, responseTime, pdfId }: GradingResultProps) => {
  const { t } = useTranslation()
  if (!result) return null

  // ドラッグ位置の状態管理
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Null要素をフィルタリングした有効な問題のみを取得
  const validProblems = result.problems?.filter(problem =>
    problem.problemNumber !== null && problem.isCorrect !== null
  ) || []

  // iOS Safari対応: ネイティブイベントリスナーでタッチ・ポインターイベントをブロック
  // ただしパネル内のタッチは許可（ボタンやドラッグ操作のため）
  useEffect(() => {
    const overlay = overlayRef.current
    const panel = panelRef.current
    if (!overlay) return

    const blockTouch = (e: TouchEvent) => {
      // パネル内のタッチは許可（ボタンクリック、ドラッグ等）
      if (panel && panel.contains(e.target as Node)) {
        // パネル内でも2本指以上のジェスチャーはブロック
        if (e.touches.length >= 2) {
          e.preventDefault()
        }
        return // 1本指のタッチは許可
      }
      // オーバーレイ直接のタッチはPDFへの伝播をブロック
      e.preventDefault()
      e.stopPropagation()
    }

    // Apple Pencil対応: PointerEventもブロック（pointerType: "pen"）
    const blockPointer = (e: PointerEvent) => {
      // パネル内のポインターは許可（ボタンクリック、ドラッグ等）
      if (panel && panel.contains(e.target as Node)) {
        return // パネル内のポインターは許可
      }
      // オーバーレイ直接のポインターはPDFへの伝播をブロック
      e.preventDefault()
      e.stopPropagation()
    }

    // passive: false で登録することでpreventDefaultが確実に動作
    overlay.addEventListener('touchstart', blockTouch, { passive: false, capture: true })
    overlay.addEventListener('touchmove', blockTouch, { passive: false, capture: true })
    overlay.addEventListener('touchend', blockTouch, { passive: false, capture: true })
    // Apple Pencil（PointerEvent）対応
    overlay.addEventListener('pointerdown', blockPointer, { passive: false, capture: true })
    overlay.addEventListener('pointermove', blockPointer, { passive: false, capture: true })
    overlay.addEventListener('pointerup', blockPointer, { passive: false, capture: true })

    return () => {
      overlay.removeEventListener('touchstart', blockTouch, true)
      overlay.removeEventListener('touchmove', blockTouch, true)
      overlay.removeEventListener('touchend', blockTouch, true)
      overlay.removeEventListener('pointerdown', blockPointer, true)
      overlay.removeEventListener('pointermove', blockPointer, true)
      overlay.removeEventListener('pointerup', blockPointer, true)
    }
  }, [])

  // ドラッグ開始
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    // イベントの伝播を即座に停止（PDFのパン操作を防ぐ）
    e.stopPropagation()
    e.preventDefault()

    // マルチタッチなどは無視（プライマリポインタのみ）
    if (!e.isPrimary) return

    setIsDragging(true)

    // PointerEvent has clientX/Y directly
    const clientX = e.clientX
    const clientY = e.clientY

    dragStartPos.current = {
      x: clientX - position.x,
      y: clientY - position.y
    }

    // ポインターキャプチャを設定（ドラッグ中のイベントを確実に受け取る）
    /* e.currentTarget.setPointerCapture(e.pointerId) */
    // Note: React's event pooling or synthetic event might make setPointerCapture tricky here without e.persist() or accessing the native target correctly.
    // Instead we rely on document listeners which is robust for dragging.
  }

  // ドラッグ中
  useEffect(() => {
    const handleDragMove = (e: PointerEvent) => {
      if (!isDragging) return
      if (!e.isPrimary) return

      // イベントの伝播を停止
      e.stopPropagation()
      e.preventDefault()

      const clientX = e.clientX
      const clientY = e.clientY

      setPosition({
        x: clientX - dragStartPos.current.x,
        y: clientY - dragStartPos.current.y
      })
    }

    const handleDragEnd = (e: PointerEvent) => {
      if (!e.isPrimary) return
      e.stopPropagation()
      e.preventDefault()
      setIsDragging(false)
    }

    if (isDragging) {
      // キャプチャフェーズでイベントを捕捉
      document.addEventListener('pointermove', handleDragMove, { passive: false, capture: true })
      document.addEventListener('pointerup', handleDragEnd, { capture: true })
      document.addEventListener('pointercancel', handleDragEnd, { capture: true })
    }

    return () => {
      document.removeEventListener('pointermove', handleDragMove, true)
      document.removeEventListener('pointerup', handleDragEnd, true)
      document.removeEventListener('pointercancel', handleDragEnd, true)
    }
  }, [isDragging])

  // SNS選択画面（警告ページ）を開く
  const openSNSSelectionPage = () => {
    // SNSリンク情報をJSON形式でURLパラメータに渡す（SVGとカラー情報も含む）
    const snsLinksJson = JSON.stringify(snsLinks.map(link => {
      const snsIcon = getSNSIcon(link.id)
      return {
        id: link.id,
        name: link.name,
        url: link.url.startsWith('http://') || link.url.startsWith('https://') ? link.url : 'https://' + link.url,
        icon: link.icon, // 絵文字（フォールバック用）
        svg: snsIcon?.svg || null, // SVGデータ
        color: snsIcon?.color || '#666' // ブランドカラー
      }
    }))

    // SNS管理ページへ遷移（SNS選択UIを表示）
    // 戻り先URLを明示的に渡す（PWA/IndexedDB安定性のため）
    // pdfIdがあれば、戻り先URLにも含めてドリルを再開できるようにする
    const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`
    const returnUrl = pdfId ? `${baseUrl}?pdfId=${encodeURIComponent(pdfId)}` : baseUrl
    const manageUrl = `${baseUrl}manage.html?time=${timeLimitMinutes}&snsLinks=${encodeURIComponent(snsLinksJson)}&returnUrl=${encodeURIComponent(returnUrl)}`

    // console.log('🔄 SNS管理ページへ遷移:', { manageUrl, returnUrl })

    // 現在のタブをSNS管理ページに置き換え
    window.location.replace(manageUrl)
  }

  return (
    <div
      ref={overlayRef}
      className="grading-result-overlay"
      style={{ pointerEvents: 'auto' }} // Capture all pointer events on overlay
      onClick={(e) => {
        // Only close if clicking directly on overlay (not on panel)
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        className="grading-result-panel"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default',
          pointerEvents: 'auto'
        }}
        onWheel={(e) => {
          e.stopPropagation()
        }}
        onPointerDown={(e) => {
          // パネル自体のクリックでの伝播停止（ドラッグ以外）
          e.stopPropagation()
        }}
      // 他のイベントハンドラはuseEffectのブロックロジックでカバーされるため削除
      >
        <div
          className="result-header"
          onPointerDown={handleDragStart}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none' // タッチアクションを無効化
          }}
        >
          <h2>{t('gradingResult.title')}</h2>
        </div>

        <div
          className="result-content"
          style={{
            touchAction: 'pan-y', // Allow vertical scroll only
            overscrollBehavior: 'contain' // Prevent scroll chaining to parent
          }}
          onTouchStart={(e) => {
            e.stopPropagation()
          }}
          onTouchMove={(e) => {
            e.stopPropagation()
            // Allow scroll within this element, but don't propagate
          }}
          onTouchEnd={(e) => {
            e.stopPropagation()
          }}
          onWheel={(e) => {
            e.stopPropagation()
          }}
        >
          {validProblems.length > 0 ? (
            <div className="problems-list">
              {validProblems.map((problem, index) => (
                <div
                  key={index}
                  className={`problem-item ${problem.isCorrect ? 'correct' : 'incorrect'
                    }`}
                >
                  <div className="problem-header">
                    <span className="result-icon">
                      {problem.isCorrect ? '⭕' : '❌'}
                    </span>
                    <h3>
                      {problem.problemNumber || `${t('gradingResult.problem')} ${index + 1}`}
                    </h3>
                  </div>

                  {problem.problemText && (
                    <div className="problem-text">
                      {problem.problemText}
                    </div>
                  )}

                  {problem.studentAnswer && (
                    <div className="student-answer">
                      <strong>{t('gradingResult.yourAnswer')}</strong> {problem.studentAnswer}
                    </div>
                  )}

                  {!problem.isCorrect && problem.correctAnswer && (
                    <div className="correct-answer">
                      <strong>{t('gradingResult.correctAnswer')}</strong> {problem.correctAnswer}
                    </div>
                  )}

                  {problem.feedback && (
                    <div className="feedback">
                      <strong>{t('gradingResult.feedback')}</strong>
                      <p>{problem.feedback}</p>
                    </div>
                  )}

                  {problem.explanation && (
                    <div className="explanation">
                      <strong>{t('gradingResult.explanation')}</strong>
                      <p>{problem.explanation}</p>
                      {problem.explanationSvg && (
                        <div
                          className="explanation-svg-container"
                          dangerouslySetInnerHTML={{ __html: problem.explanationSvg }}
                        />
                      )}
                    </div>
                  )}

                  {/* 採点ソース情報（デバッグ・確認用） */}
                  <div className="grading-source" style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    backgroundColor: problem.gradingSource === 'db' ? '#e8f5e9' : '#fff3e0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#666'
                  }}>
                    <strong>{t('gradingResult.gradingSource')}</strong>{' '}
                    {problem.gradingSource === 'db' ? (
                      <span style={{ color: '#2e7d32' }}>
                        {t('gradingResult.sourceDb')}
                        {problem.dbMatchedAnswer && (
                          <span style={{ display: 'block', marginTop: '4px', fontSize: '11px' }}>
                            {t('gradingResult.problemPage')}: {problem.dbMatchedAnswer.problemPageNumber ?? '不明'},
                            {t('gradingResult.registeredAnswer')}: {problem.dbMatchedAnswer.correctAnswer}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: '#e65100' }}>
                        {t('gradingResult.sourceAi')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="raw-response">
              <p>{result.overallComment || result.rawResponse}</p>
            </div>
          )}

          {result.overallComment && validProblems.length > 0 && (
            <div className="overall-comment">
              <h3>{t('gradingResult.overallComment')}</h3>
              <p>{result.overallComment}</p>
            </div>
          )}
        </div>

        {snsLinks.length > 0 && (
          <div className="sns-links-section">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#2c3e50', marginBottom: '12px', textAlign: 'center' }}>
              Enjoy!
            </h3>
            <button
              onClick={openSNSSelectionPage}
              style={{
                width: '100%',
                padding: '20px',
                fontSize: '18px',
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)'
              }}
            >
              {t('gradingResult.viewSns')}
            </button>
          </div>
        )}

        <div className="model-info-footer">
          <div className="model-info-text">
            {modelName && responseTime != null
              ? `${modelName} (${responseTime}s)`
              : modelName || (responseTime != null ? `${responseTime}s` : '')}
          </div>
          <button className="footer-close-btn" onClick={onClose}>
            {t('gradingResult.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default GradingResult
