import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react'
import { PDFFileRecord } from '../../utils/indexedDB'
import PDFCanvas, { PDFCanvasHandle } from './components/PDFCanvas'
import { DrawingPath, DrawingCanvas, useDrawing, useZoomPan, doPathsIntersect, isScratchPattern, useLassoSelection } from '@thousands-of-ties/drawing-common'
import { RENDER_SCALE } from '../../constants/pdf'
import './StudyPanel.css'

interface PDFPaneProps {
    pdfRecord: PDFFileRecord
    pdfDoc: any // pdfjsLib.PDFDocumentProxy | null
    pageNum: number
    onPageChange: (page: number) => void

    // 描画ツール
    drawingPaths: DrawingPath[]
    onPathAdd: (path: DrawingPath) => void
    onPathsChange: (paths: DrawingPath[]) => void
    onUndo?: () => void
    tool: 'pen' | 'eraser' | 'none'
    color: string
    size: number
    eraserSize: number
    isCtrlPressed: boolean

    // スプリット表示モード（高さフィット＋左寄せ）
    splitMode?: boolean

    // レイアウト
    className?: string
    style?: React.CSSProperties
}

export interface PDFPaneHandle {
    resetZoom: () => void
    zoomIn: () => void
    zoomOut: () => void
    undo: () => void
    getCanvas: () => HTMLCanvasElement | null
    pdfDoc: any | null
    // Pinch zoom control methods
    getZoom: () => number
    setZoomValue: (zoom: number) => void
    getPanOffset: () => { x: number, y: number }
    setPanOffsetValue: (offset: { x: number, y: number }) => void
    getContainerRect: () => DOMRect | null
}

