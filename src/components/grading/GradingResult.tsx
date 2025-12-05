import { useState, useRef, useEffect } from 'react'
import { GradingResult as GradingResultType } from '../../services/api'
import { SNSLinkRecord } from '../../utils/indexedDB'
import { getSNSIcon } from '../../constants/sns'
import './GradingResult.css'

interface GradingResultProps {
  result: GradingResultType | null
  onClose: () => void
  snsLinks?: SNSLinkRecord[]
  timeLimitMinutes?: number // SNS利用時間制限（分）
  modelName?: string | null
  responseTime?: number | null
}

const GradingResult = ({ result, onClose, snsLinks = [], timeLimitMinutes = 30, modelName, responseTime }: GradingResultProps) => {
  if (!result) return null

  // ドラッグ位置の状態管理
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)

  // Null要素をフィルタリングした有効な問題のみを取得
  const validProblems = result.problems?.filter(problem =>
    problem.problemNumber !== null && problem.isCorrect !== null
  ) || []

  // ドラッグ開始
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    // イベントの伝播を即座に停止（PDFのパン操作を防ぐ）
    e.stopPropagation()
    e.preventDefault()

    setIsDragging(true)
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    dragStartPos.current = {
      x: clientX - position.x,
      y: clientY - position.y
    }
  }

  // ドラッグ中
  useEffect(() => {
    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return

      // イベントの伝播を停止（PDFのパン操作を防ぐ）
      e.stopPropagation()
      e.preventDefault()

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      setPosition({
        x: clientX - dragStartPos.current.x,
        y: clientY - dragStartPos.current.y
      })
    }

    const handleDragEnd = (e: MouseEvent | TouchEvent) => {
      // ドラッグ終了時もイベント伝播を停止
      e.stopPropagation()
      e.preventDefault()
      setIsDragging(false)
    }

    if (isDragging) {
      // キャプチャフェーズでイベントを捕捉（より早い段階でイベントをキャッチ）
      document.addEventListener('mousemove', handleDragMove, { passive: false, capture: true })
      document.addEventListener('mouseup', handleDragEnd, { capture: true })
      document.addEventListener('touchmove', handleDragMove, { passive: false, capture: true })
      document.addEventListener('touchend', handleDragEnd, { capture: true })
    }

    return () => {
      document.removeEventListener('mousemove', handleDragMove, true)
      document.removeEventListener('mouseup', handleDragEnd, true)
      document.removeEventListener('touchmove', handleDragMove, true)
      document.removeEventListener('touchend', handleDragEnd, true)
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
    const returnUrl = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`
    const manageUrl = `${returnUrl}manage.html?time=${timeLimitMinutes}&snsLinks=${encodeURIComponent(snsLinksJson)}&returnUrl=${encodeURIComponent(returnUrl)}`

    console.log('🔄 SNS管理ページへ遷移:', { manageUrl, returnUrl })

    // 現在のタブをSNS管理ページに置き換え
    window.location.replace(manageUrl)
  }

  return (
    <div className="grading-result-overlay" style={{ pointerEvents: 'none' }}>
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
          e.preventDefault()
        }}
        onMouseMove={(e) => {
          e.stopPropagation()
        }}
        onTouchStart={(e) => {
          e.stopPropagation()
        }}
        onTouchMove={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
      >
        <div
          className="result-header"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none' // タッチアクションを無効化
          }}
        >
          <h2>採点結果</h2>
        </div>

        <div
          className="result-content"
          onTouchStart={(e) => {
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
                  className={`problem-item ${
                    problem.isCorrect ? 'correct' : 'incorrect'
                  }`}
                >
                  <div className="problem-header">
                    <span className="result-icon">
                      {problem.isCorrect ? '⭕' : '❌'}
                    </span>
                    <h3>
                      {problem.problemNumber || `問題 ${index + 1}`}
                    </h3>
                  </div>

                  {problem.problemText && (
                    <div className="problem-text">
                      {problem.problemText}
                    </div>
                  )}

                  {problem.studentAnswer && (
                    <div className="student-answer">
                      <strong>あなたの解答:</strong> {problem.studentAnswer}
                    </div>
                  )}

                  {!problem.isCorrect && problem.correctAnswer && (
                    <div className="correct-answer">
                      <strong>正しい解答:</strong> {problem.correctAnswer}
                    </div>
                  )}

                  {problem.feedback && (
                    <div className="feedback">
                      <strong>フィードバック:</strong>
                      <p>{problem.feedback}</p>
                    </div>
                  )}

                  {problem.explanation && (
                    <div className="explanation">
                      <strong>解説:</strong>
                      <p>{problem.explanation}</p>
                    </div>
                  )}
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
              <h3>全体コメント</h3>
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
              📱 SNSを見る
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
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

export default GradingResult
