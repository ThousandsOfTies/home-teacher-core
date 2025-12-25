import { useEffect, useRef, useState, useCallback } from 'react'
import { GradingResult as GradingResultType, GradingResponseResult, getAvailableModels, ModelInfo } from '../../services/api'
import GradingResult from './GradingResult'
import { savePDFRecord, getPDFRecord, updatePDFRecord, getAllSNSLinks, SNSLinkRecord, PDFFileRecord, saveGradingHistory, getGradingHistoryByPdfId, generateGradingHistoryId, getAppSettings, saveAppSettings, saveDrawing } from '../../utils/indexedDB'
import { ICON_SVG } from '../../constants/icons'
import { DrawingPath } from '@thousands-of-ties/drawing-common'
import PDFCanvas from './components/PDFCanvas'
import { PDFPane, PDFPaneHandle } from './PDFPane'
import { usePDFRenderer } from '../../hooks/pdf/usePDFRenderer'
import './StudyPanel.css'

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
  answerRegistrationMode?: boolean
}

const StudyPanel = ({ pdfRecord, pdfId, onBack, answerRegistrationMode = false }: StudyPanelProps) => {
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
      // 合成キャンバス（PDF + 描画）を取得
      const compositeCanvas = paneRef.current?.getCanvas()
      // 表示位置取得用に DOM 内の実際のキャンバス要素を検索
      const visibleCanvas = paneEl?.querySelector('.pdf-canvas') as HTMLCanvasElement | null

      if (paneEl && compositeCanvas && visibleCanvas) {
        const paneRect = paneEl.getBoundingClientRect()
        const containerRect = containerRef.current!.getBoundingClientRect()
        // 表示されているキャンバスの位置を使用
        const canvasRect = visibleCanvas.getBoundingClientRect()

        // 選択矩形のスクリーン座標
        const selectionScreenX = containerRect.left + rect.x
        const selectionScreenY = containerRect.top + rect.y
        const selectionScreenW = rect.width
        const selectionScreenH = rect.height

        // 選択矩形とキャンバス表示領域の交差部分
        const intersectX = Math.max(selectionScreenX, canvasRect.left)
        const intersectY = Math.max(selectionScreenY, canvasRect.top)
        const intersectW = Math.min(selectionScreenX + selectionScreenW, canvasRect.right) - intersectX
        const intersectH = Math.min(selectionScreenY + selectionScreenH, canvasRect.bottom) - intersectY

        if (intersectW > 0 && intersectH > 0) {
          // 表示サイズと実際のキャンバスサイズの比率
          const scaleX = compositeCanvas.width / canvasRect.width
          const scaleY = compositeCanvas.height / canvasRect.height

          // ソース座標（合成キャンバス上）
          const sx = (intersectX - canvasRect.left) * scaleX
          const sy = (intersectY - canvasRect.top) * scaleY
          const sw = intersectW * scaleX
          const sh = intersectH * scaleY

          // 出力座標（一時キャンバス上）
          const dx = intersectX - selectionScreenX
          const dy = intersectY - selectionScreenY

          ctx.drawImage(compositeCanvas, sx, sy, sw, sh, dx, dy, intersectW, intersectH)
        }
      }
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

  // ページ状態
  // 保存されたレコードから初期化
  const [pageA, setPageA] = useState(pdfRecord.lastPageNumber || 1)
  const [pageB, setPageB] = useState(1)

  // PDF Document Loading
  const { pdfDoc, numPages, isLoading, error: pdfError } = usePDFRenderer(pdfRecord, {
    onLoadSuccess: (pages) => {
      console.log(`✅ PDF loaded in StudyPanel: ${pages} pages`)
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
  // Use constant or call helper
  const defaultModel = 'Gemini 2.0 Flash'

  // Model Selection Helper
  const getAvailableModels = () => {
    return [
      { id: 'default', name: '標準 (Gemini 2.0 Flash)', description: '高速でバランスの良いモデル' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '高精度で複雑な推論が可能' },
      { id: 'gpt-4o', name: 'GPT-4o', description: '最高精度のモデル' }
    ]
  }

  // Define availableModels for render
  const availableModels = getAvailableModels().filter(m => m.id !== 'default')

  // Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  // selectionRect is already defined at the top
  const [selectionPreview, setSelectionPreview] = useState<string | null>(null)

  // Answer Registration State
  const [showAnswerStartDialog, setShowAnswerStartDialog] = useState(false)
  const [isProcessingAnswers, setIsProcessingAnswers] = useState(false)
  const [answersProcessed, setAnswersProcessed] = useState(0)

  // Tool State
  const [isDrawingMode, setIsDrawingMode] = useState(true)
  const [isEraserMode, setIsEraserMode] = useState(false)
  const [penColor, setPenColor] = useState('#FF0000')
  const [penSize, setPenSize] = useState(3)
  const [showPenPopup, setShowPenPopup] = useState(false)
  const [eraserSize, setEraserSize] = useState(50)
  const [showEraserPopup, setShowEraserPopup] = useState(false)

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
        if (record?.drawings) {
          const newMap = new Map<number, DrawingPath[]>()
          for (const [pageStr, pathsJson] of Object.entries(record.drawings)) {
            const page = parseInt(pageStr, 10)
            try {
              const paths = JSON.parse(pathsJson as string) as DrawingPath[]
              if (paths.length > 0) {
                newMap.set(page, paths)
              }
            } catch (e) {
              console.error(`描画データのパースに失敗: ページ ${page}`, e)
            }
          }
          if (newMap.size > 0) {
            console.log(`📝 描画を復元: ${newMap.size}ページ`)
            setDrawingPaths(newMap)
          }
        }
      } catch (e) {
        console.error('描画の読み込みに失敗:', e)
      }
    }
    loadDrawings()
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

  // 選択完了ハンドラ
  const handleSelectionComplete = async (rect: { x: number, y: number, width: number, height: number, zoom: number, pan: { x: number, y: number } }) => {
    const pdfCanvas = paneARef.current?.getCanvas()
    if (!pdfCanvas) return

    // Create temp canvas for cropped image
    const tempCanvas = document.createElement('canvas')
    // rect is in CSS pixels relative to the UNTRANSFORMED content (because we normalized in PDFPane?)
    // In PDFPane, we did:
    // const zoom = zoomRef.current
    // const rect = { x: startX, y: startY, width, height, zoom, pan: panOffsetRef.current }
    // These x/y/width/height are CSS pixels in the *SelectionCanvas* coordinate space.
    // SelectionCanvas is overlaid on the viewport.
    // PDF content is transformed: translate(pan.x, pan.y) scale(zoom).
    // So the point (x,y) on SelectionCanvas corresponds to PDF content point:
    // pdfX = (x - pan.x) / zoom
    // But PDFCanvas has internal resolution RENDER_SCALE (typically 5.0).

    // We need to define RENDER_SCALE here or get it from somewhere.
    // Assuming 5.0 as per PDFPane.
    const RENDER_SCALE = 5.0

    try {
      const { x, y, width, height, zoom, pan } = rect

      // Calculate coordinates in the PDF Canvas space (High Res)
      const cssX = (x - pan.x) / zoom
      const cssY = (y - pan.y) / zoom
      const cssW = width / zoom
      const cssH = height / zoom

      const canvasX = cssX * RENDER_SCALE
      const canvasY = cssY * RENDER_SCALE
      const canvasW = cssW * RENDER_SCALE
      const canvasH = cssH * RENDER_SCALE

      if (canvasW <= 0 || canvasH <= 0) return

      // --- COMPOSITE DRAWINGS ---
      // We need to draw the PDF content AND the strokes onto the temp canvas.
      // Since we want high-res output, we start with the high-res PDF canvas.

      // 1. Create a high-res composition canvas (full page size)
      // This might be expensive, so maybe just draw the crop?
      // Drawing paths to the crop is complex because paths are in normalized coordinates (0-1).
      // Normalized -> Canvas coordinates: x * pdfCanvas.width

      const paths = drawingPaths.get(pageA) || []

      // Setup result canvas
      tempCanvas.width = canvasW
      tempCanvas.height = canvasH
      const ctx = tempCanvas.getContext('2d')
      if (!ctx) return

      // 2. Draw PDF portion
      ctx.drawImage(pdfCanvas, canvasX, canvasY, canvasW, canvasH, 0, 0, canvasW, canvasH)

      // 3. Draw Drawings portion
      // We iterate paths and draw those that intersect the crop?
      // Easier to just draw ALL paths with a clip/transform?
      // Transform: We want to draw the WHOLE page of paths, but shifted so that (canvasX, canvasY) is at (0,0).
      // ctx.translate(-canvasX, -canvasY)
      // And we need to scale paths from Normalized to Canvas pixels.
      // pdfCanvas.width is the full width.

      ctx.save()
      ctx.translate(-canvasX, -canvasY)

      // Path definition from drawing-common usually: properties like color, width, points [{x,y}, ...]
      // x,y are normalized 0-1.

      paths.forEach(path => {
        if (path.points.length < 2) return

        ctx.beginPath()
        ctx.strokeStyle = path.color
        ctx.lineWidth = path.width * RENDER_SCALE // Scale width too? Maybe separate scale? 
        // path.width is usually relative to... screen pixels? 
        // If penSize=3, it looks like 3px on screen.
        // On Retine/HighRes canvas, it should be scaled. 
        // If RENDER_SCALE=5, line width around 15?
        // Let's try RENDER_SCALE.

        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // Draw points
        const startP = path.points[0]
        ctx.moveTo(startP.x * pdfCanvas.width, startP.y * pdfCanvas.height)

        for (let i = 1; i < path.points.length; i++) {
          const p = path.points[i]
          ctx.lineTo(p.x * pdfCanvas.width, p.y * pdfCanvas.height)
        }
        ctx.stroke()
      })

      ctx.restore()

      // --- END COMPOSITE ---

      // Compress and Grade
      const croppedImageData = compressImage(tempCanvas, 1024)

      // Full Page (for context)
      const fullPageCanvas = document.createElement('canvas')
      const fullPageScale = 0.5
      fullPageCanvas.width = Math.round(pdfCanvas.width * fullPageScale)
      fullPageCanvas.height = Math.round(pdfCanvas.height * fullPageScale)
      const fullPageCtx = fullPageCanvas.getContext('2d')!
      fullPageCtx.imageSmoothingEnabled = true
      fullPageCtx.imageSmoothingQuality = 'medium'
      fullPageCtx.drawImage(pdfCanvas, 0, 0, fullPageCanvas.width, fullPageCanvas.height)
      const fullPageImageData = compressImage(fullPageCanvas, 800)

      // Set Preview and prompt user or submit immediately?
      // Legacy code submitted immediately inside the logic I saw.
      // But the USER (you) mentioned "Preview dialog".
      // If I want to match legacy *behavior*, I should probably just submit or show preview.
      // The code I read in 1400+ had `if (selectionPreview) ...`.
      // So I will set `selectionPreview` and Return, letting the UI show the confirmation dialog.
      // And the confirmation dialog calls `confirmAndGrade`.

      // Wait, if I return here, `confirmAndGrade` needs access to these images.
      // I can't reconstruct them easily in `confirmAndGrade` without the rect.
      // So I should save the `rect` (which I already do: `selectionRect`).
      // AND save the preview image url to `selectionPreview`.

      // BUT `handleSelectionComplete` already received the rect.
      // So I should:
      // 1. Set `selectionRect` state.
      // 2. Set `selectionPreview` state (dataURL).
      // 3. The UI (already present in return JSX) will show the Popup.
      // 4. The Popup 'Confirm' button calls `confirmAndGrade`.
      // 5. `confirmAndGrade` should call `submitForGrading` (refactored).

      setSelectionRect(rect)
      setSelectionPreview(croppedImageData) // Show the cropped image as preview
      addStatusMessage('範囲を選択しました。採点しますか？')

      // Prepare for submission (stored in state implicitly via selectionRect/Preview)

    } catch (e) {
      console.error("Error processing selection:", e)
      addStatusMessage("エラーが発生しました")
    }
  }

  // 採点確定ハンドラ
  const confirmAndGrade = async () => {
    if (!selectionRect || !selectionPreview) return

    setIsGrading(true)
    setGradingError(null)

    try {
      // アクティブなペインからキャンバスを取得
      const activePane = activeTab === 'A' ? paneARef : paneBRef
      const activePage = activeTab === 'A' ? pageA : pageB
      const pdfCanvas = activePane.current?.getCanvas()
      if (!pdfCanvas) throw new Error("PDF Canvas not available")

      const fullPageCanvas = document.createElement('canvas')
      const fullPageScale = 0.5
      fullPageCanvas.width = Math.round(pdfCanvas.width * fullPageScale)
      fullPageCanvas.height = Math.round(pdfCanvas.height * fullPageScale)
      const fullPageCtx = fullPageCanvas.getContext('2d')!
      fullPageCtx.drawImage(pdfCanvas, 0, 0, fullPageCanvas.width, fullPageCanvas.height)
      const fullPageImageData = compressImage(fullPageCanvas, 800)

      const croppedImageData = selectionPreview

      // APIに送信
      addStatusMessage('🎯 AI採点中...')
      const { gradeWorkWithContext } = await import('../../services/api')
      const response = await gradeWorkWithContext(
        fullPageImageData,
        croppedImageData,
        activePage,
        selectedModel !== 'default' ? selectedModel : undefined
      )

      if (response.success) {
        setGradingError(null)
        setGradingResult({ ...response.result })
        addStatusMessage(`✅ 採点完了 (${response.result.problems.length}問)`)

        // --- DETAILED MATCHING LOGIC (PASTED & ADAPTED) ---
        if (response.result.problems && response.result.problems.length > 0) {
          const { getAnswersByPdfId } = await import('../../utils/indexedDB')
          const registeredAnswers = await getAnswersByPdfId(pdfId)

          for (const problem of response.result.problems) {
            // Helper functions
            const normalizeAnswer = (answer: string): string => {
              return answer.toLowerCase().replace(/\s+/g, '').replace(/°|度/g, '').replace(/[Xx×]/g, '*').replace(/[（(]/g, '(').replace(/[）)]/g, ')').replace(/,/g, '.').trim()
            }
            const normalizeProblemNumber = (pn: string): string => {
              if (!pn) return ''
              return pn.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase().trim()
            }

            const normalizedAiProblem = normalizeProblemNumber(problem.problemNumber)
            const printedPage = problem.printedPageNumber || response.result.printedPageNumber
            let matchedAnswer: typeof registeredAnswers[0] | undefined = undefined

            if (printedPage) {
              const allPageNumbers = registeredAnswers.map(a => a.problemPageNumber).filter((p): p is number => p !== undefined && p <= printedPage)
              if (allPageNumbers.length > 0) {
                const targetSectionPage = Math.max(...allPageNumbers)
                const sectionAnswers = registeredAnswers.filter(ans => ans.problemPageNumber === targetSectionPage)
                const matchingInSection = sectionAnswers.filter(ans => normalizeProblemNumber(ans.problemNumber) === normalizedAiProblem)
                if (matchingInSection.length === 1) matchedAnswer = matchingInSection[0]
                else if (matchingInSection.length === 0) {
                  // Global search fallback
                  const matchingAnswers = registeredAnswers.filter(ans => normalizeProblemNumber(ans.problemNumber) === normalizedAiProblem)
                  if (matchingAnswers.length === 1) matchedAnswer = matchingAnswers[0]
                  else if (matchingAnswers.length > 1) {
                    matchedAnswer = matchingAnswers.reduce((prev, curr) => Math.abs((prev.problemPageNumber ?? 9999) - printedPage) < Math.abs((curr.problemPageNumber ?? 9999) - printedPage) ? curr : prev)
                  }
                }
              }
            } else {
              // Fallback using PDF page
              const matchingAnswers = registeredAnswers.filter(ans => normalizeProblemNumber(ans.problemNumber) === normalizedAiProblem)
              if (matchingAnswers.length === 1) matchedAnswer = matchingAnswers[0]
            }

            // AI vs DB Logic
            let isCorrect = problem.isCorrect || false
            let correctAnswer = problem.correctAnswer || ''
            let feedback = problem.feedback || ''
            let explanation = problem.explanation || ''

            if (!isCorrect && matchedAnswer) {
              const normalizedStudent = normalizeAnswer(problem.studentAnswer)
              const normalizedDbCorrect = normalizeAnswer(matchedAnswer.correctAnswer)
              if (normalizedStudent === normalizedDbCorrect) {
                isCorrect = true
                correctAnswer = matchedAnswer.correctAnswer
                feedback = '正解です！よくできました！'
                explanation = `正解は ${correctAnswer} です。`
              }
            }

            const historyRecord = {
              id: generateGradingHistoryId(),
              pdfId,
              pdfFileName: pdfRecord.fileName,
              pageNumber: pageA,
              problemNumber: problem.problemNumber,
              studentAnswer: problem.studentAnswer,
              isCorrect,
              correctAnswer,
              feedback,
              explanation,
              timestamp: Date.now(),
              imageData: croppedImageData,
              matchingMetadata: problem.matchingMetadata
            }
            await saveGradingHistory(historyRecord)

            // Update display
            problem.isCorrect = isCorrect
            problem.correctAnswer = correctAnswer
            problem.feedback = feedback
            problem.explanation = explanation
          }

          setGradingResult(prev => prev ? ({ ...prev, problems: response.result.problems }) : null)
        }
        // --- END MATCHING ---

        setSelectionPreview(null) // Close preview
        setSelectionRect(null)
      } else {
        setGradingError(response.error || "採点に失敗しました")
      }

    } catch (e) {
      console.error(e)
      setGradingError("エラーが発生しました: " + e)
    } finally {
      setIsGrading(false)
    }
  }

  const cancelPreview = () => {
    setSelectionPreview(null)
    // Do not clear Rect so user can adjust? 
    // Actually PDFPane handles selection clearing usually.
    // But we can reset here.
  }

  // ズームリセット
  const resetZoom = () => {
    paneARef.current?.resetZoom()
    if (isSplitView) {
      paneBRef.current?.resetZoom()
    }
  }

  // 描画モードの切り替え
  const toggleDrawingMode = () => {
    if (isDrawingMode) {
      setShowPenPopup(!showPenPopup)
    } else {
      setIsDrawingMode(true)
      setIsEraserMode(false)
      setIsSelectionMode(false)
      setSelectionRect(null)
      setShowPenPopup(false)
      setShowEraserPopup(false)
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
      setIsSelectionMode(false)
      setSelectionRect(null)
      setShowEraserPopup(false)
      setShowPenPopup(false)
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
    setShowPenPopup(false)
    setShowEraserPopup(false)
    setSelectionRect(null)
    addStatusMessage('📐 採点範囲を選択してください')
  }

  // ステータスメッセージ
  const addStatusMessage = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('ja-JP')
    const fullMessage = `[${timestamp}] ${message}`
    console.log(fullMessage)
    setStatusMessage(message)
  }

  // 分割表示の切り替え
  const toggleSplitView = () => {
    setIsSplitView(prev => !prev)
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
      if (pdfRecord && pageA > 0 && pageA !== pdfRecord.lastPageNumber) {
        console.log('💾 ページ番号を保存:', pageA)
        updatePDFRecord(pdfRecord.id, { lastPageNumber: pageA }).catch(err => {
          console.error('ページ保存に失敗:', err)
        })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [pageA, pdfRecord.id, pdfRecord.lastPageNumber])

  // 矩形選択モードをキャンセル
  const handleCancelSelection = () => {
    // setIsSelectionMode(false) // ユーザー要望によりモードを維持
    setSelectionRect(null)
    setSelectionPreview(null)
    addStatusMessage('選択をクリアしました。再度範囲を選択してください')
  }

  // Ctrl+Z Undo
  const undo = () => {
    paneARef.current?.undo()
  }

  // 解答登録処理
  const processAnswersFromPage = async (startPage: number) => {
    const pdfDoc = paneARef.current?.pdfDoc
    if (!pdfDoc) {
      console.error("PDFDoc not available")
      return
    }

    setShowAnswerStartDialog(false)
    setIsProcessingAnswers(true)
    setAnswersProcessed(0)

    try {
      console.log(`🎓 解答登録開始: ページ ${startPage} からページ ${numPages} まで`)
      addStatusMessage(`🎓 解答登録開始 (${startPage}→${numPages})`)

      interface CollectedAnswer {
        pdfPage: number
        problemNumber: string
        correctAnswer: string
        problemPage: number | null
        sectionName?: string
        rawAiProblemPage?: number | string | null
        rawAiSectionName?: string | null
      }

      const allAnswers: CollectedAnswer[] = []
      const sectionBoundaries: { pdfPage: number; problemPage: number }[] = []

      for (let page = startPage; page <= numPages; page++) {
        console.log(`📄 [フェーズ1] ページ ${page} を解析中...`)

        const pdfPage = await pdfDoc.getPage(page)
        const viewport = pdfPage.getViewport({ scale: 2 })
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = viewport.width
        tempCanvas.height = viewport.height
        const ctx = tempCanvas.getContext('2d')
        if (!ctx) continue

        await pdfPage.render({ canvasContext: ctx, viewport }).promise
        const imageData = tempCanvas.toDataURL('image/jpeg', 0.9)

        const { analyzePage } = await import('../../services/api')
        const result = await analyzePage(imageData, page)

        if (result.success && result.pageType === 'answer' && result.data.answers) {
          for (const answer of result.data.answers) {
            let problemPage: number | null = null
            // 1. sectionNameから抽出
            if (answer.sectionName) {
              const patterns = [
                /(?:p\.?|page)\s*([0-9０-９]+)/i,
                /([0-9０-９]+)\s*(?:ページ)/i,
                /問題[はが]?\s*([0-9０-９]+)\s*(?:ページ)/i
              ]
              for (const pattern of patterns) {
                const match = answer.sectionName.match(pattern)
                if (match && match[1]) {
                  const numStr = match[1].replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                  const p = parseInt(numStr, 10)
                  if (!isNaN(p)) { problemPage = p; break }
                }
              }
            }
            // 2. propertyから
            if (problemPage === null && answer.problemPage != null) {
              if (typeof answer.problemPage === 'number') problemPage = answer.problemPage
              else if (typeof answer.problemPage === 'string') {
                const match = (answer.problemPage as string).match(/\d+/)
                if (match) problemPage = parseInt(match[0], 10)
              }
            }

            if (problemPage !== null) {
              const last = sectionBoundaries[sectionBoundaries.length - 1]
              if (!last || last.problemPage !== problemPage) {
                sectionBoundaries.push({ pdfPage: page, problemPage })
              }
            }

            allAnswers.push({
              pdfPage: page,
              problemNumber: answer.problemNumber,
              correctAnswer: answer.correctAnswer,
              problemPage,
              sectionName: answer.sectionName,
              rawAiProblemPage: answer.problemPage,
              rawAiSectionName: answer.sectionName
            })
          }
        }
        setAnswersProcessed(Math.floor((page - startPage + 1) / 2))
      }

      const { saveAnswers, generateAnswerId } = await import('../../utils/indexedDB')
      let currentSectionPage: number | undefined = undefined
      let hasExplicitPageRef = false

      const assignedAnswers = allAnswers.map(answer => {
        let updatedFromSectionName = false
        hasExplicitPageRef = false

        if (answer.problemPage) {
          currentSectionPage = answer.problemPage
          hasExplicitPageRef = true
        }

        if (!hasExplicitPageRef) {
          const n = (answer.problemNumber || '').replace(/\s+/g, '').toLowerCase()
          if (n === '1' || n.startsWith('1(') || n.startsWith('問1')) {
            currentSectionPage = undefined
          }
        }

        return {
          id: generateAnswerId(pdfId, answer.pdfPage, answer.problemNumber),
          pdfId,
          pageNumber: answer.pdfPage,
          problemPageNumber: currentSectionPage,
          problemNumber: answer.problemNumber,
          correctAnswer: answer.correctAnswer,
          sectionName: answer.sectionName,
          createdAt: Date.now()
        }
      })

      await saveAnswers(assignedAnswers)
      setAnswersProcessed(numPages - startPage + 1)
      addStatusMessage(`✅ 完了! ${assignedAnswers.length}件の解答を登録しました`)

      setTimeout(() => { if (onBack) onBack() }, 3000)

    } catch (error) {
      console.error('解答登録エラー:', error)
      addStatusMessage('❌ エラーが発生しました')
    } finally {
      setIsProcessingAnswers(false)
    }
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
            {answerRegistrationMode ? (
              /* 解答登録モード: シンプルなツールバー */
              <>
                <button
                  onClick={() => setShowAnswerStartDialog(true)}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#3498db',
                    color: 'white',
                    borderRadius: '12px',
                    fontSize: '28px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 4px 8px rgba(52, 152, 219, 0.3)',
                    transition: 'all 0.3s ease'
                  }}
                  title="このページ以降を解答として登録"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 6px 12px rgba(52, 152, 219, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(52, 152, 219, 0.3)';
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🦉
                    <span style={{ fontSize: '20px', color: 'white', opacity: 0.8 }}>→</span>
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      🦉
                      <span style={{
                        position: 'absolute',
                        top: '-8px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '18px'
                      }}>🎓</span>
                    </span>
                  </span>
                </button>
              </>
            ) : (
              /* 通常モード: 全ツール表示 */
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
                  onClick={undo}
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

                <div className="divider"></div>

              </>
            )}
          </div>

        </div>

        <div
          className="canvas-container"
          ref={containerRef}
          style={{ position: 'relative' }} // Ensure container is relative for overlay
        >
          {/* Main Content Area: PDF Panes */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: '#f0f0f0',
            height: '100%' // Ensure full height
          }}>
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
                  cursor: 'crosshair',
                  touchAction: 'none'
                }}
                onMouseDown={handleSelectionStart}
                onMouseMove={handleSelectionMove}
                onMouseUp={handleSelectionEnd}
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
                  flex: 1,
                  borderRight: isSplitView ? '1px solid #ccc' : 'none',
                  height: '100%'
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
                onPageChange={handlePageAChange}
                onPathAdd={(path) => handlePathAdd(pageA, path)}
                onPathsChange={(paths) => handlePathsChange(pageA, paths)}
                isSelectionMode={false}
                onSelectionComplete={() => { }}
              />
            )}

            {/* ペインB (解答/解説) */}
            {(isSplitView || activeTab === 'B') && (
              <PDFPane
                className="pane-b"
                ref={paneBRef}
                style={{
                  flex: 1,
                  height: '100%'
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
                onPageChange={handlePageBChange}
                onPathAdd={(path) => handlePathAdd(pageB, path)}
                onPathsChange={(paths) => handlePathsChange(pageB, paths)}
                isSelectionMode={false}
              />
            )}
          </div>
        </div>

        {gradingResult && (
          <GradingResult
            result={gradingResult}
            onClose={() => setGradingResult(null)}
            snsLinks={snsLinks}
            timeLimitMinutes={snsTimeLimit}
            modelName={gradingModelName}
            responseTime={gradingResponseTime}
          />
        )}

        {gradingError && (
          <div className="error-popup">
            <div className="error-popup-content">
              <h3>❌ エラー</h3>
              <p>{gradingError}</p>
              <button onClick={() => setGradingError(null)} className="close-btn">
                閉じる
              </button>
            </div>
          </div>
        )}

        {selectionPreview && (
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
                  <option value="default">デフォルト ({defaultModel})</option>
                  {availableModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {selectedModel === 'default' && `✨ ${defaultModel} を使用`}
                  {availableModels.find(m => m.id === selectedModel)?.description}
                </div>
              </div>
              <div className="confirm-buttons">
                <button onClick={handleCancelSelection} className="cancel-button">
                  やり直す
                </button>
                <button onClick={confirmAndGrade} className="confirm-button">
                  採点する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 解答登録モード: 開始確認ダイアログ */}
        {showAnswerStartDialog && !isProcessingAnswers && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '400px',
              width: '90%',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎓</div>
              <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50', fontSize: '24px' }}>
                解答を登録しますか？
              </h3>
              <p style={{ margin: '0 0 24px 0', color: '#7f8c8d', fontSize: '16px', lineHeight: '1.6' }}>
                現在のページ（<strong>{pageA}</strong>）から<br />
                最終ページ（<strong>{numPages}</strong>）までを<br />
                解答ページとして登録します
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    setShowAnswerStartDialog(false)
                    if (onBack) onBack()
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: '#95a5a6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={() => processAnswersFromPage(pageA)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  登録開始
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 解答登録モード: 処理中表示 */}
        {isProcessingAnswers && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            color: 'white'
          }}>
            <div style={{
              textAlign: 'center',
              padding: '32px'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '24px' }}>📚</div>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '28px' }}>
                解答を登録中...
              </h2>
              <p style={{ margin: '0 0 24px 0', fontSize: '18px', opacity: 0.8 }}>
                {answersProcessed} / {numPages - pageA + 1} ページ処理済み
              </p>
              <div style={{
                width: '300px',
                height: '8px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${(answersProcessed / (numPages - pageA + 1)) * 100}%`,
                  height: '100%',
                  backgroundColor: '#3498db',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StudyPanel
