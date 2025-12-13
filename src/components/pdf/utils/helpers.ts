/**
 * 画像処理ヘルパー関数
 */

/**
 * 画像を圧縮して指定サイズ以下のBase64文字列を返す
 */
export function compressImage(canvas: HTMLCanvasElement, maxSize: number = 1024): string {
    const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height, 1)

    if (scale < 1) {
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = canvas.width * scale
        tempCanvas.height = canvas.height * scale
        const tempCtx = tempCanvas.getContext('2d')
        if (tempCtx) {
            tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height)
            return tempCanvas.toDataURL('image/jpeg', 0.8)
        }
    }
    return canvas.toDataURL('image/jpeg', 0.8)
}

/**
 * Canvasから選択領域を切り出してBase64画像を生成
 */
export function cropCanvas(
    canvas: HTMLCanvasElement,
    selection: { startX: number; startY: number; endX: number; endY: number },
    zoom: number
): string {
    const selectionCanvas = document.createElement('canvas')
    const ctx = selectionCanvas.getContext('2d')
    if (!ctx) return ''

    // 選択領域を正規化（startが常に左上になるように）
    const left = Math.min(selection.startX, selection.endX)
    const top = Math.min(selection.startY, selection.endY)
    const width = Math.abs(selection.endX - selection.startX)
    const height = Math.abs(selection.endY - selection.startY)

    // zoom補正を適用
    const scaledLeft = left * zoom
    const scaledTop = top * zoom
    const scaledWidth = width * zoom
    const scaledHeight = height * zoom

    selectionCanvas.width = scaledWidth
    selectionCanvas.height = scaledHeight

    ctx.drawImage(
        canvas,
        scaledLeft, scaledTop, scaledWidth, scaledHeight,
        0, 0, scaledWidth, scaledHeight
    )

    return selectionCanvas.toDataURL('image/png')
}

/**
 * セクション名からページ番号を抽出するパターン
 */
export function extractPageFromSectionName(sectionName: string): number | null {
    if (!sectionName) return null

    // 様々なページ参照パターンを抽出（全角数字対応）
    const patterns = [
        /(?:p\.?|page)\s*([0-9０-９]+)/i,                    // p.6, page 6
        /問題[はが]?\s*([0-9０-９]+)\s*(?:ページ)/i,          // 問題は6ページ
        /([0-9０-９]+)\s*ページ/,                            // 6ページ
    ]

    for (const pattern of patterns) {
        const match = sectionName.match(pattern)
        if (match && match[1]) {
            let numStr = match[1]
            // 全角数字を半角に変換
            numStr = numStr.replace(/[０-９]/g, (s) =>
                String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
            )
            const extractedPage = parseInt(numStr, 10)
            if (!isNaN(extractedPage) && extractedPage > 0 && extractedPage < 1000) {
                return extractedPage
            }
        }
    }

    return null
}
