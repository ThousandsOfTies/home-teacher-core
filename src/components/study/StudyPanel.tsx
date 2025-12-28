import { useEffect, useRef, useState, useCallback } from 'react'
import { GradingResult as GradingResultType, GradingResponseResult, getAvailableModels, ModelInfo } from '../../services/api'
import GradingResult from './GradingResult'
import { savePDFRecord, getPDFRecord, updatePDFRecord, getAllSNSLinks, SNSLinkRecord, PDFFileRecord, saveGradingHistory, getGradingHistoryByPdfId, generateGradingHistoryId, getAppSettings, saveAppSettings, saveDrawing, saveTextAnnotation } from '../../utils/indexedDB'
import { ICON_SVG } from '../../constants/icons'
import { DrawingPath } from '@thousands-of-ties/drawing-common'
import PDFCanvas from './components/PDFCanvas'
import { PDFPane, PDFPaneHandle } from './PDFPane'
import { usePDFRenderer } from '../../hooks/pdf/usePDFRenderer'
import './StudyPanel.css'

// テキストアノテーションの型定義
export type TextDirection = 'horizontal' | 'vertical-rl' | 'vertical-lr'
export interface TextAnnotation {
  id: string
  x: number // 正規化座標 (0-1)
  y: number // 正規化座標 (0-1)
  text: string
  fontSize: number // ピクセル
  color: string
  direction: TextDirection
}

const compressImage = (canvas: HTMLCanvasElement, maxSize: number = 1024): string => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (canvas.width <= maxSize && canvas.height <= maxSize) {
    return canvas.toDataURL('image/jpeg', isIOS ? 0.7 : 0.8)
  }
  const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height)
  const targetWidth = Math.floor(canvas.width * scale)
  const targetHeight = Math.floor(canvas.height * scale)
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = targetWidth
  tempCanvas.height = targetHeight
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) {
    throw new Error('Canvas context creation failed')
  }
  tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight)
  return tempCanvas.toDataURL('image/jpeg', isIOS ? 0.7 : 0.8)
}

interface StudyPanelProps {
  pdfRecord: PDFFileRecord
  pdfId: string
  onBack?: () => void
}

