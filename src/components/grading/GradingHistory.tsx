import { useEffect, useState } from 'react'
import { GradingHistoryRecord, getAllGradingHistory, deleteGradingHistory, SNSUsageHistoryRecord, getSNSUsageHistory } from '../../utils/indexedDB'
import './GradingHistory.css'

interface GradingHistoryProps {
  onClose: () => void
  onSelectHistory?: (history: GradingHistoryRecord) => void
}

const GradingHistory = ({ onClose, onSelectHistory }: GradingHistoryProps) => {
  const [activeTab, setActiveTab] = useState<'grading' | 'sns'>('grading')
  const [historyList, setHistoryList] = useState<GradingHistoryRecord[]>([])
  const [snsHistoryList, setSnsHistoryList] = useState<SNSUsageHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedHistory, setSelectedHistory] = useState<GradingHistoryRecord | null>(null)
  const [filterCorrect, setFilterCorrect] = useState<'all' | 'correct' | 'incorrect'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // 履歴を読み込む
  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const records = await getAllGradingHistory()
      setHistoryList(records)
      const snsRecords = await getSNSUsageHistory()
      setSnsHistoryList(snsRecords)
    } catch (error) {
      console.error('履歴の読み込みに失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  // 履歴を削除
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('この履歴を削除しますか？')) return

    try {
      await deleteGradingHistory(id)
      await loadHistory()
      if (selectedHistory?.id === id) {
        setSelectedHistory(null)
      }
    } catch (error) {
      console.error('履歴の削除に失敗:', error)
      alert('履歴の削除に失敗しました')
    }
  }

  // フィルタリングされた履歴
  const filteredHistory = historyList.filter(record => {
    // 正解/不正解フィルター
    if (filterCorrect === 'correct' && !record.isCorrect) return false
    if (filterCorrect === 'incorrect' && record.isCorrect) return false

    // 検索クエリフィルター
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        record.pdfFileName.toLowerCase().includes(query) ||
        record.problemNumber.toLowerCase().includes(query) ||
        record.studentAnswer.toLowerCase().includes(query)
      )
    }

    return true
  })

  // 統計情報を計算
  const totalCount = historyList.length
  const correctCount = historyList.filter(r => r.isCorrect).length
  const incorrectCount = totalCount - correctCount
  const correctRate = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0

  // 日付をフォーマット
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="grading-history-overlay">
      <div className="grading-history-panel">
        <div className="history-header">
          <h2>History</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* タブ */}
        <div className="history-tabs">
          <button
            className={`tab-button ${activeTab === 'grading' ? 'active' : ''}`}
            onClick={() => setActiveTab('grading')}
          >
            採点履歴
          </button>
          <button
            className={`tab-button ${activeTab === 'sns' ? 'active' : ''}`}
            onClick={() => setActiveTab('sns')}
          >
            SNS利用履歴
          </button>
        </div>

        {activeTab === 'grading' && (
          <>
        {/* 統計情報 */}
        <div className="history-stats">
          <div className="stat-item">
            <span className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="result-badge correct" style={{ width: '20px', height: '20px', fontSize: '12px' }}>✓</span>
                {correctCount}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="result-badge incorrect" style={{ width: '20px', height: '20px', fontSize: '12px' }}>✗</span>
                {incorrectCount}
              </span>
              <span>Total: {totalCount}</span>
              <span>Rate: {correctRate}%</span>
            </span>
          </div>
        </div>

        {/* フィルターと検索 */}
        <div className="history-filters">
          <div className="filter-buttons">
            <button
              className={filterCorrect === 'all' ? 'active' : ''}
              onClick={() => setFilterCorrect('all')}
              title="すべて表示"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px' }}
            >
              <span className="result-badge correct" style={{ width: '20px', height: '20px', fontSize: '12px' }}>✓</span>
              <span className="result-badge incorrect" style={{ width: '20px', height: '20px', fontSize: '12px' }}>✗</span>
            </button>
            <button
              className={filterCorrect === 'correct' ? 'active' : ''}
              onClick={() => setFilterCorrect('correct')}
              title="正解のみ"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px' }}
            >
              <span className="result-badge correct" style={{ width: '20px', height: '20px', fontSize: '12px' }}>✓</span>
            </button>
            <button
              className={filterCorrect === 'incorrect' ? 'active' : ''}
              onClick={() => setFilterCorrect('incorrect')}
              title="不正解のみ"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px' }}
            >
              <span className="result-badge incorrect" style={{ width: '20px', height: '20px', fontSize: '12px' }}>✗</span>
            </button>
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="問題集名、問題番号で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* 履歴リスト */}
        <div className="history-content">
          {loading ? (
            <div className="loading">読み込み中...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="empty-message">
              {searchQuery || filterCorrect !== 'all'
                ? '条件に一致する履歴がありません'
                : 'まだ採点履歴がありません'}
            </div>
          ) : (
            <div className="history-list">
              {filteredHistory.map((record) => (
                <div
                  key={record.id}
                  className={`history-item ${record.isCorrect ? 'correct' : 'incorrect'} ${
                    selectedHistory?.id === record.id ? 'selected' : ''
                  }`}
                  onClick={() => setSelectedHistory(record)}
                >
                  <div className="history-item-header">
                    <span className={`result-badge ${record.isCorrect ? 'correct' : 'incorrect'}`}>
                      {record.isCorrect ? '✓' : '✗'}
                    </span>
                    <span className="problem-info">
                      {record.pdfFileName} - ページ{record.pageNumber} - 問{record.problemNumber}
                    </span>
                    <button
                      className="delete-btn"
                      onClick={(e) => handleDelete(record.id, e)}
                      title="削除"
                    >
                      🗑️
                    </button>
                  </div>
                  <div className="history-item-content">
                    <div className="timestamp">{formatDate(record.timestamp)}</div>
                    <div className="answer-preview">
                      解答: {record.studentAnswer?.substring(0, 50) || '(なし)'}
                      {(record.studentAnswer?.length || 0) > 50 ? '...' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 詳細パネル */}
        {selectedHistory && (
          <div className="history-detail">
            <div className="detail-header">
              <h3>詳細情報</h3>
              <button className="close-detail-btn" onClick={() => setSelectedHistory(null)}>
                ✕
              </button>
            </div>
            <div className="detail-content">
              <div className="detail-section">
                <h4>問題情報</h4>
                <p><strong>問題集:</strong> {selectedHistory.pdfFileName}</p>
                <p><strong>ページ:</strong> {selectedHistory.pageNumber}</p>
                <p><strong>問題番号:</strong> {selectedHistory.problemNumber}</p>
                <p><strong>実施日時:</strong> {formatDate(selectedHistory.timestamp)}</p>
              </div>

              <div className="detail-section">
                <h4>解答</h4>
                <div className={`result-indicator ${selectedHistory.isCorrect ? 'correct' : 'incorrect'}`}>
                  {selectedHistory.isCorrect ? '✓ 正解' : '✗ 不正解'}
                </div>
                <p><strong>あなたの解答:</strong></p>
                <div className="answer-box">{selectedHistory.studentAnswer}</div>
              </div>

              {!selectedHistory.isCorrect && (
                <div className="detail-section">
                  <h4>正しい解答</h4>
                  <div className="answer-box">{selectedHistory.correctAnswer}</div>
                </div>
              )}

              <div className="detail-section">
                <h4>フィードバック</h4>
                <div className="feedback-box">{selectedHistory.feedback}</div>
              </div>

              <div className="detail-section">
                <h4>解説</h4>
                <div className="explanation-box">{selectedHistory.explanation}</div>
              </div>

              {selectedHistory.imageData && (
                <div className="detail-section">
                  <h4>採点時の画像</h4>
                  <img
                    src={selectedHistory.imageData}
                    alt="採点時の画像"
                    className="grading-image"
                  />
                </div>
              )}
            </div>
          </div>
        )}

          </>
        )}

        {activeTab === 'sns' && (
          <div className="sns-history-content">
            {loading ? (
              <div className="loading">読み込み中...</div>
            ) : snsHistoryList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📱</div>
                <p>SNS利用履歴がありません</p>
              </div>
            ) : (
              <div className="sns-history-list">
                {snsHistoryList.map((record) => (
                  <div key={record.id} className="sns-history-item">
                    <div className="sns-history-main">
                      <div className="sns-name">{record.snsName}</div>
                      <div className="sns-timestamp">{formatDate(record.timestamp)}</div>
                    </div>
                    <div className="sns-history-details">
                      <div className="sns-detail-item">
                        <span className="sns-detail-label">制限時間:</span>
                        <span className="sns-detail-value">{record.timeLimitMinutes}分</span>
                      </div>
                      <div className="sns-detail-item">
                        <span className="sns-detail-label">URL:</span>
                        <span className="sns-detail-value sns-url">{record.snsUrl}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="history-footer">
          <button className="close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default GradingHistory
