import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { PDFFileRecord } from '../../../utils/indexedDB'
import { usePDFRenderer } from '../../../hooks/pdf/usePDFRenderer'

// PDF.jsのworker設定は usePDFRenderer.ts で一元管理するため削除
import * as pdfjsLib from 'pdfjs-dist'

interface PDFCanvasProps {
    pdfRecord: PDFFileRecord
    containerRef: React.RefObject<HTMLDivElement>
    canvasRef: React.RefObject<HTMLCanvasElement> // 親から受け取る
    renderScale: number
    onLoadStart?: () => void
    onLoadSuccess?: (numPages: number) => void
    onLoadError?: (error: string) => void
    onPageRendered?: () => void
    onPageChange?: (pageNum: number) => void
}

export interface PDFCanvasHandle {
    goToPrevPage: () => void
    goToNextPage: () => void
    jumpToPage: (page: number) => void
    pageNum: number
    numPages: number
    isLoading: boolean
    pdfDoc: pdfjsLib.PDFDocumentProxy | null
}

const PDFCanvas = forwardRef<PDFCanvasHandle, PDFCanvasProps>(({
    pdfRecord,
    containerRef,
    canvasRef, // ここで使用
    renderScale,
    onLoadStart,
    onLoadSuccess,
    onLoadError,
    onPageRendered,
    onPageChange
}, ref) => {
    // 内部refは削除 (canvasRefを使用)

    // usePDFRenderer hook を使用
    const {
        pdfDoc,
        pageNum,
        numPages,
        isLoading,
        error,
        goToPrevPage,
        goToNextPage,
        jumpToPage
    } = usePDFRenderer(pdfRecord, containerRef, canvasRef, {
        onLoadStart,
        onLoadSuccess,
        onLoadError
    })

    // 親コンポーネントにメソッドを公開
    useImperativeHandle(ref, () => ({
        goToPrevPage,
        goToNextPage,
        jumpToPage,
        pageNum,
        numPages,
        isLoading,
        pdfDoc
    }))

    // ページ変更通知
    useEffect(() => {
        onPageChange?.(pageNum)
    }, [pageNum, onPageChange])

    // レンダリングタスク管理
    const renderTaskRef = useRef<any>(null)

    // ページレンダリング
    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return

        const renderPage = async () => {
            // キャンセル
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel()
                renderTaskRef.current = null
            }

            const page = await pdfDoc.getPage(pageNum)

            let pageRotation = 0
            try {
                const rotate = page.rotate
                if (typeof rotate === 'number' && [0, 90, 180, 270].includes(rotate)) {
                    pageRotation = rotate
                }
            } catch (error) {
                console.warn('⚠️ rotation属性取得エラー:', error)
            }

            const viewport = page.getViewport({ scale: renderScale, rotation: pageRotation })
            const canvas = canvasRef.current!
            const context = canvas.getContext('2d')!

            canvas.height = viewport.height
            canvas.width = viewport.width

            const renderContext = {
                canvasContext: context,
                viewport: viewport,
            }

            try {
                renderTaskRef.current = page.render(renderContext)
                await renderTaskRef.current.promise
                renderTaskRef.current = null
                onPageRendered?.()
            } catch (error: any) {
                if (error?.name === 'RenderingCancelledException') {
                    return
                }
                console.error('Render error:', error)
            }
        }

        renderPage()

        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel()
                renderTaskRef.current = null
            }
        }
    }, [pdfDoc, pageNum, renderScale, onPageRendered])

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
