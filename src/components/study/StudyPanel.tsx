import { useEffect, useRef, useState } from 'react'
import { GradingResult as GradingResultType, GradingResponseResult, getAvailableModels, ModelInfo } from '../../services/api'
import GradingResult from './GradingResult'
import { savePDFRecord, getPDFRecord, getAllSNSLinks, SNSLinkRecord, PDFFileRecord, saveGradingHistory, generateGradingHistoryId, getAppSettings, saveAppSettings } from '../../utils/indexedDB'
import { ICON_SVG } from '../../constants/icons'
// usePDFRendererは削除
import { useDrawing, useEraser, useZoomPan, DrawingPath, DrawingCanvas } from '@thousands-of-ties/drawing-common'
import { useSelection } from '../../hooks/pdf/useSelection'
import PDFCanvas, { PDFCanvasHandle } from './components/PDFCanvas'
import './StudyPanel.css'

// pdfjsLibの設定は削除

// 画像圧縮ヘルパー関数
const compressImage = (canvas: HTMLCanvasElement, maxSize: number = 1024): string => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

  // キャンバスが既に小さい場合はそのまま
  if (canvas.width <= maxSize && canvas.height <= maxSize) {
    return canvas.toDataURL('image/jpeg', isIOS ? 0.7 : 0.8)
  }

  // アスペクト比を維持してリサイズ
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
  pdfRecord: PDFFileRecord // PDFファイルレコード全体を受け取る
  pdfId: string // IndexedDBのレコードID
  onBack?: () => void // 管理画面に戻るコールバック
  answerRegistrationMode?: boolean // 解答登録モード
}