const StudyPanel = ({ pdfRecord, pdfId, onBack }: StudyPanelProps) => {
  // Refs
  const paneARef = useRef<PDFPaneHandle>(null)
  const paneBRef = useRef<PDFPaneHandle>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Global Selection State
  const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null)
  const isSelectingRef = useRef(false)
  const selectionStartRef = useRef<{ x: number, y: number } | null>(null)

  const handleSelectionStart = (e: React.MouseEvent) => {
    // Only left click
    if (e.button !== 0) return

    // Get relative position within the container
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    isSelectingRef.current = true
    selectionStartRef.current = { x, y }
    setSelectionRect({ x, y, width: 0, height: 0 })
  }

  const handleSelectionMove = (e: React.MouseEvent) => {
    if (!isSelectingRef.current || !selectionStartRef.current || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const startX = selectionStartRef.current.x
    const startY = selectionStartRef.current.y

    setSelectionRect({
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      width: Math.abs(x - startX),
      height: Math.abs(y - startY)
    })
  }

  /* 共通: オーバーレイでピンチズームを直接処理 */
  const overlayGestureRef = useRef<{
    type: 'selection' | 'pinch'
    targetPane: 'A' | 'B'
    startZoom: number
    startPan: { x: number, y: number }
    startDist: number
    startCenter: { x: number, y: number }
  } | null>(null)

  // タッチ位置からターゲットペインを判定
  const getTargetPane = (touchX: number): 'A' | 'B' => {
    // 非スプリットビューでは現在表示中のタブが対象
    if (!isSplitView) return activeTab

    // スプリットコンテナ内でのX位置を確認
    const splitContainer = splitContainerRef.current
    if (!splitContainer) return activeTab

    const containerRect = splitContainer.getBoundingClientRect()
    const relativeX = touchX - containerRect.left
    const splitPoint = containerRect.width * splitRatio

    return relativeX < splitPoint ? 'A' : 'B'
  }

  const getTargetPaneRef = (pane: 'A' | 'B') => {
    return pane === 'A' ? paneARef : paneBRef
  }

  const handleOverlayTouchStart = (e: React.TouchEvent, onSingleTouch?: (x: number, y: number) => void) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    if (e.touches.length >= 2) {
      // 2本指: ピンチズーム開始
      e.preventDefault()
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
      const center = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      }

      // タッチ中心からターゲットペインを判定
      const targetPane = getTargetPane(center.x)
      const paneRef = getTargetPaneRef(targetPane)

      // 現在のズーム/パン状態を取得
      const currentZoom = paneRef.current?.getZoom() ?? 1
      const currentPan = paneRef.current?.getPanOffset() ?? { x: 0, y: 0 }

      overlayGestureRef.current = {
        type: 'pinch',
        targetPane,
        startZoom: currentZoom,
        startPan: { ...currentPan },
        startDist: dist,
        startCenter: center
      }

      // 選択をキャンセル
      isSelectingRef.current = false
      selectionStartRef.current = null
      return
    }

    if (e.touches.length !== 1) return

    // 1本指: 選択開始 or カスタム処理
    overlayGestureRef.current = null
    if (onSingleTouch) {
      const x = e.touches[0].clientX - rect.left
      const y = e.touches[0].clientY - rect.top
      onSingleTouch(x, y)
    }
  }

  const handleOverlayTouchMove = (e: React.TouchEvent, onSingleTouchMove?: (x: number, y: number) => void) => {
    if (e.touches.length >= 2 && overlayGestureRef.current?.type === 'pinch') {
      // ピンチズーム処理
      e.preventDefault()
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
      const center = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      }

      const { targetPane, startZoom, startPan, startDist, startCenter } = overlayGestureRef.current
      const paneRef = getTargetPaneRef(targetPane)
      const paneRect = paneRef.current?.getContainerRect()
      if (!paneRect) return

      // 新しいズームレベルを計算
      const scale = dist / startDist
      const newZoom = Math.min(Math.max(startZoom * scale, 0.1), 5.0)

      // ピンチ中心を基準にパン調整
      const startCenterRelX = startCenter.x - paneRect.left
      const startCenterRelY = startCenter.y - paneRect.top
      const contentX = (startCenterRelX - startPan.x) / startZoom
      const contentY = (startCenterRelY - startPan.y) / startZoom
      const centerRelX = center.x - paneRect.left
      const centerRelY = center.y - paneRect.top
      const newPanX = centerRelX - (contentX * newZoom)
      const newPanY = centerRelY - (contentY * newZoom)

      // 対象のPDFPaneに適用
      paneRef.current?.setZoomValue(newZoom)
      paneRef.current?.setPanOffsetValue({ x: newPanX, y: newPanY })
      return
    }

    if (e.touches.length === 1 && onSingleTouchMove) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = e.touches[0].clientX - rect.left
      const y = e.touches[0].clientY - rect.top
      onSingleTouchMove(x, y)
    }
  }

  const handleOverlayTouchEnd = (e: React.TouchEvent, onTouchEnd?: () => void) => {
    if (e.touches.length === 0) {
      overlayGestureRef.current = null
      if (onTouchEnd) onTouchEnd()
    }
  }

  /* Selection Mode Touch Handlers */
  const handleTouchSelectionStart = (e: React.TouchEvent) => {
    handleOverlayTouchStart(e, (x, y) => {
      isSelectingRef.current = true
      selectionStartRef.current = { x, y }
      setSelectionRect({ x, y, width: 0, height: 0 })
    })
  }

  const handleTouchSelectionMove = (e: React.TouchEvent) => {
    handleOverlayTouchMove(e, (x, y) => {
      if (!isSelectingRef.current || !selectionStartRef.current) return
      const startX = selectionStartRef.current.x
      const startY = selectionStartRef.current.y
      setSelectionRect({
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        width: Math.abs(x - startX),
        height: Math.abs(y - startY)
      })
    })
  }

  const handleTouchSelectionEnd = async (e: React.TouchEvent) => {
    handleOverlayTouchEnd(e, async () => {
      if (!isSelectingRef.current) return
      await handleSelectionEnd()
    })
  }

  const handleSelectionEnd = async () => {
    if (!isSelectingRef.current || !selectionRect) return

    isSelectingRef.current = false

    // Check if selection is large enough
    if (selectionRect.width < 10 || selectionRect.height < 10) {
      setSelectionRect(null)
      return
    }

    // Capture Image Logic (Stitching)
    try {
      const capturedImage = await captureSelectionArea(selectionRect)
      if (capturedImage) {
        setSelectionPreview(capturedImage)
      } else {
        addStatusMessage("❌ 画像のキャプチャに失敗しました")
        setSelectionRect(null)
      }
    } catch (error) {
      console.error("Capture error:", error)
      addStatusMessage("❌ エラーが発生しました")
      setSelectionRect(null)
    }
  }

  const captureSelectionArea = async (rect: { x: number, y: number, width: number, height: number }) => {
    if (!containerRef.current) return null

    // Create a temporary canvas to draw the result
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = rect.width
    tempCanvas.height = rect.height
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null

    // ペインからキャプチャするヘルパー
    const captureFromPane = (paneRef: React.RefObject<PDFPaneHandle>, paneClassName: string) => {
      const paneEl = containerRef.current?.querySelector(`.${paneClassName}`)
      const compositeCanvas = paneRef.current?.getCanvas()
      const visibleCanvas = paneEl?.querySelector('.pdf-canvas') as HTMLCanvasElement | null

      if (!paneEl || !compositeCanvas || !visibleCanvas) return

      const paneRect = paneEl.getBoundingClientRect()
      const containerRect = containerRef.current!.getBoundingClientRect()
      const canvasRect = visibleCanvas.getBoundingClientRect()

      const selectionScreenX = containerRect.left + rect.x
      const selectionScreenY = containerRect.top + rect.y
      const selectionScreenW = rect.width
      const selectionScreenH = rect.height

      const intersectX = Math.max(selectionScreenX, canvasRect.left)
      const intersectY = Math.max(selectionScreenY, canvasRect.top)
      const intersectW = Math.min(selectionScreenX + selectionScreenW, canvasRect.right) - intersectX
      const intersectH = Math.min(selectionScreenY + selectionScreenH, canvasRect.bottom) - intersectY

      if (intersectW <= 0 || intersectH <= 0) return

      const scaleX = compositeCanvas.width / canvasRect.width
      const scaleY = compositeCanvas.height / canvasRect.height

      const sx = (intersectX - canvasRect.left) * scaleX
      const sy = (intersectY - canvasRect.top) * scaleY
      const sw = intersectW * scaleX
      const sh = intersectH * scaleY

      const dx = intersectX - selectionScreenX
      const dy = intersectY - selectionScreenY

      ctx.drawImage(compositeCanvas, sx, sy, sw, sh, dx, dy, intersectW, intersectH)
    }

    if (activeTab === 'A' || isSplitView) {
      captureFromPane(paneARef, 'pane-a')
    }

    if (activeTab === 'B' || isSplitView) {
      captureFromPane(paneBRef, 'pane-b')
    }

    return tempCanvas.toDataURL('image/png')
  }

  // レイアウト状態
  const [isSplitView, setIsSplitView] = useState(false)
  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A')

  // スプリット比率（0.2 ~ 0.8、デフォルト0.5）
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('splitRatio')
    return saved ? parseFloat(saved) : 0.5
  })
  const [isResizing, setIsResizing] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  // ページ状態
  // 保存されたレコードから初期化
  const [pageA, setPageA] = useState(pdfRecord.lastPageNumberA || 1)
  const [pageB, setPageB] = useState(pdfRecord.lastPageNumberB || 1)

  // PDF Document Loading
  const { pdfDoc, numPages, isLoading, error: pdfError } = usePDFRenderer(pdfRecord, {
    onLoadSuccess: (pages) => {
      // console.log(`✅ PDF loaded in StudyPanel: ${pages} pages`)
    },
    onLoadError: (err) => {
      // Error handling if needed specifically here, though hook returns error
    }
  })

  // Status Handling
  const [statusMessage, setStatusMessage] = useState('')

  // Grading State
  const [isGrading, setIsGrading] = useState(false)
  const [gradingResult, setGradingResult] = useState<GradingResponseResult | null>(null)
  const [gradingError, setGradingError] = useState<string | null>(null)
  const [gradingModelName, setGradingModelName] = useState<string | null>(null)
  const [gradingResponseTime, setGradingResponseTime] = useState<number | null>(null)

  // AI Model State
  const [selectedModel, setSelectedModel] = useState<string>('default')
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [defaultModelName, setDefaultModelName] = useState<string>('Gemini 2.0 Flash')

  // Load available models from server
  useEffect(() => {
    getAvailableModels()
      .then(response => {
        if (response.models) {
          setAvailableModels(response.models.filter(m => m.id !== 'default'))
        }
        if (response.default) {
          setDefaultModelName(response.default)
        }
      })
      .catch(err => console.error('Failed to load models:', err))
  }, [])

  // Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  // selectionRect is already defined at the top
  const [selectionPreview, setSelectionPreview] = useState<string | null>(null)

  // Tool State
  const [isDrawingMode, setIsDrawingMode] = useState(true)
  const [isEraserMode, setIsEraserMode] = useState(false)
  const [isTextMode, setIsTextMode] = useState(false)
  const [penColor, setPenColor] = useState('#FF0000')
  const [penSize, setPenSize] = useState(3)
  const [showPenPopup, setShowPenPopup] = useState(false)
  const [eraserSize, setEraserSize] = useState(50)
  const [showEraserPopup, setShowEraserPopup] = useState(false)

  // テキスト入力の状態
  const [textFontSize, setTextFontSize] = useState(16)
  const [textDirection, setTextDirection] = useState<TextDirection>('horizontal')
  const [showTextPopup, setShowTextPopup] = useState(false)
  const [editingText, setEditingText] = useState<{
    pageNum: number
    x: number // 正規化座標
    y: number // 正規化座標
    screenX: number // スクリーン座標（入力ボックス位置用）
    screenY: number
    existingId?: string // 既存テキストの編集時のID
    initialText?: string // 既存テキストの初期値
  } | null>(null)
  const [textAnnotations, setTextAnnotations] = useState<Map<number, TextAnnotation[]>>(new Map())

  // SNS State
  const [snsLinks, setSnsLinks] = useState<SNSLinkRecord[]>([])
  const [snsTimeLimit, setSnsTimeLimit] = useState<number>(30)

  // 描画パスの状態
  const [drawingPaths, setDrawingPaths] = useState<Map<number, DrawingPath[]>>(new Map())

  // 描画パスの読み込み（PDF読み込み時）
  useEffect(() => {
    const loadDrawings = async () => {
      try {
        const record = await getPDFRecord(pdfId)
        if (!record?.drawings) return

        const newMap = new Map<number, DrawingPath[]>()
        for (const [pageStr, pathsJson] of Object.entries(record.drawings)) {
          const page = parseInt(pageStr, 10)
          const paths = JSON.parse(pathsJson as string) as DrawingPath[]
          if (paths.length > 0) {
            newMap.set(page, paths)
          }
        }

        if (newMap.size === 0) return

        // console.log(`📝 描画を復元: ${newMap.size}ページ`)
        setDrawingPaths(newMap)
      } catch (e) {
        // console.error('描画の読み込みに失敗:', e)
      }
    }
    loadDrawings()
  }, [pdfId])

  // テキストアノテーションの読み込み（PDF読み込み時）
  useEffect(() => {
    const loadTextAnnotations = async () => {
      try {
        const record = await getPDFRecord(pdfId)
        if (!record?.textAnnotations) return

        const newMap = new Map<number, TextAnnotation[]>()
        for (const [pageStr, annotationsJson] of Object.entries(record.textAnnotations)) {
          const page = parseInt(pageStr, 10)
          const annotations = JSON.parse(annotationsJson as string) as TextAnnotation[]
          if (annotations.length > 0) {
            newMap.set(page, annotations)
          }
        }

        if (newMap.size === 0) return

        // console.log(`📝 テキストを復元: ${newMap.size}ページ`)
        setTextAnnotations(newMap)
      } catch (e) {
        // console.error('テキストの読み込みに失敗:', e)
      }
    }
    loadTextAnnotations()
  }, [pdfId])

  // パス追加ハンドラ
  const handlePathAdd = (page: number, newPath: DrawingPath) => {
    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      const currentPaths = newMap.get(page) || []
      const newPaths = [...currentPaths, newPath]
      newMap.set(page, newPaths)

      // Save to DB
      saveDrawing(pdfId, page, JSON.stringify(newPaths))

      return newMap
    })
  }

  // Ctrl Key Tracking
  const [isCtrlPressed, setIsCtrlPressed] = useState(false)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setIsCtrlPressed(true)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setIsCtrlPressed(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // パス変更ハンドラ（Undo/Redo/Eraserなど）
  const handlePathsChange = (page: number, newPaths: DrawingPath[]) => {
    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      if (newPaths.length === 0) {
        newMap.delete(page)
      } else {
        newMap.set(page, newPaths)
      }
      return newMap
    })
    saveDrawing(pdfId, page, JSON.stringify(newPaths))
  }

  // 採点確定ハンドラ
  const confirmAndGrade = async () => {
    if (!selectionRect || !selectionPreview) return

    setIsGrading(true)
    setGradingError(null)

    try {
      // 切り抜き画像のみ使用（簡素化）
      const croppedImageData = selectionPreview

      // Validate image size (minimum 50x50)
      const img = new Image()
      img.src = croppedImageData
      await new Promise((resolve, reject) => {
        img.onload = () => {
          if (img.width < 50 || img.height < 50) {
            setGradingError('選択範囲が小さすぎます。もう少し大きく選択してください。')
            setIsGrading(false)
            reject(new Error('Image too small'))
          } else {
            resolve(undefined)
          }
        }
        img.onerror = () => {
          setGradingError('画像の読み込みに失敗しました。')
          setIsGrading(false)
          reject(new Error('Image load error'))
        }
      })

      // APIに送信（簡素化：切り抜き画像のみ）
      addStatusMessage('🎯 AI採点中...')
      const { gradeWork } = await import('../../services/api')
      const response = await gradeWork(
        croppedImageData,
        selectedModel !== 'default' ? selectedModel : undefined
      )

      if (!response.success) {
        setGradingError(response.error || "採点に失敗しました")
        throw new Error(response.error || "採点に失敗しました")
      }

      setGradingError(null)

      // Flatten problems if they have nested numeric keys (fallback for non-normalized server response)
      let problems = response.result.problems
      if (problems.length === 1 && Object.keys(problems[0]).some(k => /^\d+$/.test(k))) {
        const nested = problems[0]
        const numericKeys = Object.keys(nested).filter(k => /^\d+$/.test(k))
        problems = numericKeys.map(k => nested[k])
      }

      setGradingResult({ ...response.result, problems })
      addStatusMessage(`✅ 採点完了 (${problems.length}問)`)

      // 採点履歴を保存
      if (response.result.problems?.length) {
        for (const problem of response.result.problems) {
          const historyRecord = {
            id: generateGradingHistoryId(),
            pdfId,
            pdfFileName: pdfRecord.fileName,
            pageNumber: pageA,
            problemNumber: problem.problemNumber,
            studentAnswer: problem.studentAnswer,
            isCorrect: problem.isCorrect || false,
            correctAnswer: problem.correctAnswer || '',
            feedback: problem.feedback || '',
            explanation: problem.explanation || '',
            timestamp: Date.now(),
            imageData: croppedImageData,
            matchingMetadata: problem.matchingMetadata
          }
          await saveGradingHistory(historyRecord)
        }
      }

    } catch (e) {
      console.error(e)
      setGradingError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsGrading(false)
      setSelectionPreview(null)
      setSelectionRect(null)
    }
  }

  const cancelPreview = () => {
    setSelectionPreview(null)
    // Do not clear Rect so user can adjust? 
    // Actually PDFPane handles selection clearing usually.
    // But we can reset here.
  }

  // 描画モードの切り替え
  const toggleDrawingMode = () => {
    if (isDrawingMode) {
      setShowPenPopup(!showPenPopup)
    } else {
      setIsDrawingMode(true)
      setIsEraserMode(false)
      setIsTextMode(false)
      setIsSelectionMode(false)
      setSelectionRect(null)
      setShowPenPopup(false)
      setShowEraserPopup(false)
      setShowTextPopup(false)
      addStatusMessage('✏️ ペンモード')
    }
  }

  // 消しゴムモードの切り替え
  const toggleEraserMode = () => {
    if (isEraserMode) {
      setShowEraserPopup(!showEraserPopup)
    } else {
      setIsEraserMode(true)
      setIsDrawingMode(false)
      setIsTextMode(false)
      setIsSelectionMode(false)
      setSelectionRect(null)
      setShowEraserPopup(false)
      setShowPenPopup(false)
      setShowTextPopup(false)
      addStatusMessage('🧹 消しゴムモード')
    }
  }

  // クリア機能（現在のページのみ）
  const clearDrawing = () => {
    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      newMap.delete(pageA)
      return newMap
    })
    saveDrawing(pdfId, pageA, JSON.stringify([]))
    addStatusMessage('描画をクリアしました')
  }

  // すべてのページの描画をクリア
  const clearAllDrawings = async () => {
    if (!confirm('すべてのページのペン跡を削除しますか？この操作は取り消せません。')) {
      return
    }

    setDrawingPaths(new Map())
    // IndexedDBからも削除
    try {
      const record = await getPDFRecord(pdfId)
      if (record) {
        record.drawings = {}
        await savePDFRecord(record)
        addStatusMessage('🗑️ すべてのペン跡を削除しました')
      }
    } catch (error) {
      console.error('ペン跡の削除に失敗:', error)
      addStatusMessage('❌ ペン跡の削除に失敗しました')
    }
  }

  // 採点開始（範囲選択モードに切り替え）
  const startGrading = () => {
    addStatusMessage('📱 採点モード開始')
    setIsSelectionMode(true)
    setIsDrawingMode(false)
    setIsEraserMode(false)
    setIsTextMode(false)
    setShowPenPopup(false)
    setShowEraserPopup(false)
    setShowTextPopup(false)
    setSelectionRect(null)
    addStatusMessage('📐 採点範囲を選択してください')
  }

  // テキストモードのトグル
  // 1回目クリック: モード切替のみ
  // 2回目クリック（既にテキストモード中）: 詳細設定ポップアップ表示
  const toggleTextMode = () => {
    if (isTextMode) {
      // 既にテキストモードなら詳細設定ポップアップをトグル
      setShowTextPopup(prev => !prev)
    } else {
      // モードをオンにする
      setIsTextMode(true)
      setIsDrawingMode(false)
      setIsEraserMode(false)
      setIsSelectionMode(false)
      setShowPenPopup(false)
      setShowEraserPopup(false)
      setShowTextPopup(false) // 最初はポップアップを表示しない
    }
  }

  // テキスト追加のハンドラ（PDFPaneからのクリックイベント用）
  const handleTextClick = (pageNum: number, normalizedX: number, normalizedY: number, screenX: number, screenY: number) => {
    if (!isTextMode) return
    setEditingText({
      pageNum,
      x: normalizedX,
      y: normalizedY,
      screenX,
      screenY
    })
  }

  // テキスト確定（編集・新規追加・削除を統合）
  const confirmText = (text: string) => {
    if (!editingText) return

    const trimmedText = text.trim()
    const finish = () => setEditingText(null)

    // 1. 既存テキストの削除（空文字になった場合）
    if (editingText.existingId && trimmedText === '') {
      deleteTextAnnotation(editingText.pageNum, editingText.existingId)
      finish()
      return
    }

    // 2. 既存テキストの更新
    if (editingText.existingId) {
      setTextAnnotations(prev => {
        const newMap = new Map(prev)
        const current = newMap.get(editingText.pageNum) || []
        const updated = current.map(a =>
          a.id === editingText.existingId
            ? { ...a, text: trimmedText }
            : a
        )
        newMap.set(editingText.pageNum, updated)

        // Save to IndexedDB
        saveTextAnnotation(pdfId, editingText.pageNum, JSON.stringify(updated))

        return newMap
      })
      addStatusMessage('📝 テキストを更新しました')
      finish()
      return
    }

    // 3. 新規テキストが空の場合（キャンセル扱い）
    if (trimmedText === '') {
      finish()
      return
    }

    // 4. 新規テキストの追加
    const newAnnotation: TextAnnotation = {
      id: `text-${Date.now()}`,
      x: editingText.x,
      y: editingText.y,
      text: trimmedText,
      fontSize: textFontSize,
      color: penColor,
      direction: textDirection
    }

    setTextAnnotations(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(editingText.pageNum) || []
      const updatedAnnotations = [...current, newAnnotation]
      newMap.set(editingText.pageNum, updatedAnnotations)

      // Save to IndexedDB
      saveTextAnnotation(pdfId, editingText.pageNum, JSON.stringify(updatedAnnotations))

      return newMap
    })
    addStatusMessage('📝 テキストを追加しました')
    finish()
  }

  // テキスト削除
  const deleteTextAnnotation = (pageNum: number, annotationId: string) => {
    setTextAnnotations(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(pageNum) || []
      const filtered = current.filter(a => a.id !== annotationId)
      if (filtered.length === 0) {
        newMap.delete(pageNum)
      } else {
        newMap.set(pageNum, filtered)
      }

      // Save to IndexedDB (empty array to clear or filtered list)
      saveTextAnnotation(pdfId, pageNum, JSON.stringify(filtered))

      return newMap
    })
    addStatusMessage('🗑️ テキストを削除しました')
  }

  // ステータスメッセージ
  const addStatusMessage = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('ja-JP')
    const fullMessage = `[${timestamp}] ${message}`
    // console.log(fullMessage)
    setStatusMessage(message)
  }

  // 分割表示の切り替え / A面B面の入れ替え
  const toggleSplitView = () => {
    if (isSplitView) {
      // 既にスプリット表示中ならA面とB面を入れ替え
      const tempA = pageA
      setPageA(pageB)
      setPageB(tempA)
    } else {
      // スプリット表示をオンにする
      setIsSplitView(true)
    }
  }

  // ページ変更ハンドラ
  const handlePageAChange = (p: number) => {
    if (p < 1 || p > numPages) return
    setPageA(p)
  }
  const handlePageBChange = (p: number) => {
    if (p < 1 || p > numPages) return
    setPageB(p)
  }

  // ページ番号の永続化（デバウンス付き）
  useEffect(() => {
    const timer = setTimeout(() => {
      const updates: Partial<{ lastPageNumberA: number; lastPageNumberB: number }> = {}

      if (pageA > 0 && pageA !== pdfRecord.lastPageNumberA) {
        updates.lastPageNumberA = pageA
      }
      if (pageB > 0 && pageB !== pdfRecord.lastPageNumberB) {
        updates.lastPageNumberB = pageB
      }

      if (Object.keys(updates).length > 0) {
        // console.log('💾 ページ番号を保存:', updates)
        updatePDFRecord(pdfRecord.id, updates).catch(err => {
          // console.error('ページ保存に失敗:', err)
        })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [pageA, pageB, pdfRecord.id, pdfRecord.lastPageNumberA, pdfRecord.lastPageNumberB])

  // 矩形選択モードをキャンセル
  const handleCancelSelection = () => {
    // setIsSelectionMode(false) // ユーザー要望によりモードを維持
    setSelectionRect(null)
    setSelectionPreview(null)
    addStatusMessage('選択をクリアしました。再度範囲を選択してください')
  }

  // リサイズハンドラ
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    // preventDefault to stop scrolling while resizing
    // e.preventDefault() // React SyntheticEvent might be passive by default in some versions, check handling
    setIsResizing(true)
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMove = (clientX: number) => {
      if (!splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const newRatio = (clientX - rect.left) / rect.width
      const clampedRatio = Math.max(0.2, Math.min(0.8, newRatio))
      setSplitRatio(clampedRatio)
    }

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      handleMove(e.clientX)
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault() // Prevent scrolling
      handleMove(e.touches[0].clientX)
    }

    const handleEnd = (clientX: number) => {
      if (!splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const finalRatio = (clientX - rect.left) / rect.width
      const clampedRatio = Math.max(0.2, Math.min(0.8, finalRatio))
      localStorage.setItem('splitRatio', clampedRatio.toString())
      setIsResizing(false)
    }

    const handleMouseUp = (e: MouseEvent) => handleEnd(e.clientX)
    const handleTouchEnd = (e: TouchEvent) => handleEnd(e.changedTouches[0].clientX)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isResizing])

  // Ctrl+Z Undo - アクティブなページの最後の描画を削除
  const handleUndo = () => {
    const activePage = activeTab === 'A' ? pageA : pageB
    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      const currentPaths = newMap.get(activePage) || []
      if (currentPaths.length > 0) {
        const newPaths = currentPaths.slice(0, -1)
        newMap.set(activePage, newPaths)
        // Save to DB
        saveDrawing(pdfId, activePage, JSON.stringify(newPaths))
      }
      return newMap
    })
  }

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-viewer">
        <div className="toolbar">
          {/* 戻るボタン */}
          {onBack && (
            <>
              <button onClick={onBack} title="ホームに戻る">
                🏠
              </button>

              <div className="divider"></div>

              {/* Split View Toggle */}
              <button
                onClick={toggleSplitView}
                title={isSplitView ? 'シングルビューに戻す' : '2画面表示 (Split View)'}
                className={isSplitView ? 'active' : ''}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="4" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1" fill={isSplitView ? "white" : "none"} />
                  <rect x="13" y="4" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1" fill={isSplitView ? "white" : "none"} />
                </svg>
              </button>

              {/* Tab Switcher Button */}
              <button
                className={`tab-switcher-btn ${!isSplitView ? 'active' : ''}`}
                onClick={() => {
                  if (isSplitView) {
                    setIsSplitView(false)
                  } else {
                    setActiveTab(prev => prev === 'A' ? 'B' : 'A')
                  }
                }}
                title={isSplitView ? "シングルビューへ切替" : "A/B 切替"}
                style={{
                  padding: '12px 8px', // Increased vertical padding to match height of buttons with larger text
                  minWidth: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {/* A Indicator */}
                <span
                  style={{
                    fontWeight: activeTab === 'A' ? 'bold' : 'normal',
                    textDecoration: activeTab === 'A' ? 'underline' : 'none',
                    color: activeTab === 'A' ? '#4CAF50' : 'inherit',
                    fontSize: '0.85rem' // Reduced from 1rem
                  }}
                >
                  A
                </span>

                <span style={{ margin: '0 2px', color: '#ccc', fontSize: '0.85rem' }}>/</span>

                {/* B Indicator */}
                <span
                  style={{
                    fontWeight: activeTab === 'B' ? 'bold' : 'normal',
                    textDecoration: activeTab === 'B' ? 'underline' : 'none',
                    color: activeTab === 'B' ? '#4CAF50' : 'inherit',
                    fontSize: '0.85rem' // Reduced from 1rem
                  }}
                >
                  B
                </span>
              </button>

              <div className="divider"></div>
            </>
          )}

          {/* 右寄せコンテナ */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <>
              <div className="divider"></div>

              {/* 採点ボタン */}
              <button
                onClick={isSelectionMode ? handleCancelSelection : startGrading}
                className={isSelectionMode ? 'active' : ''}
                disabled={isGrading}
                title={isSelectionMode ? 'キャンセル' : '範囲を選択して採点'}
              >
                {isGrading ? '⏳' : '✅'}
              </button>

              {/* テキスト入力ツール */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={toggleTextMode}
                  className={isTextMode ? 'active' : ''}
                  title={isTextMode ? 'テキストモード ON' : 'テキストモード OFF'}
                  style={{ fontFamily: 'Times New Roman, serif', fontSize: '1.4rem' }}
                >
                  T
                </button>

                {/* テキスト設定ポップアップ */}
                {showTextPopup && (
                  <div className="tool-popup" style={{ minWidth: '180px' }}>
                    <div className="popup-row">
                      <label>サイズ:</label>
                      <input
                        type="range"
                        min="10"
                        max="32"
                        value={textFontSize}
                        onChange={(e) => setTextFontSize(Number(e.target.value))}
                        style={{ width: '80px' }}
                      />
                      <span>{textFontSize}px</span>
                    </div>
                    <div className="popup-row">
                      <label>方向:</label>
                      <select
                        value={textDirection}
                        onChange={(e) => setTextDirection(e.target.value as TextDirection)}
                        style={{ padding: '4px', borderRadius: '4px' }}
                      >
                        <option value="horizontal">横書き (Z型)</option>
                        <option value="vertical-rl">縦書き右始 (N型)</option>
                        <option value="vertical-lr">縦書き左始</option>
                      </select>
                    </div>
                    <div className="popup-row">
                      <label>色:</label>
                      <input
                        type="color"
                        value={penColor}
                        onChange={(e) => setPenColor(e.target.value)}
                        style={{ width: '40px', height: '30px', border: '1px solid #ccc', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 描画ツール */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={toggleDrawingMode}
                  className={isDrawingMode ? 'active' : ''}
                  title={isDrawingMode ? 'ペンモード ON' : 'ペンモード OFF'}
                >
                  {ICON_SVG.pen(isDrawingMode, penColor)}
                </button>

                {/* ペン設定ポップアップ */}
                {showPenPopup && (
                  <div className="tool-popup">
                    <div className="popup-row">
                      <label>色:</label>
                      <input
                        type="color"
                        value={penColor}
                        onChange={(e) => setPenColor(e.target.value)}
                        style={{ width: '40px', height: '30px', border: '1px solid #ccc', cursor: 'pointer' }}
                      />
                    </div>
                    <div className="popup-row">
                      <label>太さ:</label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={penSize}
                        onChange={(e) => setPenSize(Number(e.target.value))}
                        style={{ width: '100px' }}
                      />
                      <span>{penSize}px</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ... (rest of the tools) */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={toggleEraserMode}
                  className={isEraserMode ? 'active' : ''}
                  title={isEraserMode ? '消しゴムモード ON' : '消しゴムモード OFF'}
                >
                  {ICON_SVG.eraser(isEraserMode)}
                </button>

                {/* 消しゴム設定ポップアップ */}
                {showEraserPopup && (
                  <div className="tool-popup">
                    <div className="popup-row">
                      <label>サイズ:</label>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={eraserSize}
                        onChange={(e) => setEraserSize(Number(e.target.value))}
                        style={{ width: '100px' }}
                      />
                      <span>{eraserSize}px</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="divider"></div>

              <button
                onClick={handleUndo}
                title="元に戻す (Ctrl+Z)"
              >
                ↩️
              </button>
              <button
                onClick={clearDrawing}
                onDoubleClick={clearAllDrawings}
                title="クリア（ダブルクリックで全ページクリア）"
              >
                <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="18" height="22" rx="2" fill="white" stroke="#999" strokeWidth="0.8" />
                  <path d="M16 3 L12 7 L16 11 L20 7 Z" fill="yellow" stroke="orange" strokeWidth="0.8" transform="translate(-2, -1)" />
                </svg>
              </button>

            </>
          </div>

        </div>

        <div
          className="canvas-container"
          ref={containerRef}
          style={{ position: 'relative' }} // Ensure container is relative for overlay
        >
          {/* Main Content Area: PDF Panes */}
          <div
            ref={splitContainerRef}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
              overflow: 'hidden',
              position: 'relative',
              backgroundColor: '#f0f0f0',
              height: '100%' // Ensure full height
            }}
          >
            {/* Global Selection Overlay */}
            {isSelectionMode && (
              <div
                className="selection-overlay"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 9999,
                  cursor: isCtrlPressed ? 'grab' : 'crosshair',
                  touchAction: 'none',
                  // Ctrl押下中はPDFPaneにイベントを通過させる（2本指ジェスチャーはDOM操作で即座に切り替え）
                  pointerEvents: isCtrlPressed ? 'none' : 'auto'
                }}
                onMouseDown={handleSelectionStart}
                onMouseMove={handleSelectionMove}
                onMouseUp={handleSelectionEnd}
                onTouchStart={handleTouchSelectionStart}
                onTouchMove={handleTouchSelectionMove}
                onTouchEnd={handleTouchSelectionEnd}
              >
                {selectionRect && (
                  <div style={{
                    position: 'absolute',
                    left: selectionRect.x,
                    top: selectionRect.y,
                    width: selectionRect.width,
                    height: selectionRect.height,
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    border: '2px solid #3498db',
                    pointerEvents: 'none'
                  }} />
                )}
              </div>
            )}

            {/* ペインA (問題) */}
            {(isSplitView || activeTab === 'A') && (
              <PDFPane
                className="pane-a"
                ref={paneARef}
                style={{
                  flex: isSplitView ? `0 0 ${Math.round(splitRatio * 100)}%` : '1 1 auto',
                  height: '100%',
                  overflow: 'hidden'
                }}
                pdfRecord={pdfRecord}
                pdfDoc={pdfDoc}
                pageNum={pageA}
                tool={isEraserMode ? 'eraser' : (isDrawingMode ? 'pen' : 'none')}
                color={penColor}
                size={penSize}
                eraserSize={eraserSize}
                drawingPaths={drawingPaths.get(pageA) || []}
                isCtrlPressed={isCtrlPressed}
                splitMode={isSplitView}
                onPageChange={handlePageAChange}
                onPathAdd={(path) => handlePathAdd(pageA, path)}
                onPathsChange={(paths) => handlePathsChange(pageA, paths)}
                onUndo={handleUndo}
              />
            )}

            {/* リサイズハンドル */}
            {
              isSplitView && (
                <div
                  onMouseDown={handleResizeStart}
                  onTouchStart={handleResizeStart}
                  style={{
                    width: '6px',
                    height: '100%',
                    backgroundColor: isResizing ? '#3498db' : '#ccc',
                    cursor: 'col-resize',
                    flexShrink: 0,
                    transition: 'background-color 0.2s',
                    zIndex: 10000,  // 選択オーバーレイ(9999)より上
                    position: 'relative'
                  }}
                />
              )
            }

            {/* ペインB (解答/解説) */}
            {
              (isSplitView || activeTab === 'B') && (
                <PDFPane
                  className="pane-b"
                  ref={paneBRef}
                  style={{
                    flex: isSplitView ? `0 0 ${Math.round((1 - splitRatio) * 100)}%` : '1 1 auto',
                    height: '100%',
                    overflow: 'hidden'
                  }}
                  pdfRecord={pdfRecord}
                  pdfDoc={pdfDoc}
                  pageNum={pageB}
                  tool={isEraserMode ? 'eraser' : (isDrawingMode ? 'pen' : 'none')}
                  color={penColor}
                  size={penSize}
                  eraserSize={eraserSize}
                  drawingPaths={drawingPaths.get(pageB) || []}
                  isCtrlPressed={isCtrlPressed}
                  splitMode={isSplitView}
                  onPageChange={handlePageBChange}
                  onPathAdd={(path) => handlePathAdd(pageB, path)}
                  onPathsChange={(paths) => handlePathsChange(pageB, paths)}
                  onUndo={handleUndo}
                />
              )
            }

            {/* テキストモード用オーバーレイ */}
            {
              isTextMode && !editingText && (
                <div
                  ref={(el) => {
                    // Store ref for immediate DOM manipulation
                    if (el) (el as any).__textOverlayRef = el
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 100,
                    cursor: 'text',
                    touchAction: 'none',
                    // Ctrl押下中はPDFPaneにイベントを通過させる
                    pointerEvents: isCtrlPressed ? 'none' : 'auto'
                  }}
                  onClick={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (!rect) return

                    // 現在アクティブなペインを特定
                    const currentPage = activeTab === 'A' ? pageA : pageB

                    // クリック位置を正規化座標に変換（簡易版：コンテナ基準）
                    const screenX = e.clientX - rect.left
                    const screenY = e.clientY - rect.top
                    const normalizedX = screenX / rect.width
                    const normalizedY = screenY / rect.height

                    handleTextClick(currentPage, normalizedX, normalizedY, e.clientX, e.clientY)
                  }}
                  onTouchStart={(e) => {
                    // 共通ヘルパーでピンチズームを処理
                    handleOverlayTouchStart(e)
                  }}
                  onTouchMove={(e) => {
                    // 共通ヘルパーでピンチズームを処理
                    handleOverlayTouchMove(e)
                  }}
                  onTouchEnd={(e) => {
                    // 共通ヘルパーでタッチ終了処理
                    handleOverlayTouchEnd(e)
                  }}
                />
              )
            }

            {/* テキストアノテーション表示 */}
            {
              (textAnnotations.get(activeTab === 'A' ? pageA : pageB) || []).map((annotation) => {
                const currentPage = activeTab === 'A' ? pageA : pageB
                const isClickable = isEraserMode || isTextMode
                const isBeingEdited = editingText?.existingId === annotation.id

                // 編集中のテキストは非表示（入力ボックスで表示）
                if (isBeingEdited) return null

                return (
                  <div
                    key={annotation.id}
                    style={{
                      position: 'absolute',
                      left: `${annotation.x * 100}%`,
                      top: `${annotation.y * 100}%`,
                      fontSize: `${annotation.fontSize}px`,
                      color: annotation.color,
                      writingMode: annotation.direction === 'horizontal' ? 'horizontal-tb' :
                        annotation.direction === 'vertical-rl' ? 'vertical-rl' : 'vertical-lr',
                      whiteSpace: 'pre-wrap',
                      pointerEvents: isClickable ? 'auto' : 'none',
                      zIndex: isClickable ? 200 : 50,
                      cursor: isClickable ? 'pointer' : 'default',
                      textShadow: '1px 1px 2px rgba(255,255,255,0.8), -1px -1px 2px rgba(255,255,255,0.8)',
                      padding: isClickable ? '2px 4px' : '0',
                      borderRadius: '4px',
                      backgroundColor: isClickable ? 'rgba(200, 220, 255, 0.3)' : 'transparent',
                      border: isClickable ? '1px dashed #3498db' : 'none'
                    }}
                    onClick={(e) => {
                      if (!isClickable) return
                      e.stopPropagation()
                      // 編集モードに入る
                      const rect = containerRef.current?.getBoundingClientRect()
                      if (!rect) return
                      setEditingText({
                        pageNum: currentPage,
                        x: annotation.x,
                        y: annotation.y,
                        screenX: rect.left + annotation.x * rect.width,
                        screenY: rect.top + annotation.y * rect.height,
                        existingId: annotation.id,
                        initialText: annotation.text
                      })
                    }}
                    title={isClickable ? 'クリックで編集（テキストを消して確定で削除）' : ''}
                  >
                    {annotation.text}
                  </div>
                )
              })
            }
          </div >
        </div >

        {/* テキスト入力ボックス */}
        {
          editingText && (
            <div
              style={{
                position: 'fixed',
                left: editingText.screenX,
                top: editingText.screenY,
                zIndex: 10000,
                background: 'white',
                border: '2px solid #3498db',
                borderRadius: '4px',
                padding: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}
            >
              <textarea
                autoFocus
                defaultValue={editingText.initialText || ''}
                placeholder="テキストを入力..."
                style={{
                  fontSize: `${textFontSize}px`,
                  color: penColor,
                  writingMode: textDirection === 'horizontal' ? 'horizontal-tb' :
                    textDirection === 'vertical-rl' ? 'vertical-rl' : 'vertical-lr',
                  border: 'none',
                  outline: 'none',
                  resize: 'both',
                  minWidth: textDirection === 'horizontal' ? '150px' : '50px',
                  minHeight: textDirection === 'horizontal' ? '50px' : '100px',
                  maxWidth: '300px',
                  maxHeight: '200px'
                }}
                onBlur={(e) => confirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingText(null)
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    confirmText((e.target as HTMLTextAreaElement).value)
                  }
                }}
              />
            </div>
          )
        }

        {
          gradingResult && (
            <GradingResult
              result={gradingResult}
              onClose={() => setGradingResult(null)}
              snsLinks={snsLinks}
              timeLimitMinutes={snsTimeLimit}
              modelName={gradingModelName}
              responseTime={gradingResponseTime}
            />
          )
        }

        {
          gradingError && (
            <div className="error-popup">
              <div className="error-popup-content">
                <h3>❌ エラー</h3>
                <p>{gradingError}</p>
                <button onClick={() => setGradingError(null)} className="close-btn">
                  閉じる
                </button>
              </div>
            </div>
          )
        }

        {
          selectionPreview && (
            <div className="selection-confirm-popup">
              <div className="selection-confirm-content">
                <h3>📐 この範囲を採点しますか？</h3>
                <div className="preview-image-container">
                  <img src={selectionPreview} alt="選択範囲のプレビュー" className="preview-image" />
                </div>
                <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                  <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>AIモデル:</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="default">デフォルト ({defaultModelName})</option>
                    {availableModels.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                    {selectedModel === 'default' && `✨ ${defaultModelName} を使用`}
                    {availableModels.find(m => m.id === selectedModel)?.description}
                  </div>
                </div>
                <div className="confirm-buttons">
                  <button
                    onClick={handleCancelSelection}
                    className="cancel-button"
                    disabled={isGrading}
                  >
                    {isGrading ? 'キャンセル' : 'やり直す'}
                  </button>
                  <button
                    onClick={confirmAndGrade}
                    className="confirm-button"
                    disabled={isGrading}
                    style={isGrading ? { opacity: 0.7, cursor: 'wait' } : undefined}
                  >
                    {isGrading ? '⏳ 採点中...' : '採点する'}
                  </button>
                </div>
              </div>
            </div>
          )
        }
      </div >
    </div >
  )
}

export default StudyPanel