export const PDFPane = forwardRef<PDFPaneHandle, PDFPaneProps>((props, ref) => {
    const {
        pdfRecord,
        pdfDoc,
        pageNum,
        onPageChange,
        drawingPaths,
        onPathAdd,
        onPathsChange,
        onUndo,
        tool,
        color,
        size,
        eraserSize,
        isCtrlPressed,
        splitMode = false,
        className,
        style
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingCanvasRef = useRef<HTMLCanvasElement>(null)

    // ズーム/パン
    const {
        zoom,
        panOffset,
        isPanning,
        startPanning,
        doPanning,
        stopPanning,
        resetZoom,
        setZoom,
        setPanOffset,
        fitToScreen,
        applyPanLimit,
        getFitToScreenZoom,
        overscroll,
        setOverscroll,
        resetOverscroll
    } = useZoomPan(containerRef, RENDER_SCALE, 0.1, () => { }, canvasRef)

    // ページナビゲーション
    const numPages = pdfDoc ? pdfDoc.numPages : 0

    // ナビゲーションハンドラ
    const goToPrevPage = () => {
        if (pageNum > 1) onPageChange(pageNum - 1)
    }
    const goToNextPage = () => {
        if (pageNum < numPages) onPageChange(pageNum + 1)
    }
    const goToPrev10Pages = () => {
        onPageChange(Math.max(1, pageNum - 10))
    }
    const goToNext10Pages = () => {
        onPageChange(Math.min(numPages, pageNum + 10))
    }

    // Ref for stable access to overscroll in callbacks
    const overscrollRef = useRef(overscroll)
    useEffect(() => {
        overscrollRef.current = overscroll
    }, [overscroll])

    const SWIPE_THRESHOLD = window.innerHeight * 0.08

    // スワイプ判定と完了処理
    // useCallbackで定義し、依存配列を空にしてuseEffectから安全に呼べるようにする
    // （値はrefから取る）
    const checkAndFinishSwipe = React.useCallback(() => {
        const currentOverscroll = overscrollRef.current

        if (currentOverscroll.y > SWIPE_THRESHOLD) {
            if (pageNum > 1) {
                goToPrevPage()
            }
        } else if (currentOverscroll.y < -SWIPE_THRESHOLD) {
            if (pageNum < numPages) {
                goToNextPage()
            }
        }
        resetOverscroll()
    }, [pageNum, numPages, onPageChange, resetOverscroll]) // pageNumなどは変わるので依存に入れる

    // グローバルなMouseUp監視（ドラッグ中に外に出た場合などを救済）
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isPanning) {
                stopPanning()
                checkAndFinishSwipe()
            }
        }
        window.addEventListener('mouseup', handleGlobalMouseUp)
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }, [isPanning, checkAndFinishSwipe])

    // キャンバスサイズの状態（DrawingCanvas との同期用）
    const [canvasSize, setCanvasSize] = React.useState<{ width: number, height: number } | null>(null)

    // レイアウト準備完了フラグ（ジャンプ防止用）
    const [isLayoutReady, setIsLayoutReady] = React.useState(false)

    // 初回フィット完了フラグ（ズームレベル保持のため、ページ変更後はfitToScreenしない）
    const initialFitDoneRef = useRef(false)

    // splitMode変更時は再フィットを実行
    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return

        // console.log('📏 PDFPane: splitMode変更、再フィット実行', { splitMode })

        const containerH = containerRef.current.clientHeight
        const maxH = window.innerHeight - 120
        const effectiveH = (containerH > window.innerHeight) ? maxH : containerH

        fitToScreen(
            canvasRef.current.width,
            canvasRef.current.height,
            effectiveH,
            splitMode ? { fitToHeight: true, alignLeft: true } : undefined
        )
        setIsLayoutReady(true)
    }, [splitMode, fitToScreen])

    // RAFキャンセル用ref
    const rafIdRef = useRef<number | null>(null)

    // 2本指タップでUndo用
    const twoFingerTapRef = useRef<{ time: number, startPos: { x: number, y: number }[] } | null>(null)

    // Gesture State for Pinch/Pan
    const gestureRef = useRef<{
        type: 'pan' | 'pinch',
        startZoom: number,
        startPan: { x: number, y: number },
        startDist: number,
        startCenter: { x: number, y: number },
        rect: DOMRect
    } | null>(null)

    // Page Rendered Handler

    const handlePageRendered = () => {
        // console.log('🏁 PDFPane: handlePageRendered triggered')
        if (!canvasRef.current || !containerRef.current) return

        setCanvasSize({
            width: canvasRef.current.width,
            height: canvasRef.current.height
        })

        // Log canvas size
        // console.log('📏 PDFPane: Canvas size captured', {
        //     width: canvasRef.current.width,
        //     height: canvasRef.current.height
        // })

        // Cancel any pending RAF
        if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current)
        }

        // Run fit logic in next frame to ensure layout is settled
        // Double RAF to wait for paint
        rafIdRef.current = requestAnimationFrame(() => {
            // console.log('⏳ PDFPane: RAF 1 executing')
            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null
                // console.log('⏳ PDFPane: RAF 2 executing')

                if (!canvasRef.current || !containerRef.current) {
                    // console.error('❌ PDFPane: canvasRef is null in RAF')
                    return
                }

                try {
                    const containerH = containerRef.current.clientHeight
                    const maxH = window.innerHeight - 120
                    const effectiveH = (containerH > window.innerHeight) ? maxH : containerH

                    // 初回のみfitToScreen、以降はズームレベルを維持
                    if (!initialFitDoneRef.current) {
                        // console.log('📏 PDFPane: 初回フィット実行', { containerH, effectiveH, splitMode })
                        fitToScreen(
                            canvasRef.current.width,
                            canvasRef.current.height,
                            effectiveH,
                            splitMode ? { fitToHeight: true, alignLeft: true } : undefined
                        )
                        initialFitDoneRef.current = true
                    } else {
                        // console.log('📏 PDFPane: ズームレベル維持（ページ変更）')
                    }
                } catch (e) {
                    // console.error('❌ PDFPane: Error in fitToScreen', e)
                }

                // Show content after fitting
                setIsLayoutReady(true)
            })
        })
    }

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current)
            }
        }
    }, [])

    // Refs for stable access in ResizeObserver
    const isPanningRef = useRef(isPanning)
    const fitToScreenRef = useRef(fitToScreen)

    useEffect(() => {
        isPanningRef.current = isPanning
    }, [isPanning])

    useEffect(() => {
        fitToScreenRef.current = fitToScreen
    }, [fitToScreen])

    // Note: ResizeObserver removed - リサイズ時の自動フィットは不要
    // 初回表示時のみfitToScreenを実行（handlePageRenderedで処理）

    // Reset layout ready when page changes
    useEffect(() => {
        setIsLayoutReady(false)
    }, [pageNum, pdfRecord.id])


    // Manual Eraser Logic - Segment-level erasing (carves through lines)
    // IMPORTANT: Path coordinates are stored as NORMALIZED values (0-1)
    const handleErase = (x: number, y: number) => {
        const currentPaths = drawingPathsRef.current
        if (currentPaths.length === 0) return

        // Get canvas dimensions for normalization
        const cw = canvasSize?.width || canvasRef.current?.width || 1
        const ch = canvasSize?.height || canvasRef.current?.height || 1

        // Normalize eraser position to 0-1 range (same as path coordinates)
        const normalizedEraserX = x / cw
        const normalizedEraserY = y / ch

        // Eraser size also needs to be normalized (relative to canvas width)
        const normalizedEraserSize = eraserSize / cw

        // Check if point is within eraser radius
        const isPointErased = (point: { x: number; y: number }) => {
            const dx = point.x - normalizedEraserX
            const dy = point.y - normalizedEraserY
            const dist = Math.sqrt(dx * dx + dy * dy)
            return dist < normalizedEraserSize
        }

        let hasChanges = false
        const newPaths: DrawingPath[] = []

        currentPaths.forEach(path => {
            // Split path into segments based on erased points
            const segments: { x: number; y: number }[][] = []
            let currentSegment: { x: number; y: number }[] = []

            path.points.forEach(point => {
                if (isPointErased(point)) {
                    // Point is erased - end current segment if it has points
                    if (currentSegment.length > 1) {
                        segments.push(currentSegment)
                    }
                    currentSegment = []
                    hasChanges = true
                } else {
                    // Point is kept - add to current segment
                    currentSegment.push(point)
                }
            })

            // Don't forget the last segment
            if (currentSegment.length > 1) {
                segments.push(currentSegment)
            }

            // Convert segments back to paths
            segments.forEach(segment => {
                newPaths.push({
                    ...path,
                    points: segment
                })
            })
        })

        if (hasChanges) {
            onPathsChange(newPaths)
        }
    }

    // Ref for stable access to drawingPaths in callbacks
    const drawingPathsRef = useRef(drawingPaths)
    useEffect(() => {
        drawingPathsRef.current = drawingPaths
    }, [drawingPaths])


    // Drawing Hook (Interaction Only)
    // IMPORTANT: Use drawingCanvasRef NOT canvasRef - we draw on DrawingCanvas, not PDF canvas
    const {
        isDrawing: isDrawingInternal,
        startDrawing,
        draw,
        stopDrawing,
        cancelDrawing
    } = useDrawing(drawingCanvasRef, {
        width: size, // Pen size always for useDrawing (since it's only for pen now)
        color: color,
        onPathComplete: (path) => {
            // console.log('✍️ PDFPane: onPathComplete', { pathLength: path.points.length })
            // Do not add the path if it was recognized as a scratch gesture
            if (isScratchPattern(path)) {
                // console.log('🚫 PDFPane: Ignoring scratch path from permanent storage')
                return
            }
            // 新しい方式：描画完了時にはnagewaチェックしない（長押しで発動）
            onPathAdd(path)
        },
        onScratchComplete: (scratchPath) => {
            // console.log('⚡ PDFPane: onScratchComplete', { points: scratchPath.points.length })
            const currentPaths = drawingPathsRef.current
            const pathsToKeep = currentPaths.filter(existingPath =>
                !doPathsIntersect(scratchPath, existingPath)
            )

            if (pathsToKeep.length < currentPaths.length) {
                // console.log("✂️ Scratch detected! Erasing paths.", { before: currentPaths.length, after: pathsToKeep.length })
                onPathsChange(pathsToKeep)
            } else {
                // console.log("⚡ Scratch detected but NO intersection found.", { currentPaths: currentPaths.length })
            }
        }
    })

    // Lasso Selection Hook (長押しベース)
    const {
        selectionState,
        hasSelection,
        startLongPress,
        cancelLongPress,
        checkLongPressMove,
        isPointInSelection,
        startDrag,
        drag,
        endDrag,
        clearSelection
    } = useLassoSelection(drawingPaths, onPathsChange, {
        onSelectionActivate: cancelDrawing
    })

    // Undo via Parent
    // Note: PDFPaneHandle.undo calls this.
    // If we want undo, we should likely expose a prop `onUndo` or handle it in parent.
    // `drawingPaths` is a prop, so undo should be managing that prop in parent.
    // But PDFPaneHandle has `undo`. 
    // We should implement it by modifying props... which we can't.
    // Parent should handle undo. But for now, if we remove localPaths, 
    // we need to tell parent to undo. 
    // Actually, StudyPanel has "undo" button calling `primaryPaneRef.current.undo`.
    // It should call `undo` function in StudyPanel instead!

    // For now, let's keep it working by having StudyPanel manage history if possible,
    // or just assume onPathAdd appends. 

    // Let's modify handleUndo to do nothing locally, necessitating Parent change?
    // User asked for "Necessary processing only". 
    // Storing duplicate paths in local state IS redundant.

    const handleUndo = () => {
        if (onUndo) {
            onUndo()
        }
    }

    // No local state sync needed




    useImperativeHandle(ref, () => ({
        resetZoom: () => {
            if (canvasRef.current && containerRef.current) {
                const containerH = containerRef.current.clientHeight
                const maxH = window.innerHeight - 120
                const effectiveH = (containerH > window.innerHeight) ? maxH : containerH
                fitToScreen(
                    canvasRef.current.width,
                    canvasRef.current.height,
                    effectiveH,
                    splitMode ? { fitToHeight: true, alignLeft: true } : undefined
                )
            } else {
                resetZoom()
            }
        },
        zoomIn: () => { setZoom(prev => Math.min(prev * 1.2, 5.0)) },
        zoomOut: () => { setZoom(prev => Math.max(prev / 1.2, 0.1)) },
        undo: handleUndo,
        // PDFキャンバスと描画キャンバスを合成して返す
        getCanvas: () => {
            const pdfCanvas = canvasRef.current
            if (!pdfCanvas) return null

            // DOM から DrawingCanvas を取得
            const drawingCanvas = containerRef.current?.querySelector('.drawing-canvas') as HTMLCanvasElement | null

            // 描画キャンバスがない、またはサイズが0の場合はPDFキャンバスのみ返す
            if (!drawingCanvas || drawingCanvas.width === 0 || drawingCanvas.height === 0) {
                return pdfCanvas
            }

            // 合成用の一時キャンバスを作成
            const compositeCanvas = document.createElement('canvas')
            compositeCanvas.width = pdfCanvas.width
            compositeCanvas.height = pdfCanvas.height
            const ctx = compositeCanvas.getContext('2d')
            if (!ctx) return pdfCanvas

            // PDFを描画
            ctx.drawImage(pdfCanvas, 0, 0)
            // 描画レイヤーを上に重ねる
            ctx.drawImage(drawingCanvas, 0, 0, pdfCanvas.width, pdfCanvas.height)

            return compositeCanvas
        },
        get pdfDoc() { return pdfDoc },
        // Pinch zoom control methods
        getZoom: () => zoom,
        setZoomValue: (newZoom: number) => { setZoom(Math.min(Math.max(newZoom, 0.1), 5.0)) },
        getPanOffset: () => panOffset,
        setPanOffsetValue: (offset: { x: number, y: number }) => { setPanOffset(offset) },
        getContainerRect: () => containerRef.current?.getBoundingClientRect() || null
    }), [splitMode, fitToScreen, resetZoom, setZoom, setPanOffset, zoom, panOffset, handleUndo, pdfDoc])

    // Eraser cursor state
    const [eraserCursorPos, setEraserCursorPos] = React.useState<{ x: number, y: number } | null>(null)

    // Debug Rendering (disabled for performance)
    // useEffect(() => {
    //     console.log('🖼️ PDFPane Render Status:', {
    //         zoom,
    //         panOffset,
    //         canvasDimensions: canvasRef.current ? { width: canvasRef.current.width, height: canvasRef.current.height } : 'null',
    //         containerDimensions: containerRef.current ? { width: containerRef.current.clientWidth, height: containerRef.current.clientHeight } : 'null',
    //         pdfDocAvailable: !!pdfDoc,
    //         numPages,
    //         isLayoutReady
    //     })
    // }, [zoom, panOffset, numPages, isLayoutReady])

    return (
        <div
            className={`canvas-container ${className || ''}`}
            ref={containerRef}
            style={{
                ...style,
                overflow: 'hidden',
                position: 'relative',
                touchAction: 'none',
                maxHeight: '100vh',
                // パン中はgrabbing、Ctrl押下中はgrab（全モード共通）
                cursor: isPanning ? 'grabbing' : (isCtrlPressed ? 'grab' : 'default')
            }}
            onPointerDown={(e) => {
                // タッチ操作はonTouchStartで処理（マルチタッチ対応のため）
                // ただし、ペン入力(pen)はここで処理する（Coalesced Eventsを利用するため）
                if (e.pointerType === 'touch') return

                // Ignore events on pager bar (Do this BEFORE capture)
                if ((e.target as HTMLElement).closest('.page-scrollbar-container')) return

                // マウス/ペンの場合はポインタキャプチャ（ウィンドウ外操作のため）
                (e.currentTarget as Element).setPointerCapture(e.pointerId)

                // Ctrl+ドラッグでパン（どのモードでも有効）
                if (isCtrlPressed) {
                    startPanning(e)
                    return
                }

                const rect = containerRef.current?.getBoundingClientRect()
                if (rect) {
                    const x = (e.clientX - rect.left - panOffset.x) / zoom
                    const y = (e.clientY - rect.top - panOffset.y) / zoom

                    // 正規化座標に変換
                    const cw = canvasSize?.width || canvasRef.current?.width || 1
                    const ch = canvasSize?.height || canvasRef.current?.height || 1
                    const normalizedPoint = { x: x / cw, y: y / ch }

                    if (tool === 'pen') {
                        // 選択中の場合
                        if (hasSelection) {
                            if (isPointInSelection(normalizedPoint)) {
                                // バウンディングボックス内 → ドラッグ開始
                                startDrag(normalizedPoint)
                                return
                            } else {
                                // バウンディングボックス外 → 選択解除
                                clearSelection()
                            }
                        }
                        // 長押し検出開始
                        startLongPress(normalizedPoint)
                        startDrawing(x, y)
                    } else if (tool === 'eraser') {
                        // 消しゴム時も選択を解除
                        if (hasSelection) clearSelection()
                        handleErase(x, y)
                    } else if (tool === 'none') {
                        // 選択/採点モード時もパン可能
                        startPanning(e)
                    }
                }
            }}
            onPointerMove={(e) => {
                // タッチ操作はonTouchMoveで処理
                if (e.pointerType === 'touch') return

                // Apple Pencil Pro hover support (消しゴムカーソル表示のみ)
                if (tool === 'eraser' && e.pointerType === 'pen') {
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (rect) {
                        setEraserCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }
                }

                // マウス/ペンの処理
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return

                // パン中またはCtrl押下中はパン処理
                if (isPanning || isCtrlPressed) {
                    doPanning(e)
                    return
                }

                // Coalesced Events (補間イベント) の取得
                // ペン入力時の高精細な軌跡を取得する
                // React Types may not have getCoalescedEvents on SyntheticEvent, use nativeEvent or cast
                // Logic: try getCoalescedEvents, fallback to [e]
                let events: any[] = []

                // @ts-ignore
                if (typeof e.getCoalescedEvents === 'function') {
                    // @ts-ignore
                    events = e.getCoalescedEvents()
                } else if (e.nativeEvent && typeof (e.nativeEvent as any).getCoalescedEvents === 'function') {
                    events = (e.nativeEvent as any).getCoalescedEvents()
                } else {
                    events = [e]
                }

                if (events.length === 0) events.push(e)

                events.forEach(ev => {
                    const x = (ev.clientX - rect.left - panOffset.x) / zoom
                    const y = (ev.clientY - rect.top - panOffset.y) / zoom

                    // 正規化座標に変換
                    const cw = canvasSize?.width || canvasRef.current?.width || 1
                    const ch = canvasSize?.height || canvasRef.current?.height || 1
                    const normalizedPoint = { x: x / cw, y: y / ch }

                    // 選択ドラッグ中
                    if (selectionState?.isDragging) {
                        // ドラッグは最後のイベントだけ処理すれば十分だが、追従性を良くするために全部処理しても良い
                        // ここではループごとに処理
                        drag(normalizedPoint)
                        return
                    }

                    if (tool === 'pen' && isDrawingInternal) {
                        // 長押しキャンセル判定（移動があれば）
                        checkLongPressMove(normalizedPoint)
                        draw(x, y)
                    } else if (tool === 'eraser') {
                        if (ev.buttons === 1) {
                            handleErase(x, y)
                        }
                    } else if (tool === 'none' && ev.buttons === 1) {
                        // 採点モードでドラッグ時もパン（ここは通常イベントだけでいいかもしれないが統一）
                        // 注: doPanningはReact.MouseEvent/PointerEventを期待しており、CoalescedEventはPointerEventなのでOK
                        // ただしdoPanningはmovementXなどを利用している可能性があるため、
                        // 本来はmain eventだけで良いが、パンは上で弾いているためここには来ないはず
                    }
                })

                // マウスの消しゴムカーソル更新 (Main event only)
                if (tool === 'eraser') {
                    setEraserCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                }
            }}
            onPointerUp={(e) => {
                // タッチはonTouchEndで処理
                if (e.pointerType === 'touch') return

                // リリースキャプチャ
                if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) {
                    (e.currentTarget as Element).releasePointerCapture(e.pointerId)
                }

                // 選択ドラッグ終了
                if (selectionState?.isDragging) {
                    endDrag()
                    return
                }
                // 長押しキャンセル
                cancelLongPress()
                stopDrawing()
                stopPanning()
                checkAndFinishSwipe()
            }}
            onPointerLeave={(e) => {
                // Clear eraser cursor when stylus leaves hover range
                if (tool === 'eraser' && e.pointerType === 'pen') {
                    setEraserCursorPos(null)
                }
            }}
            onTouchStart={(e) => {
                // Ignore events on pager bar
                if ((e.target as HTMLElement).closest('.page-scrollbar-container')) return

                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return

                // Palm Rejection & Coalesced Events Support:
                // ペン入力 (stylus) は Pointer Events で処理するため、ここでは無視する
                const hasStylus = Array.from(e.touches).some(t => {
                    // @ts-ignore
                    return t.touchType === 'stylus'
                })
                if (hasStylus) return

                if (e.touches.length === 2) {
                    // --- 2-Finger Gesture (Pinch/Pan) ---
                    const t1 = e.touches[0]
                    const t2 = e.touches[1]

                    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
                    const center = {
                        x: (t1.clientX + t2.clientX) / 2,
                        y: (t1.clientY + t2.clientY) / 2
                    }

                    // Store initial gesture state
                    gestureRef.current = {
                        type: 'pinch',
                        startZoom: zoom,
                        startPan: { ...panOffset },
                        startDist: dist,
                        startCenter: center,
                        rect
                    }

                    // For Undo Tap Detection
                    twoFingerTapRef.current = {
                        time: Date.now(),
                        startPos: [
                            { x: t1.clientX, y: t1.clientY },
                            { x: t2.clientX, y: t2.clientY }
                        ]
                    }
                } else if (e.touches.length === 1) {
                    // --- Single Touch (Finger) ---
                    const t = e.touches[0]

                    if (isCtrlPressed || (tool === 'none' && !isDrawingInternal)) {
                        // Pan Mode
                        gestureRef.current = {
                            type: 'pan',
                            startZoom: zoom,
                            startPan: { ...panOffset },
                            startDist: 0,
                            startCenter: { x: t.clientX, y: t.clientY },
                            rect
                        }
                    } else {
                        // Drawing/Erasing Mode with FINGER
                        // ペンツールの時、指での描画を許可するかどうか？
                        // 現在の実装では「スタイラスのみモード」フラグがない場合、指でも描ける
                        // ただし、もし `stylusOnly` propがあれば弾くべきだが、ここでは DrawingCanvas ではなく PDFPane のロジック。
                        // DrawingCanvas.tsx では stylusOnly チェックがあるが、PDFPane では useDrawing を直接読んでいる。
                        // 一旦、従来の挙動（指でも描ける）を維持する。

                        // ただし、この関数冒頭で stylus チェックをしているので、ここまで来るのは「指」のみ。

                        twoFingerTapRef.current = null
                        gestureRef.current = null

                        const x = (t.clientX - rect.left - panOffset.x) / zoom
                        const y = (t.clientY - rect.top - panOffset.y) / zoom

                        // 正規化座標に変換
                        const cw = canvasSize?.width || canvasRef.current?.width || 1
                        const ch = canvasSize?.height || canvasRef.current?.height || 1
                        const normalizedPoint = { x: x / cw, y: y / ch }

                        if (tool === 'pen') {
                            // 選択モード中の場合
                            if (hasSelection) {
                                if (isPointInSelection(normalizedPoint)) {
                                    startDrag(normalizedPoint)
                                    return
                                } else {
                                    clearSelection()
                                }
                            }
                            startLongPress(normalizedPoint)
                            startDrawing(x, y)
                        } else if (tool === 'eraser') {
                            if (hasSelection) clearSelection()
                            handleErase(x, y)
                        }
                    }
                }
            }}
            onTouchMove={(e) => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return

                // Check for stylus and ignore if present (handled by Pointer Events)
                const hasStylus = Array.from(e.touches).some(t => {
                    // @ts-ignore
                    return t.touchType === 'stylus'
                })
                if (hasStylus) return

                if (e.touches.length === 2) {
                    // Handle Pinch / 2-Finger Pan (only if in pinch mode)
                    if (gestureRef.current?.type === 'pinch') {
                        const t1 = e.touches[0]
                        const t2 = e.touches[1]

                        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
                        const center = {
                            x: (t1.clientX + t2.clientX) / 2,
                            y: (t1.clientY + t2.clientY) / 2
                        }

                        const { startZoom, startPan, startDist, startCenter } = gestureRef.current

                        // 1. Calculate New Zoom
                        const scale = dist / startDist
                        // 動的な最小倍率（Fitサイズ）を取得して制限を適用
                        const dynamicMinZoom = getFitToScreenZoom()
                        const newZoom = Math.min(Math.max(startZoom * scale, dynamicMinZoom), 5.0)

                        // 2. Calculate New Pan (Keep content under center stationary)
                        const startCenterRelX = startCenter.x - rect.left
                        const startCenterRelY = startCenter.y - rect.top

                        const contentX = (startCenterRelX - startPan.x) / startZoom
                        const contentY = (startCenterRelY - startPan.y) / startZoom

                        const centerRelX = center.x - rect.left
                        const centerRelY = center.y - rect.top

                        const newPanX = centerRelX - (contentX * newZoom)
                        const newPanY = centerRelY - (contentY * newZoom)

                        // パン制限を適用
                        const limitedOffset = applyPanLimit({ x: newPanX, y: newPanY }, newZoom)

                        // オーバースクロール計算 (Pinch/2-Finger Pan)
                        const OVERSCROLL_RESISTANCE = 0.6
                        const diffY = (newPanY - limitedOffset.y) * OVERSCROLL_RESISTANCE
                        setOverscroll({ x: 0, y: diffY })

                        setZoom(newZoom)
                        setPanOffset(limitedOffset)
                    }
                } else if (e.touches.length === 1) {
                    // --- Handle Single Touch (Finger) ---
                    const t = e.touches[0]

                    // 選択ドラッグ中の処理
                    if (selectionState?.isDragging) {
                        const x = (t.clientX - rect.left - panOffset.x) / zoom
                        const y = (t.clientY - rect.top - panOffset.y) / zoom
                        const cw = canvasSize?.width || canvasRef.current?.width || 1
                        const ch = canvasSize?.height || canvasRef.current?.height || 1
                        const normalizedPoint = { x: x / cw, y: y / ch }
                        drag(normalizedPoint)
                        return
                    }

                    if (gestureRef.current?.type === 'pan') {
                        // Pan Logic
                        const { startPan, startCenter } = gestureRef.current

                        const dx = t.clientX - startCenter.x
                        const dy = t.clientY - startCenter.y

                        // パン制限を適用
                        const limitedOffset = applyPanLimit({
                            x: startPan.x + dx,
                            y: startPan.y + dy
                        })

                        // オーバースクロール計算 (Touch)
                        const OVERSCROLL_RESISTANCE = 0.6
                        const rawY = startPan.y + dy
                        const diffY = (rawY - limitedOffset.y) * OVERSCROLL_RESISTANCE

                        setOverscroll({ x: 0, y: diffY })
                        setPanOffset(limitedOffset)

                    } else if (isDrawingInternal) {
                        // Drawing with Finger
                        const x = (t.clientX - rect.left - panOffset.x) / zoom
                        const y = (t.clientY - rect.top - panOffset.y) / zoom

                        // 正規化座標に変換
                        const cw = canvasSize?.width || canvasRef.current?.width || 1
                        const ch = canvasSize?.height || canvasRef.current?.height || 1
                        const normalizedPoint = { x: x / cw, y: y / ch }

                        if (tool === 'pen') {
                            checkLongPressMove(normalizedPoint)
                            draw(x, y)
                        } else if (tool === 'eraser') {
                            handleErase(x, y)
                        }
                    } else if (tool === 'eraser') {
                        // Eraser move (Finger)
                        const x = (t.clientX - rect.left - panOffset.x) / zoom
                        const y = (t.clientY - rect.top - panOffset.y) / zoom
                        handleErase(x, y)
                    }
                }
            }}
            onTouchEnd={(e) => {
                // 2本指タップでUndo判定
                if (twoFingerTapRef.current && e.touches.length === 0) {
                    const elapsed = Date.now() - twoFingerTapRef.current.time
                    if (elapsed < 300) {
                        handleUndo()
                    }
                    twoFingerTapRef.current = null
                }

                if (e.touches.length === 0) {
                    gestureRef.current = null
                }

                if (selectionState?.isDragging) {
                    endDrag()
                    return
                }

                cancelLongPress()
                stopDrawing()
                stopPanning()
                checkAndFinishSwipe()
            }}
        >
            <div className="canvas-wrapper" ref={wrapperRef}>
                <div
                    className="canvas-layer"
                    style={{
                        transform: `translate(${panOffset.x + overscroll.x}px, ${panOffset.y + overscroll.y}px) scale(${zoom})`,
                        transformOrigin: '0 0',
                        // ピンチ/パン操作中はtransitionを無効化（残像防止）
                        transition: (isPanning || gestureRef.current) ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        opacity: isLayoutReady ? 1 : 0,
                        visibility: isLayoutReady ? 'visible' : 'hidden'
                    }}
                >
                    <PDFCanvas
                        pdfDoc={pdfDoc}
                        containerRef={containerRef}
                        canvasRef={canvasRef}
                        renderScale={RENDER_SCALE}
                        pageNum={pageNum}
                        onPageRendered={handlePageRendered}
                    />
                    <DrawingCanvas
                        key={`drawing-${pageNum}`}
                        ref={drawingCanvasRef}
                        width={canvasSize?.width || 300}
                        height={canvasSize?.height || 150}
                        className="drawing-canvas"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            pointerEvents: 'none' // Interaction handled by parent (us)
                        }}
                        tool={tool === 'none' ? 'pen' : tool}
                        color={color}
                        size={size}
                        eraserSize={eraserSize}
                        paths={drawingPaths}
                        isCtrlPressed={isCtrlPressed}
                        stylusOnly={false}
                        selectionState={selectionState}
                        onPathAdd={() => { }} // Interaction handled by useDrawing hook in PDFPane
                    />
                </div>
            </div>

            {/* Overscroll Indicators */}
            {Math.abs(overscroll.y) > 5 && (
                <>
                    {/* Top Indicator (Prev Page) */}
                    {pageNum > 1 && overscroll.y > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            opacity: Math.min(overscroll.y / 50, 1),
                            pointerEvents: 'none',
                            transition: 'opacity 0.2s, color 0.2s',
                            color: overscroll.y > SWIPE_THRESHOLD ? '#007AFF' : '#888',
                            fontWeight: 'bold',
                            background: 'rgba(255,255,255,0.9)',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            zIndex: 10000,
                            userSelect: 'none'
                        }}>
                            {overscroll.y > SWIPE_THRESHOLD ? '↑ 離して前のページへ' : '↓ 引っ張って前のページ'}
                        </div>
                    )}

                    {/* Bottom Indicator (Next Page) */}
                    {pageNum < numPages && overscroll.y < 0 && (
                        <div style={{
                            position: 'absolute',
                            bottom: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            opacity: Math.min(-overscroll.y / 50, 1),
                            pointerEvents: 'none',
                            transition: 'opacity 0.2s, color 0.2s',
                            color: overscroll.y < -SWIPE_THRESHOLD ? '#007AFF' : '#888',
                            fontWeight: 'bold',
                            background: 'rgba(255,255,255,0.9)',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            zIndex: 10000,
                            userSelect: 'none'
                        }}>
                            {overscroll.y < -SWIPE_THRESHOLD ? '↓ 離して次のページへ' : '↑ 引っ張って次のページ'}
                        </div>
                    )}
                </>
            )}

            {/* Eraser Cursor */}
            {tool === 'eraser' && eraserCursorPos && (
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

            {/* Page Navigation (Right Side) */}
            {numPages > 1 && (
                <div className="page-scrollbar-container">
                    {/* Fit Screen */}
                    <button
                        className="page-nav-button"
                        onClick={() => {
                            if (canvasRef.current && containerRef.current) {
                                const containerH = containerRef.current.clientHeight
                                const maxH = window.innerHeight - 120
                                const effectiveH = (containerH > window.innerHeight) ? maxH : containerH
                                fitToScreen(
                                    canvasRef.current.width,
                                    canvasRef.current.height,
                                    effectiveH,
                                    splitMode ? { fitToHeight: true, alignLeft: true } : undefined
                                )
                            }
                        }}
                        title="画面に合わせる"
                        style={{ marginBottom: '8px' }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                    </button>

                    {/* Prev 10 */}
                    <button
                        className="page-nav-button"
                        onClick={goToPrev10Pages}
                        disabled={pageNum <= 1}
                        title="前の10ページ"
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '0.6' }}>
                            <span>▲</span>
                            <span>▲</span>
                        </div>
                    </button>

                    {/* Prev 1 */}
                    <button
                        className="page-nav-button"
                        onClick={goToPrevPage}
                        disabled={pageNum <= 1}
                        title="前のページ"
                    >
                        <span>▲</span>
                    </button>

                    {/* Slider */}
                    <div className="page-slider-wrapper">
                        <input
                            type="range"
                            min="1"
                            max={numPages}
                            value={pageNum}
                            onChange={(e) => onPageChange(Number(e.target.value))}
                            className="page-slider"
                            title="ページ移動"
                        />
                    </div>

                    {/* Next 1 */}
                    <button
                        className="page-nav-button"
                        onClick={goToNextPage}
                        disabled={pageNum >= numPages}
                        title="次のページ"
                    >
                        <span>▼</span>
                    </button>

                    {/* Next 10 */}
                    <button
                        className="page-nav-button"
                        onClick={goToNext10Pages}
                        disabled={pageNum >= numPages}
                        title="次の10ページ"
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '0.6' }}>
                            <span>▼</span>
                            <span>▼</span>
                        </div>
                    </button>

                    {/* Indicator */}
                    <div className="page-indicator">
                        {pageNum}/{numPages}
                    </div>
                </div>
            )}
        </div>
    )
})
