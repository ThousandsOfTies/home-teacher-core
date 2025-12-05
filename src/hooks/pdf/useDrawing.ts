import { useRef, useState } from 'react'

// 描画パスの型定義
export type DrawingPath = {
  points: { x: number; y: number }[]
  color: string
  width: number
}

// 線分の交差判定
const doSegmentsIntersect = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): boolean => {
  const ccw = (A: { x: number; y: number }, B: { x: number; y: number }, C: { x: number; y: number }) => {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x)
  }
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)
}

// パス同士が交差しているか判定
const doPathsIntersect = (path1: DrawingPath, path2: DrawingPath): boolean => {
  // パス1の各線分とパス2の各線分を比較
  for (let i = 0; i < path1.points.length - 1; i++) {
    for (let j = 0; j < path2.points.length - 1; j++) {
      if (doSegmentsIntersect(
        path1.points[i],
        path1.points[i + 1],
        path2.points[j],
        path2.points[j + 1]
      )) {
        return true
      }
    }
  }
  return false
}

// スクラッチパターンを検出（往復する動きを検出）
const isScratchPattern = (path: DrawingPath): boolean => {
  const points = path.points

  // 最低15ポイント必要（短すぎる線はスクラッチではない）
  if (points.length < 15) return false

  // 進行方向の角度を計算し、方向転換の回数を数える
  let directionChanges = 0
  let prevAngle: number | null = null

  for (let i = 2; i < points.length; i++) {
    const dx = points[i].x - points[i - 2].x
    const dy = points[i].y - points[i - 2].y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // 距離が短すぎる場合はスキップ（ノイズ除去）
    if (distance < 0.005) continue

    const angle = Math.atan2(dy, dx)

    if (prevAngle !== null) {
      // 角度の差を計算（-π ～ π の範囲に正規化）
      let angleDiff = angle - prevAngle
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

      // 90度以上の方向転換をカウント
      if (Math.abs(angleDiff) > Math.PI / 2) {
        directionChanges++
      }
    }

    prevAngle = angle
  }

  // 2往復 = 約4回以上の方向転換
  return directionChanges >= 4
}

