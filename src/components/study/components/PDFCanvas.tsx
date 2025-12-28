import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { PDFFileRecord } from '../../../utils/indexedDB'
import { usePDFRenderer } from '../../../hooks/pdf/usePDFRenderer'

// PDF.jsのworker設定は usePDFRenderer.ts で一元管理するため削除
import * as pdfjsLib from 'pdfjs-dist'

interface PDFCanvasProps {
    pdfDoc: any // pdfjsLib.PDFDocumentProxy | null
    containerRef: React.RefObject<HTMLDivElement>
    canvasRef: React.RefObject<HTMLCanvasElement>
    renderScale?: number
    onPageRendered?: () => void
    pageNum: number // Strictly required now
}

export interface PDFCanvasHandle {
    // Only exposure needed? maybe not even needed as parent controls specific page
    // converting to pure means less logic exposed
}

const PDFCanvas = forwardRef<PDFCanvasHandle, PDFCanvasProps>(({
    pdfDoc,
    containerRef,
    canvasRef,
    renderScale = 1.0,
    onPageRendered,
    pageNum
}, ref) => {
    // No internal hook usage! Pure render only.

    // We can expose empty handle or whatever is needed by parent
    useImperativeHandle(ref, () => ({
        // Legacy support if needed, but logic is moved up
    }))

    // レンダリングタスク管理
    const renderTaskRef = useRef<any>(null)
    const lastRenderPromise = useRef<Promise<void>>(Promise.resolve())

    // ページレンダリング
    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return

        const renderPage = async () => {
            // console.log('🎨 PDFCanvas: renderPage queued', { pageNum, renderScale })

            // キャンセル
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel()
                renderTaskRef.current = null
            }

            // Queue the render to ensure sequential execution
            lastRenderPromise.current = lastRenderPromise.current.then(async () => {
                // Double check cancellation/staleness inside the queue
                if (!canvasRef.current || !pdfDoc) return

                // console.log('🎨 PDFCanvas: renderPage start', { pageNum, renderScale })
                const page = await pdfDoc.getPage(pageNum)

                let pageRotation = 0
                try {
                    const rotate = page.rotate
                    if (typeof rotate === 'number' && [0, 90, 180, 270].includes(rotate)) {
                        pageRotation = rotate
                    }
                } catch (error) {
                    // console.warn('⚠️ rotation属性取得エラー:', error)
                }

                const viewport = page.getViewport({ scale: renderScale, rotation: pageRotation })
                if (!canvasRef.current) return
                const canvas = canvasRef.current
                const context = canvas.getContext('2d')
                if (!context) return

                canvas.height = viewport.height
                canvas.width = viewport.width
                // Ensure CSS dimensions match attribute dimensions (override max-width: 100% etc)
                canvas.style.width = `${viewport.width}px`
                canvas.style.height = `${viewport.height}px`

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                }

                try {
                    // console.log('📏 PDFCanvas: Viewport calculated', { width: viewport.width, height: viewport.height })

                    renderTaskRef.current = page.render(renderContext)
                    await renderTaskRef.current.promise
                    renderTaskRef.current = null
                    // console.log('✅ PDFCanvas: Render complete')
                    onPageRendered?.()
                } catch (error: any) {
                    if (error?.name === 'RenderingCancelledException') {
                        // console.log('🛑 Rendering Cancelled')
                        return
                    }
                    // console.error('Render error:', error)
                }
            }).catch((err) => {
                // console.error('Render queue error:', err)
            })
        }

        renderPage()

        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel()
                renderTaskRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfDoc, pageNum, renderScale])

    // canvas要素自体への参照が必要な場合（useZoomPanなどで使われる）
    // ただし、forwardRefで公開しているのはHandleなので、canvasRefへのアクセス方法を検討する必要がある
    // 今回はクラス名を指定して親からquerySelectorで取るか、
    // あるいは専用のref prop (canvasRef) を渡す形にするか。
    // StudyPanelのロジックを見ると、useZoomPanにcanvasRefを渡している。
    // ここではシンプルに、canvas要素に特定のIDやクラスを付与し、スタイルを適用する。

    return (
        <canvas
            ref={canvasRef}
            className="pdf-canvas"
            style={{
                transformOrigin: 'top left',
                display: 'block' // 余白除去
            }}
        />
    )
})

export default PDFCanvas
