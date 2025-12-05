import { useState } from 'react'

// 矩形選択の型定義
export type SelectionRect = {
  startX: number
  startY: number
  endX: number
  endY: number
} | null

export const useSelection = () => {
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionRect, setSelectionRect] = useState<SelectionRect>(null)
  const [selectionPreview, setSelectionPreview] = useState<string | null>(null)

  const startSelection = (canvas: HTMLCanvasElement, x: number, y: number) => {
    if (!isSelectionMode) return

    setIsSelecting(true)
    setSelectionRect({
      startX: x,
      startY: y,
      endX: x,
      endY: y
    })
  }

  const updateSelection = (
    canvas: HTMLCanvasElement,
    x: number,
    y: number
  ) => {
    if (!isSelecting || !isSelectionMode || !selectionRect) return

    setSelectionRect({
      ...selectionRect,
      endX: x,
      endY: y
    })

    // 選択範囲を描画
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const width = x - selectionRect.startX
    const height = y - selectionRect.startY

    // 選択範囲の枠を描画
    ctx.strokeStyle = '#2196F3'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.strokeRect(selectionRect.startX, selectionRect.startY, width, height)

    // 選択範囲の背景を半透明にする
    ctx.fillStyle = 'rgba(33, 150, 243, 0.1)'
    ctx.fillRect(selectionRect.startX, selectionRect.startY, width, height)
  }

  const finishSelection = (
    pdfCanvas: HTMLCanvasElement,
    drawingCanvas: HTMLCanvasElement,
    zoom: number,
    panOffset: { x: number; y: number },
    renderScale: number,
    selectionCanvas?: HTMLCanvasElement | null
  ) => {
    if (isSelecting && selectionRect) {
      setIsSelecting(false)

      const { startX, startY, endX, endY } = selectionRect
      const x = Math.min(startX, endX)
      const y = Math.min(startY, endY)
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)

      if (width >= 50 && height >= 50) {
        // selectionCanvas座標からPDFcanvas座標に変換
        // wrapper座標 = (canvas座標 * zoom) + panOffset (CSS transform適用後)
        // ∴ canvas座標 = (wrapper座標 - panOffset) / zoom
        const canvasX = (x - panOffset.x) / zoom
        const canvasY = (y - panOffset.y) / zoom
        const canvasWidth = width / zoom
        const canvasHeight = height / zoom

        // 選択範囲を切り出してプレビュー画像を作成
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = canvasWidth
        tempCanvas.height = canvasHeight
        const ctx = tempCanvas.getContext('2d')!

        // PDFを描画
        ctx.drawImage(pdfCanvas, canvasX, canvasY, canvasWidth, canvasHeight, 0, 0, canvasWidth, canvasHeight)

        // 手書きを重ねる
        ctx.drawImage(drawingCanvas, canvasX, canvasY, canvasWidth, canvasHeight, 0, 0, canvasWidth, canvasHeight)

        // Base64画像として保存（品質0.75で適度に圧縮）
        const previewData = tempCanvas.toDataURL('image/jpeg', 0.75)

        // プレビュー画像を設定（確認ダイアログ表示）
        setSelectionPreview(previewData)

        // キャプチャ後、矩形選択を消す（確認ダイアログを見やすくするため）
        setSelectionRect(null)

        // selectionCanvasもクリア
        if (selectionCanvas) {
          const ctx = selectionCanvas.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height)
          }
        }
      }
    }
  }

  const cancelSelection = () => {
    setIsSelectionMode(false)
    setSelectionRect(null)
    setSelectionPreview(null)
  }

  return {
    isSelectionMode,
    setIsSelectionMode,
    isSelecting,
    selectionRect,
    setSelectionRect,
    selectionPreview,
    setSelectionPreview,
    startSelection,
    updateSelection,
    finishSelection,
    cancelSelection
  }
}