export const useDrawing = (pageNum: number) => {
  const [drawingPaths, setDrawingPaths] = useState<Map<number, DrawingPath[]>>(new Map())
  const [isCurrentlyDrawing, setIsCurrentlyDrawing] = useState(false)
  const currentPathRef = useRef<DrawingPath | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)

  const startDrawing = (canvas: HTMLCanvasElement, x: number, y: number, color: string, width: number) => {
    setIsCurrentlyDrawing(true)

    // 正規化座標で保存（0-1の範囲）
    const normalizedX = x / canvas.width
    const normalizedY = y / canvas.height

    currentPathRef.current = {
      points: [{ x: normalizedX, y: normalizedY }],
      color,
      width
    }

    // contextをキャッシュし、スタイルを一度だけ設定
    ctxRef.current = canvas.getContext('2d')!
    ctxRef.current.strokeStyle = color
    ctxRef.current.lineWidth = width
    ctxRef.current.lineCap = 'round'
    ctxRef.current.lineJoin = 'round'
  }

  const continueDrawing = (canvas: HTMLCanvasElement, x: number, y: number) => {
    if (!isCurrentlyDrawing || !currentPathRef.current || !ctxRef.current) return

    const normalizedX = x / canvas.width
    const normalizedY = y / canvas.height

    // すべての点を保存（間引きなし - Apple Pencilの高速描画に対応）
    currentPathRef.current.points.push({ x: normalizedX, y: normalizedY })

    const points = currentPathRef.current.points
    if (points.length < 2) return

    // キャッシュされたcontextを使用（getContext, スタイル設定は不要）
    const ctx = ctxRef.current
    const len = points.length
    if (len < 3) {
      // 点が2つの場合は直線
      ctx.beginPath()
      ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height)
      ctx.lineTo(points[1].x * canvas.width, points[1].y * canvas.height)
      ctx.stroke()
    } else {
      // 3点以上の場合はベジェ曲線で滑らかに
      const p0 = points[len - 3]
      const p1 = points[len - 2]
      const p2 = points[len - 1]

      // 制御点を中間点に設定
      const cpX = p1.x * canvas.width
      const cpY = p1.y * canvas.height
      const endX = (p1.x + p2.x) / 2 * canvas.width
      const endY = (p1.y + p2.y) / 2 * canvas.height

      ctx.beginPath()
      if (len === 3) {
        ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height)
      } else {
        const prevEndX = (p0.x + p1.x) / 2 * canvas.width
        const prevEndY = (p0.y + p1.y) / 2 * canvas.height
        ctx.moveTo(prevEndX, prevEndY)
      }
      ctx.quadraticCurveTo(cpX, cpY, endX, endY)
      ctx.stroke()
    }
  }

  const stopDrawing = (onSave?: (paths: DrawingPath[]) => void) => {
    if (isCurrentlyDrawing && currentPathRef.current) {
      const newPath = currentPathRef.current
      ctxRef.current = null // contextキャッシュをクリア
      setDrawingPaths(prev => {
        const newMap = new Map(prev)
        const currentPaths = newMap.get(pageNum) || []

        // スクラッチパターンを検出
        if (isScratchPattern(newPath)) {
          // 交差する既存のパスを探す
          const pathsToKeep = currentPaths.filter(existingPath => {
            const intersects = doPathsIntersect(newPath, existingPath)
            return !intersects
          })

          // 交差する線があった場合のみ消しゴムとして機能
          const hadIntersections = pathsToKeep.length < currentPaths.length

          if (hadIntersections) {
            // スクラッチパス自体は保存しない（消しゴムとして使用したため）
            if (pathsToKeep.length === 0) {
              newMap.delete(pageNum)
            } else {
              newMap.set(pageNum, pathsToKeep)
            }

            // 履歴に保存
            if (onSave) {
              onSave(pathsToKeep)
            }
          } else {
            // 交差がない場合は通常の描画として保存
            const newPaths = [...currentPaths, newPath]
            newMap.set(pageNum, newPaths)

            // 履歴に保存
            if (onSave) {
              onSave(newPaths)
            }
          }
        } else {
          // 通常の描画パス
          const newPaths = [...currentPaths, newPath]
          newMap.set(pageNum, newPaths)

          // 履歴に保存
          if (onSave) {
            onSave(newPaths)
          }
        }

        return newMap
      })

      currentPathRef.current = null
      setIsCurrentlyDrawing(false)
    }
  }

  const clearDrawing = () => {
    setDrawingPaths(prev => {
      const newMap = new Map(prev)
      newMap.delete(pageNum)
      return newMap
    })
  }

  const clearAllDrawings = () => {
    setDrawingPaths(new Map())
  }

  // ペン跡を再描画する関数（正規化座標から実座標に変換）
  const redrawPaths = (ctx: CanvasRenderingContext2D, paths: DrawingPath[]) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

    const width = ctx.canvas.width
    const height = ctx.canvas.height

    paths.forEach(path => {
      if (path.points.length < 2) return

      ctx.strokeStyle = path.color
      ctx.lineWidth = path.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const points = path.points

      if (points.length === 2) {
        // 2点の場合は直線
        ctx.beginPath()
        ctx.moveTo(points[0].x * width, points[0].y * height)
        ctx.lineTo(points[1].x * width, points[1].y * height)
        ctx.stroke()
      } else {
        // 3点以上の場合はベジェ曲線で滑らかに描画
        ctx.beginPath()
        ctx.moveTo(points[0].x * width, points[0].y * height)

        for (let i = 1; i < points.length - 1; i++) {
          const p0 = points[i]
          const p1 = points[i + 1]

          // 制御点を現在の点に、終点を中間点に設定
          const cpX = p0.x * width
          const cpY = p0.y * height
          const endX = (p0.x + p1.x) / 2 * width
          const endY = (p0.y + p1.y) / 2 * height

          ctx.quadraticCurveTo(cpX, cpY, endX, endY)
        }

        // 最後の点まで直線で接続
        const lastPoint = points[points.length - 1]
        ctx.lineTo(lastPoint.x * width, lastPoint.y * height)
        ctx.stroke()
      }
    })
  }

  return {
    drawingPaths,
    setDrawingPaths,
    isCurrentlyDrawing,
    startDrawing,
    continueDrawing,
    stopDrawing,
    clearDrawing,
    clearAllDrawings,
    redrawPaths
  }
}
