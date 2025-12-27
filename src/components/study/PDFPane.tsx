import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react'
import { PDFFileRecord } from '../../utils/indexedDB'
import PDFCanvas, { PDFCanvasHandle } from './components/PDFCanvas'
import { DrawingPath, DrawingCanvas, useDrawing, useZoomPan, doPathsIntersect, isScratchPattern } from '@thousands-of-ties/drawing-common'
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
        fitToScreen
    } = useZoomPan(containerRef, RENDER_SCALE, 0.1, () => { })

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

    // キャンバスサイズの状態（DrawingCanvas との同期用）
    const [canvasSize, setCanvasSize] = React.useState<{ width: number, height: number } | null>(null)

    // レイアウト準備完了フラグ（ジャンプ防止用）
    const [isLayoutReady, setIsLayoutReady] = React.useState(false)

    // 初回フィット完了フラグ（ズームレベル保持のため、ページ変更後はfitToScreenしない）
    const initialFitDoneRef = useRef(false)

    // splitMode変更時は再フィットを実行
    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return

        console.log('📏 PDFPane: splitMode変更、再フィット実行', { splitMode })

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
        console.log('🏁 PDFPane: handlePageRendered triggered')
        if (!canvasRef.current || !containerRef.current) return

        setCanvasSize({
            width: canvasRef.current.width,
            height: canvasRef.current.height
        })

        // Log canvas size
        console.log('📏 PDFPane: Canvas size captured', {
            width: canvasRef.current.width,
            height: canvasRef.current.height
        })

        // Cancel any pending RAF
        if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current)
        }

        // Run fit logic in next frame to ensure layout is settled
        // Double RAF to wait for paint
        rafIdRef.current = requestAnimationFrame(() => {
            console.log('⏳ PDFPane: RAF 1 executing')
            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null
                console.log('⏳ PDFPane: RAF 2 executing')

                if (!canvasRef.current || !containerRef.current) {
                    console.error('❌ PDFPane: canvasRef is null in RAF')
                    return
                }

                try {
                    const containerH = containerRef.current.clientHeight
                    const maxH = window.innerHeight - 120
                    const effectiveH = (containerH > window.innerHeight) ? maxH : containerH

                    // 初回のみfitToScreen、以降はズームレベルを維持
                    if (!initialFitDoneRef.current) {
                        console.log('📏 PDFPane: 初回フィット実行', { containerH, effectiveH, splitMode })
                        fitToScreen(
                            canvasRef.current.width,
                            canvasRef.current.height,
                            effectiveH,
                            splitMode ? { fitToHeight: true, alignLeft: true } : undefined
                        )
                        initialFitDoneRef.current = true
                    } else {
                        console.log('📏 PDFPane: ズームレベル維持（ページ変更）')
                    }
                } catch (e) {
                    console.error('❌ PDFPane: Error in fitToScreen', e)
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
        stopDrawing
    } = useDrawing(drawingCanvasRef, {
        width: size, // Pen size always for useDrawing (since it's only for pen now)
        color: color,
        onPathComplete: (path) => {
            console.log('✍️ PDFPane: onPathComplete', { pathLength: path.points.length })
            // Do not add the path if it was recognized as a scratch gesture
            if (isScratchPattern(path)) {
                console.log('🚫 PDFPane: Ignoring scratch path from permanent storage')
                return
            }
            onPathAdd(path)
        },
        onScratchComplete: (scratchPath) => {
            console.log('⚡ PDFPane: onScratchComplete', { points: scratchPath.points.length })
            const currentPaths = drawingPathsRef.current
            const pathsToKeep = currentPaths.filter(existingPath =>
                !doPathsIntersect(scratchPath, existingPath)
            )

            if (pathsToKeep.length < currentPaths.length) {
                console.log("✂️ Scratch detected! Erasing paths.", { before: currentPaths.length, after: pathsToKeep.length })
                onPathsChange(pathsToKeep)
            } else {
                console.log("⚡ Scratch detected but NO intersection found.", { currentPaths: currentPaths.length })
            }
        }
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
        get pdfDoc() { return pdfDoc }
    }), [splitMode, fitToScreen, resetZoom, setZoom, handleUndo, pdfDoc])

    // Eraser cursor state
    const [eraserCursorPos, setEraserCursorPos] = React.useState<{ x: number, y: number } | null>(null)

    // Debug Rendering
    useEffect(() => {
        console.log('🖼️ PDFPane Render Status:', {
            zoom,
            panOffset,
            canvasDimensions: canvasRef.current ? { width: canvasRef.current.width, height: canvasRef.current.height } : 'null',
            containerDimensions: containerRef.current ? { width: containerRef.current.clientWidth, height: containerRef.current.clientHeight } : 'null',
            pdfDocAvailable: !!pdfDoc,
            numPages,
            isLayoutReady
        })
    }, [zoom, panOffset, numPages, isLayoutReady])

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
            onMouseDown={(e) => {
                // Ignore events on pager bar
                if ((e.target as HTMLElement).closest('.page-scrollbar-container')) return

                // Ctrl+ドラッグでパン（どのモードでも有効）
                if (isCtrlPressed) {
                    startPanning(e)
                    return
                }

                const rect = containerRef.current?.getBoundingClientRect()
                if (rect) {
                    const x = (e.clientX - rect.left - panOffset.x) / zoom
                    const y = (e.clientY - rect.top - panOffset.y) / zoom

                    if (tool === 'pen') {
                        startDrawing(x, y)
                    } else if (tool === 'eraser') {
                        console.log('🧹 Eraser MouseDown:', { x, y, pathsCount: drawingPathsRef.current.length })
                        handleErase(x, y)
                    } else if (tool === 'none') {
                        // 選択/採点モード時もパン可能
                        startPanning(e)
                    }
                }
            }}
            onMouseMove={(e) => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return

                // パン中またはCtrl押下中はパン処理
                if (isPanning || isCtrlPressed) {
                    doPanning(e)
                    return
                }

                const x = (e.clientX - rect.left - panOffset.x) / zoom
                const y = (e.clientY - rect.top - panOffset.y) / zoom

                if (tool === 'pen' && isDrawingInternal) {
                    draw(x, y)
                } else if (tool === 'eraser') {
                    if (e.buttons === 1) {
                        handleErase(x, y)
                    }
                    setEraserCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                } else if (tool === 'none' && e.buttons === 1) {
                    // 採点モードでドラッグ時もパン
                    doPanning(e)
                }
            }}
            onMouseUp={(e) => {
                stopDrawing()
                stopPanning()
            }}
            onMouseLeave={() => {
                stopDrawing()
                stopPanning()
                setEraserCursorPos(null)
            }}
            onTouchStart={(e) => {
                // Ignore events on pager bar
                if ((e.target as HTMLElement).closest('.page-scrollbar-container')) return

                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return

                if (e.touches.length === 2) {
                    // --- 2-Finger Gesture (Pinch/Pan) & Tap Detection ---
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
                    // --- Single Touch ---
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
                        // Drawing/Erasing Mode
                        twoFingerTapRef.current = null

                        const x = (t.clientX - rect.left - panOffset.x) / zoom
                        const y = (t.clientY - rect.top - panOffset.y) / zoom

                        if (tool === 'pen') {
                            startDrawing(x, y)
                        } else if (tool === 'eraser') {
                            handleErase(x, y)
                        }
                    }
                }
            }}
            onTouchMove={(e) => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return

                if (e.touches.length === 2 && gestureRef.current?.type === 'pinch') {
                    // --- Handle Pinch / 2-Finger Pan ---
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
                    const newZoom = Math.min(Math.max(startZoom * scale, 0.1), 5.0)

                    // 2. Calculate New Pan (Keep content under center stationary)
                    const startCenterRelX = startCenter.x - rect.left
                    const startCenterRelY = startCenter.y - rect.top

                    const contentX = (startCenterRelX - startPan.x) / startZoom
                    const contentY = (startCenterRelY - startPan.y) / startZoom

                    const centerRelX = center.x - rect.left
                    const centerRelY = center.y - rect.top

                    const newPanX = centerRelX - (contentX * newZoom)
                    const newPanY = centerRelY - (contentY * newZoom)

                    setZoom(newZoom)
                    setPanOffset({ x: newPanX, y: newPanY })

                } else if (e.touches.length === 1) {
                    // --- Handle Single Touch ---
                    const t = e.touches[0]

                    if (gestureRef.current?.type === 'pan') {
                        // Pan Logic
                        const { startPan, startCenter } = gestureRef.current

                        const dx = t.clientX - startCenter.x
                        const dy = t.clientY - startCenter.y

                        setPanOffset({
                            x: startPan.x + dx,
                            y: startPan.y + dy
                        })

                    } else if (isDrawingInternal) { // Only force drawing if already drawing
                        const x = (t.clientX - rect.left - panOffset.x) / zoom
                        const y = (t.clientY - rect.top - panOffset.y) / zoom

                        if (tool === 'pen') {
                            draw(x, y)
                        } else if (tool === 'eraser') {
                            handleErase(x, y)
                        }
                    } else if (tool === 'eraser') {
                        // Eraser can move without 'isDrawingInternal' (it draws on move)
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
                    // 300ms以内で、移動距離が小さい場合はタップと判定
                    if (elapsed < 300) {
                        handleUndo()
                    }
                    twoFingerTapRef.current = null
                }

                // Clear gesture state if all touches end or if gesture is broken
                if (e.touches.length === 0) {
                    gestureRef.current = null
                }

                stopDrawing()
                stopPanning()
            }}
        >
            <div className="canvas-wrapper" ref={wrapperRef}>
                <div
                    className="canvas-layer"
                    style={{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                        transformOrigin: '0 0',
                        transition: 'none',
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
                        onPathAdd={() => { }} // Interaction handled by useDrawing hook in PDFPane
                    />
                </div>
            </div>

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