const StudyPanel = ({ pdfRecord, pdfId, onBack, answerRegistrationMode = false }: StudyPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)  // canvas-container
  const wrapperRef = useRef<HTMLDivElement>(null)      // canvas-wrapper
  const layerRef = useRef<HTMLDivElement>(null)        // canvas-layer
  const cachedRectRef = useRef<DOMRect | null>(null)  // getBoundingClientRect()のキャッシュ

  // PDFCanvasへの参照
  const pdfCanvasRef = useRef<PDFCanvasHandle>(null)

  // PDFの状態（PDFCanvasから通知される）
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')

  // ステータスメッセージ
  const addStatusMessage = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('ja-JP')
    const fullMessage = `[${timestamp}] ${message}`
    console.log(fullMessage)
    setStatusMessage(message)
  }

  // ページ送り関数（PDFCanvasに委譲）
  const goToPrevPage = () => pdfCanvasRef.current?.goToPrevPage()
  const goToNextPage = () => pdfCanvasRef.current?.goToNextPage()

  const handleLoadStart = () => {
    setIsLoading(true)
    setError(null)
    addStatusMessage('💾 PDFを読み込み中...')
  }

  const handleLoadSuccess = (pages: number) => {
    setIsLoading(false)
    setNumPages(pages)
    addStatusMessage(`✅ PDF読み込み成功: ${pages}ページ`)
  }

  const handleLoadError = (errorMsg: string) => {
    setIsLoading(false)
    setError(errorMsg)
    addStatusMessage(`❌ ${errorMsg}`)
  }

  const handlePageChange = (newPageNum: number) => {
    setPageNum(newPageNum)
  }

  // PDFドキュメントのロードはPDFCanvasが行うため、usePDFRenderer呼び出しは削除

  // レンダリングタスク管理用（PDFViewer側で管理）
  const renderTaskRef = useRef<any>(null)

  // 描画パスの状態（DrawingCanvasに渡す）
  const [drawingPaths, setDrawingPaths] = useState<Map<number, DrawingPath[]>>(new Map())

  // パス追加ハンドラ
  const handlePathAdd = (newPath: DrawingPath) => {
    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      const currentPaths = newMap.get(pageNum) || []
      const newPaths = [...currentPaths, newPath]
      newMap.set(pageNum, newPaths)

      // 履歴保存 (簡易実装: 現状のsaveToHistoryが不明なため、ここでログだけ出しておく)
      // saveToHistory(newPaths) 
      return newMap
    })
  }

  // パス変更ハンドラ（消しゴムなど）
  const handlePathsChange = (newPaths: DrawingPath[]) => {
    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      if (newPaths.length === 0) {
        newMap.delete(pageNum)
      } else {
        newMap.set(pageNum, newPaths)
      }
      return newMap
    })
  }


  // 履歴管理（ページ遷移でリセット）
  const [history, setHistory] = useState<DrawingPath[][]>([])

  useEffect(() => {
    setHistory([])
  }, [pageNum])

  const saveToHistory = (paths: DrawingPath[]) => {
    setHistory(prev => [...prev.slice(-20), paths])
  }

  const undo = () => {
    if (history.length === 0) return

    const newHistory = [...history]
    const currentState = newHistory.pop() // 現在の状態
    // もし現在の状態がdrawingPathsと異なるなら（リドゥ後など）、
    // ここでdrawingPathsをhistoryの最後に合わせる必要があるが、
    // 基本的にhistoryの最後＝現在の表示、となると「1つ戻る」にはpopした後のlastが必要。

    // しかし、historyに「現在の状態」が含まれているかどうかによる。
    // saveToHistory は操作直後に呼ばれるので、historyの末尾は「現在の状態」。
    // なので、undoするには末尾をpopして、その一つ前（newHistoryの末尾）を復元する。

    // もしnewHistoryが空になったら？ -> 初期状態（空？）に戻す。
    // 初期状態が保存されていない場合がある。
    // パス描画開始時に「修正前の状態」を保存すべきだが、今回は「修正後の状態」を保存している。
    // つまり history = [State1, State2, State3]
    // Undo -> State2 に戻したい。
    // history.pop() -> State3 が消える。
    // newLast = history[last] -> State2

    const prevState = newHistory[newHistory.length - 1] || [] // 空なら空配列

    setHistory(newHistory)

    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      if (prevState && prevState.length > 0) {
        newMap.set(pageNum, prevState)
      } else {
        newMap.delete(pageNum)
      }
      return newMap
    })
  }

  // ハンドララッパー（履歴保存付き）
  const handlePathAddWrapper = (newPath: DrawingPath) => {
    const currentPaths = drawingPaths.get(pageNum) || []
    // 最初の操作の場合、操作前の状態（空もしくは既存）を履歴に入れておく必要があるか？
    // Undoのロジックによる。「今の状態」が履歴の最後にある前提なら、
    // State0 -> (Op) -> State1
    // history: [State1] だと Undoできない。
    // history: [State0, State1] である必要がある。

    if (history.length === 0) {
      setHistory([currentPaths, [...currentPaths, newPath]])
    } else {
      saveToHistory([...currentPaths, newPath])
    }

    handlePathAdd(newPath)
  }

  const handlePathsChangeWrapper = (newPaths: DrawingPath[]) => {
    const currentPaths = drawingPaths.get(pageNum) || []
    if (history.length === 0) {
      setHistory([currentPaths, newPaths])
    } else {
      saveToHistory(newPaths)
    }
    handlePathsChange(newPaths)
  }

  // プリレンダリング戦略: zoomは 1/RENDER_SCALE ～ 1.0 の範囲
  // 初期値は 1/3 (等倍表示)、最大1.0まで拡大可能
  // renderScale は常に 3.0 固定、zoom のみが変化

  // PDFレンダリング時に使用する実際のスケール（5倍固定で高解像度化）
  const RENDER_SCALE = 5.0
  const [renderScale, setRenderScale] = useState(RENDER_SCALE)

  // フィット時のズーム値を保持（これより小さくしようとしたらフィット表示に戻す）
  const [minFitZoom, setMinFitZoom] = useState(1.0 / RENDER_SCALE)

  // 画面フィット＆中央配置の共通関数（先に定義が必要）
  const applyFitAndCenterRef = useRef<() => void>()

  // useZoomPan hook を使用してズーム・パン機能を管理
  const {
    zoom,
    setZoom,
    isPanning,
    panOffset,
    setPanOffset,
    isCtrlPressed,
    startPanning,
    doPanning,
    stopPanning,
    resetZoom: hookResetZoom,
    lastWheelCursor,
    applyPanLimit
  } = useZoomPan(wrapperRef, RENDER_SCALE, minFitZoom, () => {
    // フィットサイズより小さくしようとしたら、フィット表示に戻す
    if (applyFitAndCenterRef.current) {
      applyFitAndCenterRef.current()
    }
  }, canvasRef)

  const displayZoom = Math.round(renderScale * zoom * 100)

  // renderPage完了を通知するためのカウンター
  const [renderCompleteCounter, setRenderCompleteCounter] = useState(0)

  const toCanvasCoordinates = (clientX: number, clientY: number, rect: DOMRect) => {
    // スクリーン座標からcanvas座標への変換
    // canvas-layerは transform: translate(panOffset) scale(zoom) がかかっている
    // スクリーン座標 = (canvas座標 * zoom) + panOffset + rect位置
    // ∴ canvas座標 = (スクリーン座標 - rect位置 - panOffset) / zoom
    const safeZoom = zoom || 1
    return {
      x: (clientX - rect.left - panOffset.x) / safeZoom,
      y: (clientY - rect.top - panOffset.y) / safeZoom
    }
  }

  const [isDrawingMode, setIsDrawingMode] = useState(true)  // デフォルトでペンモードON
  const [isEraserMode, setIsEraserMode] = useState(false)

  // 2本指タップ検出用
  const twoFingerTapStartTimeRef = useRef<number | null>(null)
  const twoFingerTapDistanceRef = useRef<number | null>(null)

  // ペンの設定
  const [penColor, setPenColor] = useState('#FF0000')
  const [penSize, setPenSize] = useState(3)
  const [showPenPopup, setShowPenPopup] = useState(false)

  // 消しゴムの設定
  const [eraserSize, setEraserSize] = useState(50)
  const [showEraserPopup, setShowEraserPopup] = useState(false)
  const [eraserCursorPos, setEraserCursorPos] = useState<{ x: number, y: number } | null>(null)

  const [isGrading, setIsGrading] = useState(false)
  const [gradingResult, setGradingResult] = useState<GradingResponseResult | null>(null)
  const [gradingError, setGradingError] = useState<string | null>(null)
  const [gradingModelName, setGradingModelName] = useState<string | null>(null)
  const [gradingResponseTime, setGradingResponseTime] = useState<number | null>(null)

  // 採点モデル選択
  const [selectedModel, setSelectedModel] = useState<string>('default')
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [defaultModel, setDefaultModel] = useState<string>('gemini-2.0-flash-exp')

  // 解答登録モード状態
  const [isProcessingAnswers, setIsProcessingAnswers] = useState(false)
  const [showAnswerStartDialog, setShowAnswerStartDialog] = useState(false)
  const [answersProcessed, setAnswersProcessed] = useState(0)

  // useSelection hook を使用して矩形選択機能を管理
  const {
    isSelectionMode,
    setIsSelectionMode,
    isSelecting,
    selectionRect,
    setSelectionRect,
    selectionPreview,
    setSelectionPreview,
    startSelection: hookStartSelection,
    updateSelection: hookUpdateSelection,
    finishSelection: hookFinishSelection,
    cancelSelection
  } = useSelection()

  // SNSリンク
  const [snsLinks, setSnsLinks] = useState<SNSLinkRecord[]>([])
  const [snsTimeLimit, setSnsTimeLimit] = useState<number>(30) // デフォルト30分

  // SNSリンクと設定を読み込む
  useEffect(() => {
    const loadSNSData = async () => {
      try {
        const links = await getAllSNSLinks()
        setSnsLinks(links)
        const settings = await getAppSettings()
        setSnsTimeLimit(settings.snsTimeLimitMinutes)
        // デフォルトモデルを読み込む
        if (settings.defaultGradingModel) {
          setSelectedModel(settings.defaultGradingModel)
        }
      } catch (error) {
        console.error('Failed to load SNS data:', error)
      }
    }
    loadSNSData()
  }, [])

  // ペン跡が変更されたら自動保存（デバウンス付き）
  useEffect(() => {
    if (!pdfId) {
      console.log('⚠️ pdfIdが未設定のため保存をスキップ')
      return
    }

    const timer = setTimeout(async () => {
      addStatusMessage('💾 保存中...')
      try {
        // IndexedDBに各ページのペン跡を保存
        const record = await getPDFRecord(pdfId)
        if (record) {
          // 各ページのdrawingPathsをJSON文字列に変換
          drawingPaths.forEach((paths, pageNumber) => {
            record.drawings[pageNumber] = JSON.stringify(paths)
          })
          // 最終閲覧日時を更新
          record.lastOpened = Date.now()
          await savePDFRecord(record)
          addStatusMessage(`✅ ペン跡を保存しました (${drawingPaths.size}ページ)`)
        }
      } catch (error) {
        addStatusMessage(`❌ 保存失敗: ${error}`)
      }
    }, 1000) // 1秒後に保存（頻繁な保存を避けるため）

    return () => clearTimeout(timer)
  }, [drawingPaths, pdfId])

  // ページ番号が変更されたら保存
  useEffect(() => {
    if (!pdfId) return
    if (answerRegistrationMode) return // 解答登録モードの時はページ位置を保存しない

    const savePageNumber = async () => {
      try {
        const record = await getPDFRecord(pdfId)
        if (record) {
          record.lastPageNumber = pageNum
          record.lastOpened = Date.now()
          await savePDFRecord(record)
          console.log(`💾 現在のページ番号 (${pageNum}) を保存しました`)
        }
      } catch (error) {
        console.error('ページ番号の保存失敗:', error)
      }
    }

    savePageNumber()
  }, [pageNum, pdfId])

  // 利用可能なモデル一覧を取得
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await getAvailableModels()
        setAvailableModels(response.models)
        setDefaultModel(response.default)
        console.log('🤖 利用可能なモデル:', response.models)
      } catch (error) {
        console.error('モデル一覧の取得失敗:', error)
      }
    }

    fetchModels()
  }, [])

  // ポップアップの外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPenPopup || showEraserPopup) {
        const target = event.target as HTMLElement
        // ポップアップやボタン以外をクリックした場合は閉じる
        if (!target.closest('.tool-popup') && !target.closest('button')) {
          setShowPenPopup(false)
          setShowEraserPopup(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPenPopup, showEraserPopup])

  // 保存されているペン跡を読み込む（PDF読み込み完了後）
  useEffect(() => {
    if (numPages === 0) return

    const loadDrawings = async () => {
      try {
        const record = await getPDFRecord(pdfId) // pdfIdはpropsから来ているのでクロージャで参照可能
        if (record && record.drawings && Object.keys(record.drawings).length > 0) {
          const restoredMap = new Map<number, DrawingPath[]>()
          Object.entries(record.drawings).forEach(([pageNumStr, jsonStr]) => {
            const pageNum = parseInt(pageNumStr, 10)
            const paths = JSON.parse(jsonStr) as DrawingPath[]
            restoredMap.set(pageNum, paths)
          })
          setDrawingPaths(restoredMap)
        }
      } catch (error) {
        console.error('ペン跡の復元に失敗:', error)
      }
    }

    loadDrawings()
  }, [numPages, pdfId])

  // 初回ロード時のフラグ（ローカル描画用）
  const [isInitialDrawLoad, setIsInitialDrawLoad] = useState(true)
  const [isInitialPositionSet, setIsInitialPositionSet] = useState(false)


  // ページレンダリング完了通知を受け取るコールバック
  const handlePageRendered = () => {
    // 描画キャンバスのサイズを更新
    if (drawingCanvasRef.current && canvasRef.current) {
      if (drawingCanvasRef.current.width !== canvasRef.current.width) {
        drawingCanvasRef.current.width = canvasRef.current.width
      }
      if (drawingCanvasRef.current.height !== canvasRef.current.height) {
        drawingCanvasRef.current.height = canvasRef.current.height
      }
    }

    // 矩形選択Canvas（canvas-wrapperの外にあるので、wrapperサイズに合わせる）
    if (selectionCanvasRef.current && wrapperRef.current) {
      const wrapper = wrapperRef.current
      if (selectionCanvasRef.current.width !== wrapper.clientWidth) {
        selectionCanvasRef.current.width = wrapper.clientWidth
      }
      if (selectionCanvasRef.current.height !== wrapper.clientHeight) {
        selectionCanvasRef.current.height = wrapper.clientHeight
      }
    }

    // 初回ロードフラグをクリア
    if (isInitialDrawLoad) {
      setIsInitialDrawLoad(false)
    }

    // ページ読み込み後、自動的に画面フィット＆中央配置（初回のみ）
    if (isInitialDrawLoad) {
      requestAnimationFrame(() => {
        applyFitAndCenter()

        // renderPage完了を通知（これにより再描画useEffectがトリガーされる）
        setRenderCompleteCounter(prev => prev + 1)
      })
    } else {
      setRenderCompleteCounter(prev => prev + 1)
    }
  }

  // 初回ロード時: PDFを中央に配置
  useEffect(() => {
    if (!isInitialDrawLoad && !isInitialPositionSet && canvasRef.current && wrapperRef.current) {
      const wrapper = wrapperRef.current
      const canvas = canvasRef.current

      // canvas幅が設定されるまで待つ
      if (canvas.width === 0 || canvas.height === 0) return

      const wrapperWidth = wrapper.clientWidth
      const wrapperHeight = wrapper.clientHeight

      // zoom=1/3 での表示サイズ
      const displayWidth = canvas.width * zoom
      const displayHeight = canvas.height * zoom

      // 中央配置のためのpanOffset計算
      const centerX = (wrapperWidth - displayWidth) / 2
      const centerY = (wrapperHeight - displayHeight) / 2

      setPanOffset({ x: centerX, y: centerY })
      setIsInitialPositionSet(true)

      // 配置完了後、次のフレームでcanvasを表示
      requestAnimationFrame(() => {
        const canvasLayer = document.querySelector('.canvas-layer') as HTMLElement
        if (canvasLayer) {
          canvasLayer.style.opacity = '1'
        }
      })
    }
  }, [isInitialDrawLoad, isInitialPositionSet, zoom])

  // 画面フィット＆中央配置の共通関数
  // forceSet: trueの場合は常にfitZoomに設定、falseの場合は最小値チェックのみ
  const applyFitAndCenter = (forceSet: boolean = true) => {
    if (!canvasRef.current || !containerRef.current || !wrapperRef.current) return

    const container = containerRef.current
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    // canvas は RENDER_SCALE でレンダリングされている
    // 実際のPDFサイズは canvas.width / RENDER_SCALE
    const actualPdfWidth = canvas.width / RENDER_SCALE
    const actualPdfHeight = canvas.height / RENDER_SCALE

    // 画面にフィットさせるスケールを計算
    const scaleX = containerWidth / actualPdfWidth
    const scaleY = containerHeight / actualPdfHeight
    const fitScale = Math.min(scaleX, scaleY) * 0.90 // 90%に縮小して余白を確保（特にiPadで下部が見切れないように）

    // fitScale は実際のPDF基準なので、zoom値に変換
    // zoom = fitScale / RENDER_SCALE
    const fitZoom = fitScale / RENDER_SCALE

    // zoom範囲 1.0 / RENDER_SCALE ～ 2.0 に制限 (1000%まで)
    const clampedZoom = Math.max(1.0 / RENDER_SCALE, Math.min(2.0, fitZoom))

    // フィット時のズーム値を保存（これより小さくしようとしたらフィット表示に戻す）
    setMinFitZoom(clampedZoom)

    // forceSet=trueの場合は常にfitZoomに設定、falseの場合は最小値チェックのみ
    if (forceSet) {
      setZoom(clampedZoom)
    } else {
      setZoom(prevZoom => Math.max(clampedZoom, prevZoom))
    }

    // 中央配置を計算（wrapperを基準に）
    const wrapperWidth = wrapper.clientWidth
    const wrapperHeight = wrapper.clientHeight
    const displayWidth = canvas.width * clampedZoom
    const displayHeight = canvas.height * clampedZoom

    const centerX = (wrapperWidth - displayWidth) / 2
    const centerY = (wrapperHeight - displayHeight) / 2

    setPanOffset({ x: centerX, y: centerY })
  }

  // applyFitAndCenter 関数を ref に保存（useZoomPan から呼び出せるように）
  applyFitAndCenterRef.current = applyFitAndCenter
  // 描画機能（パスとして保存）


  // ズーム機能（3倍プリレンダリング戦略：画面にフィットするzoomを計算して中央配置）
  const resetZoom = () => {
    applyFitAndCenter()
  }

  // ウィンドウリサイズ時にminFitZoomを更新（最小値チェックのみ）
  useEffect(() => {
    const handleResize = () => {
      applyFitAndCenter(false)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [canvasRef.current?.width, canvasRef.current?.height])

  // Ctrl+Z でアンドゥ機能
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        undo()
        addStatusMessage('↩️ 元に戻しました')
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [addStatusMessage])

  /**
   * ピンチズーム用の状態管理（正しい実装）
   *
   * touchstart時の初期値を保存し、touchmoveでは初期値から毎回計算
   * これにより累積誤差が発生しない
   */
  const initialPinchDistanceRef = useRef<number | null>(null)
  const initialScaleRef = useRef<number>(1)
  const initialPanOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const pinchCenterRef = useRef<{ x: number; y: number } | null>(null)

  /**
   * タッチ開始ハンドラ（ピンチズーム & スワイプページ送り）
   */
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // 2本指のピンチズーム
    if (e.touches.length === 2) {
      e.preventDefault()
      const t1 = e.touches[0]
      const t2 = e.touches[1]

      // 2点間の距離
      const dx = t1.clientX - t2.clientX
      const dy = t1.clientY - t2.clientY
      const distance = Math.sqrt(dx * dx + dy * dy)

      // 初期値を保存
      initialPinchDistanceRef.current = distance
      initialScaleRef.current = zoom
      initialPanOffsetRef.current = { x: panOffset.x, y: panOffset.y }

      // ピンチの中心点（wrapper基準の座標）
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect()
        pinchCenterRef.current = {
          x: (t1.clientX + t2.clientX) / 2 - rect.left,
          y: (t1.clientY + t2.clientY) / 2 - rect.top
        }
      }
    }
  }

  /**
   * 2本指タッチ移動ハンドラ（ピンチズーム）
   *
   * 公式: newOrigin = pinchCenter - (pinchCenter - initialOrigin) × (newScale / initialScale)
   * これにより、ピンチ中心点が指す内容は常に同じ位置に留まる
   */
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || initialPinchDistanceRef.current === null || !pinchCenterRef.current) {
      return
      // 消しゴムモード時は1本指タッチでもカーソル位置を追跡（Apple Pencil対応）
      if (isEraserMode && e.touches.length === 1 && containerRef.current) {
        const touch = e.touches[0]
        const rect = containerRef.current.getBoundingClientRect()
        setEraserCursorPos({
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top
        })
      }
    }

    e.preventDefault()
    const t1 = e.touches[0]
    const t2 = e.touches[1]

    // 現在の距離
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    const currentDistance = Math.sqrt(dx * dx + dy * dy)

    // スケール比率
    const ratio = currentDistance / initialPinchDistanceRef.current
    // プリレンダリング: zoom範囲 minFitZoom ～ 2.0
    let newZoom = Math.max(minFitZoom, Math.min(2.0, initialScaleRef.current * ratio))

    // 現在の指の中心位置（wrapper基準）
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const currentPinchCenterX = (t1.clientX + t2.clientX) / 2 - rect.left
    const currentPinchCenterY = (t1.clientY + t2.clientY) / 2 - rect.top

    // ピンチ開始時の中心点を基準にした位置計算
    const newOriginX = pinchCenterRef.current.x -
      (pinchCenterRef.current.x - initialPanOffsetRef.current.x) * (newZoom / initialScaleRef.current)
    const newOriginY = pinchCenterRef.current.y -
      (pinchCenterRef.current.y - initialPanOffsetRef.current.y) * (newZoom / initialScaleRef.current)

    // 指の移動によるパン
    const panX = currentPinchCenterX - pinchCenterRef.current.x
    const panY = currentPinchCenterY - pinchCenterRef.current.y

    setPanOffset({ x: newOriginX + panX, y: newOriginY + panY })
    setZoom(newZoom)
  }

  /**
   * タッチ終了ハンドラ（ピンチズーム終了）
   */
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    // ピンチズーム終了
    if (e.touches.length < 2) {
      initialPinchDistanceRef.current = null
      pinchCenterRef.current = null
    }
  }

  // 描画モードの切り替え
  const toggleDrawingMode = () => {
    if (isDrawingMode) {
      // ペンモード中にクリックした場合はポップアップをトグル
      setShowPenPopup(!showPenPopup)
    } else {
      // ペンモードOFFの場合は、ペンモードをONにする
      setIsDrawingMode(true)
      setIsEraserMode(false) // 消しゴムモードをオフ
      setIsSelectionMode(false) // 採点モードをオフ
      setSelectionRect(null) // 選択範囲をクリア
      setSelectionPreview(null) // プレビューをクリア
      setShowPenPopup(false) // ポップアップは閉じる
      setShowEraserPopup(false) // 消しゴムポップアップを閉じる
      // 選択キャンバスをクリア
      if (selectionCanvasRef.current) {
        const ctx = selectionCanvasRef.current.getContext('2d')!
        ctx.clearRect(0, 0, selectionCanvasRef.current.width, selectionCanvasRef.current.height)
      }
      console.log('描画モード: ON')
    }
  }

  // 消しゴムモードの切り替え
  const toggleEraserMode = () => {
    if (isEraserMode) {
      // 消しゴムモード中にクリックした場合はポップアップをトグル
      setShowEraserPopup(!showEraserPopup)
    } else {
      // 消しゴムモードOFFの場合は、消しゴムモードをONにする
      setIsEraserMode(true)
      setIsDrawingMode(false) // 描画モードをオフ
      setIsSelectionMode(false) // 採点モードをオフ
      setSelectionRect(null) // 選択範囲をクリア
      setSelectionPreview(null) // プレビューをクリア
      setShowEraserPopup(false) // ポップアップは閉じる
      setShowPenPopup(false) // ペンポップアップを閉じる
      // 選択キャンバスをクリア
      if (selectionCanvasRef.current) {
        const ctx = selectionCanvasRef.current.getContext('2d')!
        ctx.clearRect(0, 0, selectionCanvasRef.current.width, selectionCanvasRef.current.height)
      }
      console.log('消しゴムモード: ON')
    }
  }


  // クリア機能（現在のページのみ）
  const clearDrawing = () => {
    // 履歴保存（空の状態を追加したいが、undoロジック次第）
    // とりあえず現状維持

    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      newMap.delete(pageNum)
      return newMap
    })
    addStatusMessage('描画をクリアしました')
  }

  // すべてのページの描画をクリア
  const clearAllDrawings = async () => {
    if (!confirm('すべてのページのペン跡を削除しますか？この操作は取り消せません。')) {
      return
    }

    setDrawingPaths(new Map())
    setHistory([])

    // IndexedDBからも削除
    try {
      // getPDFRecord等はimportされている前提だが、念の為
      const record = await getPDFRecord(pdfId)
      if (record) {
        record.drawings = {}
        await savePDFRecord(record)
        console.log('すべてのペン跡を削除しました:', pdfId)
        addStatusMessage('🗑️ すべてのペン跡を削除しました')
      }
    } catch (error) {
      console.error('ペン跡の削除に失敗:', error)
      addStatusMessage('❌ ペン跡の削除に失敗しました')
    }
  }

  // 解答登録処理（指定ページ以降を全て処理）
  const processAnswersFromPage = async (startPage: number) => {
    const pdfDoc = pdfCanvasRef.current?.pdfDoc
    if (!pdfDoc || !canvasRef.current) return

    setShowAnswerStartDialog(false)
    setIsProcessingAnswers(true)
    setAnswersProcessed(0)

    try {
      console.log(`🎓 解答登録開始: ページ ${startPage} からページ ${numPages} まで`)
      addStatusMessage(`🎓 解答登録開始 (${startPage}→${numPages})`)

      // === フェーズ1: 全ページを処理して解答を収集 ===
      interface CollectedAnswer {
        pdfPage: number
        problemNumber: string
        correctAnswer: string
        problemPage: number | null  // 処理後のページ参照（なければnull）
        sectionName?: string
        // AIの生データ（デバッグ用）
        rawAiProblemPage?: number | string | null
        rawAiSectionName?: string | null
      }

      const allAnswers: CollectedAnswer[] = []
      const sectionBoundaries: { pdfPage: number; problemPage: number }[] = []

      for (let page = startPage; page <= numPages; page++) {
        console.log(`📄 [フェーズ1] ページ ${page} を解析中...`)

        // Canvas to image for this page
        const pdfPage = await pdfDoc.getPage(page)
        const viewport = pdfPage.getViewport({ scale: 2 })

        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = viewport.width
        tempCanvas.height = viewport.height
        const ctx = tempCanvas.getContext('2d')!

        await pdfPage.render({
          canvasContext: ctx,
          viewport: viewport
        }).promise

        const imageData = tempCanvas.toDataURL('image/jpeg', 0.9)

        // API呼び出し: ページを解析 (api.tsのanalyzePage関数を使用)
        const { analyzePage } = await import('../../services/api')
        const result = await analyzePage(imageData, page)

        if (result.success && result.pageType === 'answer' && result.data.answers) {
          for (const answer of result.data.answers) {
            // デバッグ: AIからの応答を詳しく表示
            console.log(`🔍 AI応答 [PDFページ${page}]:`, {
              problemNumber: answer.problemNumber,
              correctAnswer: answer.correctAnswer,
              problemPage: answer.problemPage,
              sectionName: answer.sectionName
            })

            let problemPage: number | null = null

            // 1. sectionNameから明示的なページ番号を抽出（最も信頼性が高い）
            if (answer.sectionName) {
              // 「第○回」のようなセッション番号を除外
              const sessionPattern = /第[0-9０-９]+回/
              const hasSessionNumber = sessionPattern.test(answer.sectionName)

              // ページを明示するパターンのみを抽出
              const pagePatterns = [
                /(?:p\.?|page)\s*([0-9０-９]+)/i,                    // p.6, page 6
                /問題[はが]?\s*([0-9０-９]+)\s*(?:ページ)/i,          // 問題は6ページ
                /([0-9０-９]+)\s*ページ/,                            // 6ページ (ただし「第29回」は除外)
              ]

              for (const pattern of pagePatterns) {
                const match = answer.sectionName.match(pattern)
                if (match && match[1]) {
                  let numStr = match[1]
                  numStr = numStr.replace(/[０-９]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                  const extractedPage = parseInt(numStr, 10)

                  // 妥当性チェック: ページ番号が妥当な範囲内か
                  if (!isNaN(extractedPage) && extractedPage > 0 && extractedPage < 1000) {
                    problemPage = extractedPage
                    console.log(`📄 sectionNameからページ番号抽出: "${answer.sectionName}" → ${problemPage}`)
                    break
                  }
                }
              }

              // セッション番号が含まれていてページ番号が見つからない場合は警告
              if (hasSessionNumber && problemPage === null) {
                console.log(`⚠️ セッション番号を検出（ページ番号ではない）: "${answer.sectionName}"`)
              }
            }

            // 2. AIが直接返したproblemPageを使用（sectionNameから抽出できなかった場合のみ）
            if (problemPage === null && answer.problemPage != null) {
              if (typeof answer.problemPage === 'number') {
                // 妥当性チェック: AIが返した値が合理的か
                if (answer.problemPage > 0 && answer.problemPage < page) {
                  problemPage = answer.problemPage
                  console.log(`📄 AIのproblemPageを使用: ${problemPage}`)
                } else {
                  console.log(`⚠️ AIのproblemPage(${answer.problemPage})は不正な値のため無視`)
                }
              } else if (typeof answer.problemPage === 'string') {
                const match = answer.problemPage.toString().match(/\d+/)
                if (match) {
                  const parsed = parseInt(match[0], 10)
                  if (parsed > 0 && parsed < page) {
                    problemPage = parsed
                    console.log(`📄 AIのproblemPage(文字列)を使用: ${problemPage}`)
                  }
                }
              }
            }


            // 新しいセクションを検出
            if (problemPage !== null) {
              const lastBoundary = sectionBoundaries[sectionBoundaries.length - 1]
              if (!lastBoundary || lastBoundary.problemPage !== problemPage) {
                sectionBoundaries.push({ pdfPage: page, problemPage })
                console.log(`📌 セクション境界検出: PDFページ ${page} → 問題ページ ${problemPage}`)
              }
            }

            allAnswers.push({
              pdfPage: page,
              problemNumber: answer.problemNumber,
              correctAnswer: answer.correctAnswer,
              problemPage,
              sectionName: answer.sectionName,
              // AIの生データを保存（デバッグ用）
              rawAiProblemPage: answer.problemPage,
              rawAiSectionName: answer.sectionName
            })
          }
        }

        setAnswersProcessed(Math.floor((page - startPage + 1) / 2))  // フェーズ1は50%
      }

      console.log(`📊 フェーズ1完了: ${allAnswers.length}件の解答を収集、${sectionBoundaries.length}個のセクション境界を検出`)

      // === フェーズ2: セクション境界を元に遡及的にページ番号を割り当て ===
      const { saveAnswers, generateAnswerId } = await import('../../utils/indexedDB')

      // シンプルな「Fill-Down（下方向への塗りつぶし）」戦略
      // リストは順序通りに来るため、新しいセクションが見つかるまで前のセクションを継続する
      let currentSectionPage: number | null | undefined = undefined
      let hasExplicitPageRef = false

      const assignedAnswers = allAnswers.map(answer => {
        let updatedFromSectionName = false
        hasExplicitPageRef = false // フラグをリセット

        // 1. セクション名からページ番号を抽出（最強のソース）
        if (answer.sectionName) {
          // 様々なページ参照パターンを抽出（全角数字対応）
          // - "p.6", "p6", "Page 6"
          // - "6ページ", "○○ページ"
          // - "問題は6ページ", "問題6ページ"
          // - "<問題は6ページ>"
          const patterns = [
            /(?:p\.?|page)\s*([0-9０-９]+)/i,                    // p.6, page 6
            /([0-9０-９]+)\s*(?:ページ|page)/i,                  // 6ページ
            /問題[はが]?\s*([0-9０-９]+)\s*(?:ページ)?/i,         // 問題は6ページ, 問題6
            /<[^>]*?([0-9０-９]+)\s*(?:ページ)[^>]*>/i,          // <問題は6ページ>
          ]

          for (const pattern of patterns) {
            const match = answer.sectionName.match(pattern)
            if (match && match[1]) {
              let numStr = match[1]
              // 全角数字を半角に変換
              numStr = numStr.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))

              const extractedPage = parseInt(numStr, 10)
              if (!isNaN(extractedPage)) {
                currentSectionPage = extractedPage
                updatedFromSectionName = true
                hasExplicitPageRef = true
                console.log(`🏷️ セクション名からページ抽出: "${answer.sectionName}" → ${currentSectionPage}`)
                break  // 最初にマッチしたパターンを使用
              }
            }
          }
        }

        // 2. 明示的なページ参照がある場合（セクション名からの抽出ができなかった場合のみ採用）
        if (answer.problemPage !== null) {
          if (!updatedFromSectionName) {
            currentSectionPage = answer.problemPage
            hasExplicitPageRef = true
          }
        }

        // 3. リセットロジック（重要）:
        // 新しい大問（1番など）が始まり、かつ明示的なページ指定がない場合、
        // 前のセクションからの継続（Fill-Down）を断ち切るためにリセットする
        if (!hasExplicitPageRef) {
          const n = (answer.problemNumber || '').replace(/\s+/g, '').toLowerCase()
          // "1", "1(1)", "問1", "question1" などで始まる場合
          if (n === '1' || n.startsWith('1(') || n.startsWith('問1') || n.startsWith('question1')) {
            console.log(`🔄 新しいセクションの開始を検出（ページ指定なし）: "${answer.problemNumber}" → リセット`)
            currentSectionPage = undefined // nullではなくundefinedにして「不明」扱いにする
          }
        }

        const assignedPage = currentSectionPage !== null ? currentSectionPage : undefined



        if (assignedPage) {
          console.log(`📎 割り当て: ${answer.problemNumber} → 問題ページ ${assignedPage} ${answer.problemPage !== null ? '(明示的)' : '(継続)'}`)
        }

        return {
          id: generateAnswerId(pdfId, answer.pdfPage, answer.problemNumber),
          pdfId: pdfId,
          pageNumber: answer.pdfPage,
          problemPageNumber: assignedPage,
          problemNumber: answer.problemNumber,
          correctAnswer: answer.correctAnswer,
          sectionName: answer.sectionName,
          createdAt: Date.now(),
          // AIの生データを保存（デバッグ用）
          rawAiResponse: {
            problemPage: answer.rawAiProblemPage ?? null,
            sectionName: answer.rawAiSectionName ?? null
          }
        }
      })

      // 保存
      await saveAnswers(assignedAnswers)
      console.log(`✅ フェーズ2完了: ${assignedAnswers.length}件の解答を保存`)

      // 統計を出力
      const withPageRef = assignedAnswers.filter(a => a.problemPageNumber !== undefined).length
      console.log(`📊 統計: ページ参照あり ${withPageRef}/${assignedAnswers.length} (${Math.round(withPageRef / assignedAnswers.length * 100)}%)`)

      setAnswersProcessed(numPages - startPage + 1)
      addStatusMessage(`✅ 完了! ${assignedAnswers.length}件の解答を登録しました`)
      console.log('🎉 解答登録完了!')

      // 3秒後に管理画面に戻る
      setTimeout(() => {
        if (onBack) onBack()
      }, 3000)

    } catch (error) {
      console.error('❌ 解答登録エラー:', error)
      addStatusMessage('❌ 解答登録エラー')
    } finally {
      setIsProcessingAnswers(false)
    }
  }

  // 採点開始（範囲選択モードに切り替え）
  const startGrading = () => {
    addStatusMessage('📱 採点モード開始')
    setIsSelectionMode(true)
    setIsDrawingMode(false) // 描画モードをオフ
    setIsEraserMode(false) // 消しゴムモードをオフ
    setShowPenPopup(false) // ポップアップを閉じる
    setShowEraserPopup(false) // ポップアップを閉じる
    setSelectionRect(null) // 選択をクリア
    addStatusMessage('採点モード: 範囲を選択してください')
    addStatusMessage('📐 採点範囲を選択してください')
  }

  // 矩形選択モードをキャンセル（フックの関数を使用し、キャンバスもクリア）
  const handleCancelSelection = () => {
    cancelSelection() // フックの関数を呼び出す
    if (selectionCanvasRef.current) {
      const ctx = selectionCanvasRef.current.getContext('2d')!
      ctx.clearRect(0, 0, selectionCanvasRef.current.width, selectionCanvasRef.current.height)
    }
    addStatusMessage('採点モードをキャンセル')
  }

  // 確認ポップアップから採点を実行
  const confirmAndGrade = () => {
    setSelectionPreview(null) // ポップアップを閉じる
    submitForGrading()
  }

  // 確認ポップアップをキャンセル
  const cancelPreview = () => {
    setSelectionPreview(null)
    // 選択範囲は保持して、再選択できるようにする
  }

  // 矩形選択の開始（フックの関数を使用）
  const startSelection = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Ctrl押下中は選択しない（パン操作を優先）
    if (e.ctrlKey || e.metaKey) return
    if (!isSelectionMode || !selectionCanvasRef.current) return

    const canvas = selectionCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    hookStartSelection(canvas, x, y)
  }

  // 矩形選択の更新（フックの関数を使用）
  const updateSelection = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !isSelectionMode || !selectionCanvasRef.current) return

    const canvas = selectionCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    hookUpdateSelection(canvas, x, y)
  }

  // 矩形選択の終了（フックの関数を使用）
  const finishSelection = () => {
    if (!canvasRef.current || !drawingCanvasRef.current) return
    hookFinishSelection(canvasRef.current, drawingCanvasRef.current, zoom, panOffset, RENDER_SCALE, selectionCanvasRef.current)
  }

  // 採点機能
  const submitForGrading = async () => {
    if (!drawingCanvasRef.current || !canvasRef.current) return

    setIsGrading(true)
    setGradingError(null) // エラーをクリア
    try {
      console.log('📱 採点開始 - デバイス情報:', {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        canvasWidth: canvasRef.current.width,
        canvasHeight: canvasRef.current.height,
        selectionRect: selectionRect,
        hasSelectionPreview: !!selectionPreview
      })

      let croppedImageData: string
      let fullPageImageData: string

      // selectionPreviewがある場合は、それを直接使用（確認ダイアログで表示された画像）
      // これにより座標変換の問題を回避
      if (selectionPreview) {
        console.log('✅ 確認ダイアログの画像を使用')
        croppedImageData = selectionPreview
      } else if (selectionRect) {
        // selectionPreviewがない場合の旧ロジック（後方互換性のため残す）
        console.log('⚠️ selectionPreviewが存在しないため、座標から画像を生成')

        // PDFと手書きを合成した画像を作成
        const tempCanvas = document.createElement('canvas')
        const pdfCanvas = canvasRef.current

        const { startX, startY, endX, endY } = selectionRect
        const x = Math.min(startX, endX)
        const y = Math.min(startY, endY)
        const width = Math.abs(endX - startX)
        const height = Math.abs(endY - startY)

        console.log('📐 選択範囲:', { x, y, width, height })

        // 選択範囲が小さすぎる場合はエラー
        if (width < 10 || height < 10) {
          setGradingError('選択範囲が小さすぎます。もう少し大きな範囲を選択してください。')
          setIsGrading(false)
          return
        }

        // iPad対応: 最大解像度制限（メモリ節約のため）
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        const maxWidth = isIOS ? 800 : 1600
        const maxHeight = isIOS ? 800 : 1600
        let targetWidth = width
        let targetHeight = height

        // アスペクト比を維持しながら縮小
        if (width > maxWidth || height > maxHeight) {
          const scale = Math.min(maxWidth / width, maxHeight / height)
          targetWidth = Math.round(width * scale)
          targetHeight = Math.round(height * scale)
          console.log(`画像を縮小: ${width}x${height} → ${targetWidth}x${targetHeight}`)
        }

        // 切り出し用のキャンバスを作成
        try {
          tempCanvas.width = targetWidth
          tempCanvas.height = targetHeight
        } catch (error) {
          console.error('❌ Canvas作成エラー:', error)
          throw new Error(`Canvas作成失敗 (${targetWidth}x${targetHeight}): ${error instanceof Error ? error.message : String(error)}`)
        }

        const ctx = tempCanvas.getContext('2d')
        if (!ctx) {
          throw new Error('Canvas 2Dコンテキストの取得に失敗しました')
        }

        // 高品質な縮小処理
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        try {
          // PDFの選択範囲を描画（縮小あり）
          ctx.drawImage(pdfCanvas, x, y, width, height, 0, 0, targetWidth, targetHeight)

          // 手書きの選択範囲を重ねる（縮小あり）
          ctx.drawImage(drawingCanvasRef.current, x, y, width, height, 0, 0, targetWidth, targetHeight)
        } catch (error) {
          console.error('❌ Canvas描画エラー:', error)
          throw new Error(`Canvas描画失敗: ${error instanceof Error ? error.message : String(error)}`)
        }

        console.log('✅ 選択範囲を採点:', { x, y, width, height, targetWidth, targetHeight })

        // 合成した画像を圧縮してBase64に変換
        try {
          croppedImageData = compressImage(tempCanvas, 1024)
        } catch (error) {
          console.error('❌ Image compression failed:', error)
          throw new Error(`画像圧縮エラー: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else {
        // 選択範囲がない場合はエラー
        throw new Error('選択範囲が指定されていません')
      }

      // フルページ画像を生成（低解像度）
      const fullPageCanvas = document.createElement('canvas')
      const pdfCanvas = canvasRef.current

      // フルページ画像（問題構造認識用に高解像度）
      const fullPageScale = 0.5  // 50%に縮小（問題番号の認識精度向上のため）
      fullPageCanvas.width = Math.round(pdfCanvas.width * fullPageScale)
      fullPageCanvas.height = Math.round(pdfCanvas.height * fullPageScale)

      const fullPageCtx = fullPageCanvas.getContext('2d')!
      fullPageCtx.imageSmoothingEnabled = true
      fullPageCtx.imageSmoothingQuality = 'medium'

      // PDFのみ描画（手書きは不要）
      fullPageCtx.drawImage(pdfCanvas, 0, 0, fullPageCanvas.width, fullPageCanvas.height)
      fullPageImageData = compressImage(fullPageCanvas, 800)

      // データサイズをログ出力
      const croppedSizeKB = Math.round(croppedImageData.length / 1024)
      const fullPageSizeKB = Math.round(fullPageImageData.length / 1024)
      console.log(`送信画像サイズ: 選択=${croppedSizeKB}KB, フルページ=${fullPageSizeKB}KB`)

      // 文脈ベース採点APIに送信
      console.log('🎯 文脈ベース採点APIに送信中...', { model: selectedModel })
      const { gradeWorkWithContext } = await import('../../services/api')
      const response = await gradeWorkWithContext(
        fullPageImageData,
        croppedImageData,
        pageNum,
        selectedModel !== 'default' ? selectedModel : undefined
      )

      if (response.success) {
        setGradingError(null)
        setGradingModelName(response.modelName || null)
        setGradingResponseTime(response.responseTime || null)
        // 採点成功後も選択モード（採点モード）を維持（連続して再採点できるように）

        // 採点履歴を保存（クライアント側で正解判定）
        try {
          if (response.result.problems && response.result.problems.length > 0) {
            const { getAnswersByPdfId } = await import('../../utils/indexedDB')
            const registeredAnswers = await getAnswersByPdfId(pdfId)

            console.log(`📚 登録済み解答: ${registeredAnswers.length}件`)
            console.log(`📦 解答リスト:`, registeredAnswers.map(a => ({
              problemNumber: a.problemNumber,
              correctAnswer: a.correctAnswer,
              pageNumber: a.pageNumber,
              problemPageNumber: a.problemPageNumber
            })))

            for (const problem of response.result.problems) {
              console.log(`🎯 AI検出: 問題番号="${problem.problemNumber}", 生徒解答="${problem.studentAnswer}"`)

              // 解答を正規化する関数
              const normalizeAnswer = (answer: string): string => {
                return answer
                  .toLowerCase()
                  .replace(/\s+/g, '') // 全ての空白を削除
                  .replace(/°|度/g, '') // 度記号を削除
                  .replace(/[Xx×]/g, '*') // 掛け算記号を統一
                  .replace(/[（(]/g, '(') // 括弧を統一
                  .replace(/[）)]/g, ')')
                  .replace(/,/g, '.') // カンマをピリオドに
                  .trim()
              }

              // 問題番号を正規化する関数（スペースと括弧の形式を統一）
              const normalizeProblemNumber = (pn: string): string => {
                if (!pn) return ''
                return pn
                  .replace(/\s+/g, '') // スペースを削除: "1 (1)" → "1(1)"
                  .replace(/（/g, '(')  // 全角括弧を半角に
                  .replace(/）/g, ')')
                  .toLowerCase()
                  .trim()
              }

              // === マッチングロジック: セクション → 問題番号の順で絞り込み ===
              const normalizedAiProblem = normalizeProblemNumber(problem.problemNumber)

              // AIが検出した印刷されたページ番号を取得
              const printedPage = problem.printedPageNumber || response.result.printedPageNumber
              console.log(`📄 AIが検出した印刷ページ番号: ${printedPage ?? '(検出できず)'}`)

              // デバッグ: すべての登録済み解答の正規化結果を表示
              console.log('🔍 デバッグ: 問題番号の比較')
              console.log(`   AI検出: "${problem.problemNumber}" → 正規化: "${normalizedAiProblem}"`)
              registeredAnswers.slice(0, 10).forEach((ans, i) => {
                const normalized = normalizeProblemNumber(ans.problemNumber)
                const isMatch = normalized === normalizedAiProblem
                console.log(`   DB[${i}]: "${ans.problemNumber}" → 正規化: "${normalized}" ${isMatch ? '✅ MATCH' : ''} (problemPageNumber: ${ans.problemPageNumber})`)
              })
              if (registeredAnswers.length > 10) {
                console.log(`   ... 残り ${registeredAnswers.length - 10} 件`)
              }

              let matchedAnswer: typeof registeredAnswers[0] | undefined = undefined

              if (printedPage) {
                // Step 1: まずセクション（ページ番号）で絞り込み
                // printedPage以下で最大のproblemPageNumberを持つセクションを特定
                const allPageNumbers = registeredAnswers
                  .map(a => a.problemPageNumber)
                  .filter((p): p is number => p !== undefined && p <= printedPage)

                if (allPageNumbers.length > 0) {
                  const targetSectionPage = Math.max(...allPageNumbers)
                  console.log(`📂 対象セクション: 問題ページ ${targetSectionPage} (印刷ページ ${printedPage} 以下で最大)`)

                  // Step 2: 対象セクション内で問題番号でマッチング
                  const sectionAnswers = registeredAnswers.filter(ans =>
                    ans.problemPageNumber === targetSectionPage
                  )

                  const matchingInSection = sectionAnswers.filter(ans => {
                    if (!ans.problemNumber) return false
                    const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                    return normalizedDbProblem === normalizedAiProblem
                  })

                  if (matchingInSection.length === 1) {
                    matchedAnswer = matchingInSection[0]
                    console.log(`✅ セクション${targetSectionPage}内で一意に特定`)
                  } else if (matchingInSection.length > 1) {
                    console.log(`⚠️ セクション${targetSectionPage}内に${matchingInSection.length}件の候補 → AIの判定を使用`)
                  } else {
                    // セクション内に見つからない場合、問題番号でグローバル検索
                    console.log(`⚠️ セクション${targetSectionPage}内に問題「${problem.problemNumber}」が見つかりません → グローバル検索`)

                    const matchingAnswers = registeredAnswers.filter(ans => {
                      if (!ans.problemNumber) return false
                      const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                      return normalizedDbProblem === normalizedAiProblem
                    })

                    if (matchingAnswers.length === 1) {
                      matchedAnswer = matchingAnswers[0]
                      console.log(`✅ 問題番号「${problem.problemNumber}」の解答が一意に特定されました (グローバル検索)`)
                    } else if (matchingAnswers.length > 1) {
                      // 複数候補がある場合、印刷ページに最も近いものを選択
                      const closest = matchingAnswers.reduce((prev, curr) => {
                        const prevDist = Math.abs((prev.problemPageNumber ?? 9999) - printedPage)
                        const currDist = Math.abs((curr.problemPageNumber ?? 9999) - printedPage)
                        return currDist < prevDist ? curr : prev
                      })
                      matchedAnswer = closest
                      console.log(`📍 ${matchingAnswers.length}件の候補から最も近いページ(${closest.problemPageNumber})の解答を選択`)
                    }
                  }
                } else {
                  console.log(`⚠️ 印刷ページ${printedPage}以下のセクションが見つかりません → AIの判定を使用`)
                }
              } else {
                // 印刷ページが検出できなかった場合のフォールバック
                console.log(`⚠️ 印刷ページ番号が検出できませんでした → PDFページ番号(${pageNum})を使用`)

                // PDFページ番号を使ってセクションを推定
                // NOTE: PDFページ番号と印刷ページ番号は必ずしも一致しないが、近い値であることが多い
                const allPageNumbers = registeredAnswers
                  .map(a => a.problemPageNumber)
                  .filter((p): p is number => p !== undefined && p <= pageNum)

                if (allPageNumbers.length > 0) {
                  const targetSectionPage = Math.max(...allPageNumbers)
                  console.log(`📂 PDFページ${pageNum}から推定されるセクション: 問題ページ ${targetSectionPage}`)

                  // セクション内で問題番号でマッチング
                  const sectionAnswers = registeredAnswers.filter(ans =>
                    ans.problemPageNumber === targetSectionPage
                  )

                  const matchingInSection = sectionAnswers.filter(ans => {
                    if (!ans.problemNumber) return false
                    const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                    return normalizedDbProblem === normalizedAiProblem
                  })

                  if (matchingInSection.length === 1) {
                    matchedAnswer = matchingInSection[0]
                    console.log(`✅ セクション${targetSectionPage}内で一意に特定 (PDFページベース)`)
                  } else if (matchingInSection.length > 1) {
                    console.log(`⚠️ セクション${targetSectionPage}内に${matchingInSection.length}件の候補 → AIの判定を使用`)
                  } else {
                    // セクション内に見つからない場合、問題番号のみでマッチング
                    console.log(`⚠️ セクション${targetSectionPage}内に問題「${problem.problemNumber}」が見つかりません`)

                    const matchingAnswers = registeredAnswers.filter(ans => {
                      if (!ans.problemNumber) return false
                      const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                      return normalizedDbProblem === normalizedAiProblem
                    })

                    if (matchingAnswers.length === 1) {
                      matchedAnswer = matchingAnswers[0]
                      console.log(`✅ 問題番号「${problem.problemNumber}」の解答が一意に特定されました (全体検索)`)
                    } else if (matchingAnswers.length > 1) {
                      console.log(`⚠️ ${matchingAnswers.length}件の候補があります → AIの判定を使用`)
                    }
                  }
                } else {
                  // セクションが見つからない場合、問題番号のみでマッチング（後方互換性）
                  const matchingAnswers = registeredAnswers.filter(ans => {
                    if (!ans.problemNumber) return false
                    const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                    return normalizedDbProblem === normalizedAiProblem
                  })

                  if (matchingAnswers.length === 1) {
                    matchedAnswer = matchingAnswers[0]
                    console.log(`✅ 問題番号「${problem.problemNumber}」の解答が一意に特定されました`)
                  } else if (matchingAnswers.length > 1) {
                    console.log(`⚠️ ${matchingAnswers.length}件の候補があります → AIの判定を使用`)
                  }
                }
              }

              // ログ出力
              console.log(`🔎 マッチング結果: 問題番号="${problem.problemNumber}" (正規化: "${normalizedAiProblem}"), 印刷ページ=${printedPage ?? '不明'}, PDFページ=${pageNum}`)
              console.log(`   見つかった解答:`, matchedAnswer ? { problemNumber: matchedAnswer.problemNumber, correctAnswer: matchedAnswer.correctAnswer, pageNumber: matchedAnswer.pageNumber, problemPageNumber: matchedAnswer.problemPageNumber } : '(AI判定を使用)')


              let isCorrect = false
              let correctAnswer = ''
              let feedback = ''
              let explanation = ''
              let gradingSource = 'ai' // デフォルトはAI

              // === 新しいロジック: AI優先、DBはフォールバック ===

              // Step 1: まずAIの判定を採用
              isCorrect = problem.isCorrect || false
              correctAnswer = problem.correctAnswer || ''
              feedback = problem.feedback || ''
              explanation = problem.explanation || ''

              console.log(`🤖 AI判定: 問題${problem.problemNumber} → ${isCorrect ? '✓ 正解' : '✗ 不正解'}`)

              // Step 2: AIが「不正解」と判定した場合のみ、DBを確認（セーフティネット）
              if (!isCorrect && matchedAnswer) {
                const normalizedStudent = normalizeAnswer(problem.studentAnswer)
                const normalizedDbCorrect = normalizeAnswer(matchedAnswer.correctAnswer)

                console.log(`📚 DB確認（AIが不正解と判定したため）:`)
                console.log(`   生徒: "${problem.studentAnswer}" → "${normalizedStudent}"`)
                console.log(`   DB正解: "${matchedAnswer.correctAnswer}" → "${normalizedDbCorrect}"`)

                // DBの正解と生徒の解答が一致すれば、正解に上書き
                if (normalizedStudent === normalizedDbCorrect) {
                  isCorrect = true
                  correctAnswer = matchedAnswer.correctAnswer
                  feedback = '正解です！よくできました！'
                  explanation = `正解は ${correctAnswer} です。`
                  gradingSource = 'db_override' // DBで上書きしたことを記録
                  console.log(`   ✅ DBで正解に上書き！`)
                } else {
                  console.log(`   ❌ DBでも不一致、AIの判定を維持`)
                }
              }

              // Step 3: AIが正解と判定した場合はそのまま
              if (problem.isCorrect) {
                gradingSource = 'ai'
              }

              const historyRecord = {
                id: generateGradingHistoryId(),
                pdfId: pdfId,
                pdfFileName: pdfRecord.fileName,
                pageNumber: pageNum,
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

              // 表示用にも判定結果を更新
              problem.isCorrect = isCorrect
              problem.correctAnswer = correctAnswer
              problem.feedback = feedback
              problem.explanation = explanation

              // 採点ソース情報を追加（デバッグ・確認用）
              problem.gradingSource = gradingSource
              if (matchedAnswer && gradingSource === 'db_override') {
                problem.dbMatchedAnswer = {
                  problemNumber: matchedAnswer.problemNumber,
                  correctAnswer: matchedAnswer.correctAnswer,
                  problemPageNumber: matchedAnswer.problemPageNumber,
                  pageNumber: matchedAnswer.pageNumber
                }
              }
            }

            // 更新された結果を表示に反映
            setGradingResult({
              ...response.result,
              problems: response.result.problems
            })

            console.log('採点履歴を保存しました:', response.result.problems.length, '件')
            addStatusMessage(`✅ 採点履歴を保存しました (${response.result.problems.length}問)`)
          }
        } catch (error) {
          console.error('採点履歴の保存に失敗:', error)
          addStatusMessage('⚠️ 採点履歴の保存に失敗しました')
        }
      } else {
        setGradingError('採点に失敗しました: ' + (response.error || '不明なエラー'))
      }
    } catch (error) {
      console.error('❌ 採点エラー:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      // エラーメッセージをより分かりやすくする
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        setGradingError('サーバーに接続できませんでした。ネットワーク接続とバックエンドサーバーの起動状態を確認してください。')
        addStatusMessage('❌ サーバー接続エラー')
      } else if (errorMessage.includes('503') || errorMessage.includes('overloaded')) {
        setGradingError('Google AIが過負荷状態です。しばらく待ってから再度お試しください。')
        addStatusMessage('⚠️ AI過負荷')
      } else if (errorMessage.includes('Canvas作成') || errorMessage.includes('Canvas描画')) {
        setGradingError(`画像処理エラー: ${errorMessage}\n\nPDFの解像度が高すぎる可能性があります。ページをズームアウトしてから再度お試しください。`)
        addStatusMessage('❌ Canvas処理エラー')
      } else if (errorMessage.includes('toDataURL') || errorMessage.includes('画像変換')) {
        setGradingError(`画像変換エラー: ${errorMessage}\n\niPadのメモリ不足の可能性があります。他のアプリを閉じてから再度お試しください。`)
        addStatusMessage('❌ 画像変換エラー')
      } else {
        setGradingError('採点中にエラーが発生しました: ' + errorMessage)
        addStatusMessage('❌ 採点エラー')
      }
    } finally {
      setIsGrading(false)
    }
  }

  // ページ移動
  const handleGoToPrevPage = () => {
    if (pageNum > 1) {
      goToPrevPage()
    }
  }

  const handleGoToNextPage = () => {
    if (pageNum < numPages) {
      goToNextPage()
    }
  }

  // 10ページ単位の移動（ボタン用）
  const handleGoToPrev10Pages = () => {
    const newPage = Math.max(1, pageNum - 10)
    if (newPage !== pageNum) {
      setPageNum(newPage)
    }
  }

  const handleGoToNext10Pages = () => {
    const newPage = Math.min(numPages, pageNum + 10)
    if (newPage !== pageNum) {
      setPageNum(newPage)
    }
  }

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-viewer">
        <div className="toolbar">
          {/* 戻るボタン */}
          {onBack && (
            <button onClick={onBack} title="管理画面に戻る">
              🏠
            </button>
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

                {/* ズーム操作 */}
                <button onClick={resetZoom} title="画面に合わせる">
                  <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>
                    {/* 左上への矢印 */}
                    <path fill='currentColor' d='M4,4 L4,9 L6,9 L6,6 L9,6 L9,4 Z M4,4 L2,6 L6,6 Z M4,4 L6,2 L6,6 Z' />
                    {/* 右上への矢印 */}
                    <path fill='currentColor' d='M20,4 L20,9 L18,9 L18,6 L15,6 L15,4 Z M20,4 L22,6 L18,6 Z M20,4 L18,2 L18,6 Z' />
                    {/* 左下への矢印 */}
                    <path fill='currentColor' d='M4,20 L4,15 L6,15 L6,18 L9,18 L9,20 Z M4,20 L2,18 L6,18 Z M4,20 L6,22 L6,18 Z' />
                    {/* 右下への矢印 */}
                    <path fill='currentColor' d='M20,20 L20,15 L18,15 L18,18 L15,18 L15,20 Z M20,20 L22,18 L18,18 Z M20,20 L18,22 L18,18 Z' />
                  </svg>
                </button>
                <span className="zoom-info">{displayZoom}%</span>
              </>
            )}
          </div>

        </div>

        <div
          className="canvas-container"
          ref={containerRef}
          onMouseDown={startPanning}
          onMouseMove={(e) => {
            doPanning(e)
            // 消しゴムモード時はカーソル位置を追跡
            if (isEraserMode && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect()
              setEraserCursorPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
              })
            }
          }}
          onMouseUp={stopPanning}
          onMouseLeave={() => {
            stopPanning()
            setEraserCursorPos(null)
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            cursor: isPanning ? 'grabbing' : (isCtrlPressed && !isDrawingMode ? 'grab' : 'default'),
            overflow: 'hidden',
            touchAction: 'none', // ブラウザのデフォルトタッチ動作を無効化
            position: 'relative' // デバッグマーカーの基準点
          }}
        >
          {isLoading && <div className="loading">読み込み中...</div>}
          {error && (
            <div className="error-message">
              <h3>❌ エラー</h3>
              <p style={{ whiteSpace: 'pre-line' }}>{error}</p>
              {onBack && (
                <button
                  onClick={onBack}
                  style={{
                    marginTop: '16px',
                    padding: '10px 20px',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  🏠 管理画面に戻る
                </button>
              )}
              <details style={{ marginTop: '16px' }}>
                <summary>詳細情報</summary>
                <pre>
                  PDF ID: {pdfId}
                  {'\n'}File Name: {pdfRecord.fileName}
                </pre>
              </details>
            </div>
          )}

          <div className="canvas-wrapper" ref={wrapperRef}>
            <div
              className="canvas-layer"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                transition: 'none',
                opacity: isInitialPositionSet ? 1 : 0
              }}
            >
              <PDFCanvas
                ref={pdfCanvasRef}
                pdfRecord={pdfRecord}
                containerRef={containerRef}
                canvasRef={canvasRef}
                renderScale={RENDER_SCALE}
                onLoadStart={handleLoadStart}
                onLoadSuccess={handleLoadSuccess}
                onLoadError={handleLoadError}
                onPageRendered={handlePageRendered}
                onPageChange={handlePageChange}
              />
              <DrawingCanvas
                ref={drawingCanvasRef}
                width={canvasRef.current?.width}
                height={canvasRef.current?.height}
                className="drawing-canvas"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  pointerEvents: (isDrawingMode || isEraserMode) && !isCtrlPressed ? 'auto' : 'none'
                }}
                tool={isEraserMode ? 'eraser' : 'pen'}
                color={penColor}
                size={penSize}
                eraserSize={eraserSize}
                paths={drawingPaths?.get(pageNum) || []}
                isCtrlPressed={isCtrlPressed}
                stylusOnly={false}
                onPathAdd={handlePathAddWrapper}
                onPathsChange={handlePathsChangeWrapper}
                onUndo={undo}
              />
            </div>

            {/* 矩形選択Canvas（transformの影響を受けないようにcanvas-layerの外に配置） */}
            <canvas
              ref={selectionCanvasRef}
              className="selection-canvas"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                cursor: isSelectionMode ? 'crosshair' : 'default',
                pointerEvents: isSelectionMode ? 'auto' : 'none',
                touchAction: 'none'
              }}
              onMouseDown={startSelection}
              onMouseMove={updateSelection}
              onMouseUp={finishSelection}
              onMouseLeave={finishSelection}
              onTouchStart={(e) => {
                if (!isSelectionMode || !selectionCanvasRef.current) return
                // 2本指以上の場合はズーム/パン操作なので選択処理をスキップ
                if (e.touches.length > 1) return
                e.preventDefault()
                const touch = e.touches[0]
                const canvas = selectionCanvasRef.current
                const rect = canvas.getBoundingClientRect()
                const x = touch.clientX - rect.left
                const y = touch.clientY - rect.top
                hookStartSelection(canvas, x, y)
              }}
              onTouchMove={(e) => {
                if (!isSelecting || !isSelectionMode || !selectionCanvasRef.current) return
                // 2本指以上の場合はズーム/パン操作なので選択処理をスキップ
                if (e.touches.length > 1) return
                e.preventDefault()
                const touch = e.touches[0]
                const canvas = selectionCanvasRef.current
                const rect = canvas.getBoundingClientRect()
                const x = touch.clientX - rect.left
                const y = touch.clientY - rect.top
                hookUpdateSelection(canvas, x, y)
              }}
              onTouchEnd={(e) => {
                if (!isSelectionMode || !canvasRef.current || !drawingCanvasRef.current) return
                // 2本指以上でタッチ開始していた場合は選択終了しない
                if (e.changedTouches.length > 1 || !isSelecting) return
                e.preventDefault()
                hookFinishSelection(canvasRef.current, drawingCanvasRef.current, zoom, panOffset, RENDER_SCALE, selectionCanvasRef.current)
              }}
            />

          </div>

          {/* 消しゴムの範囲表示（半透明円）- canvas-containerの直下に配置 */}
          {isEraserMode && eraserCursorPos && (
            <div
              style={{
                position: 'absolute',
                left: `${eraserCursorPos.x}px`,
                top: `${eraserCursorPos.y}px`,
                width: `${eraserSize * 2 * zoom}px`,
                height: `${eraserSize * 2 * zoom}px`,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 100, 100, 0.2)',
                border: '2px solid rgba(255, 100, 100, 0.6)',
                pointerEvents: 'none',
                transform: 'translate(-50%, -50%)',
                zIndex: 9999
              }}
            />
          )}

          {/* ページナビゲーション（右端） */}
          {numPages > 1 && (
            <div className="page-scrollbar-container">
              {/* 前の10ページボタン */}
              <button
                className="page-nav-button"
                onClick={handleGoToPrev10Pages}
                disabled={pageNum <= 1}
                title="前の10ページ"
              >
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '0.6' }}>
                  <span>▲</span>
                  <span>▲</span>
                </div>
              </button>

              {/* 前の1ページボタン */}
              <button
                className="page-nav-button"
                onClick={handleGoToPrevPage}
                disabled={pageNum <= 1}
                title="前のページ"
              >
                <span>▲</span>
              </button>

              {/* ページスライダー（縦向き） */}
              <div className="page-slider-wrapper">
                <input
                  type="range"
                  min="1"
                  max={numPages}
                  value={pageNum}
                  onChange={(e) => {
                    const newPage = Number(e.target.value)
                    pdfCanvasRef.current?.goToPage(newPage)
                  }}
                  className="page-slider"
                  title="ページ移動"
                />
              </div>

              {/* 次の1ページボタン */}
              <button
                className="page-nav-button"
                onClick={handleGoToNextPage}
                disabled={pageNum >= numPages}
                title="次のページ"
              >
                <span>▼</span>
              </button>

              {/* 次の10ページボタン */}
              <button
                className="page-nav-button"
                onClick={handleGoToNext10Pages}
                disabled={pageNum >= numPages}
                title="次の10ページ"
              >
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '0.6' }}>
                  <span>▼</span>
                  <span>▼</span>
                </div>
              </button>

              {/* ページインジケーター */}
              <div className="page-indicator">
                {pageNum}/{numPages}
              </div>
            </div>
          )}
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
                <button onClick={cancelPreview} className="cancel-button">
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
                現在のページ（<strong>{pageNum}</strong>）から<br />
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
                  onClick={() => processAnswersFromPage(pageNum)}
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
                {answersProcessed} / {numPages - pageNum + 1} ページ処理済み
              </p>
              <div style={{
                width: '300px',
                height: '8px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${(answersProcessed / (numPages - pageNum + 1)) * 100}%`,
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
