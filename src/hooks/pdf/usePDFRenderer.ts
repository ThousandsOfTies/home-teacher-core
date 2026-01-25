import { useState, useEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFFileRecord } from '../../utils/indexedDB'

// PDF.jsのworkerを設定（ローカルファイルを使用、Safari/Edge対応）
// PDF.jsのworkerを設定
// ベースURLを動的に取得してworkerのパスを構築
const baseUrl = import.meta.env.BASE_URL
// 末尾がスラッシュで終わることを保証
const safeBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
pdfjsLib.GlobalWorkerOptions.workerSrc = `${safeBaseUrl}pdf.worker.min.js`

interface UsePDFRendererOptions {
  onLoadStart?: () => void
  onLoadSuccess?: (numPages: number) => void
  onLoadError?: (error: string) => void
  initialPage?: number
}

export const usePDFRenderer = (
  pdfRecord: PDFFileRecord,
  options?: UsePDFRendererOptions
) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)

  /* pageNum state removed - managed by parent */
  const [numPages, setNumPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // optionsをrefで保持して依存配列の問題を回避
  const optionsRef = useRef(options)
  optionsRef.current = options


  // Ref to hold latest pdfRecord to avoid stale closures in async calls if needed, 
  // though we mostly rely on the fact that if ID is same, content is same.
  const pdfRecordRef = useRef(pdfRecord)
  pdfRecordRef.current = pdfRecord

  // PDFを読み込む
  useEffect(() => {
    let isActive = true
    let loadingTask: { promise: Promise<pdfjsLib.PDFDocumentProxy>, destroy: () => Promise<void> } | null = null
    let loadedPdf: pdfjsLib.PDFDocumentProxy | null = null

    const loadPDF = async () => {
      // Use the current record
      const record = pdfRecordRef.current

      if (isActive) {
        setIsLoading(true)
        setError(null)
      }

      try {
        // iPad対応: SNSタイムアウト後のIndexedDB安定化待機
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        if (isIOS) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }

        if (!isActive) return

        // Early return: PDFデータがない場合
        if (!record.fileData) {
          const errorMsg = 'PDFデータが見つかりません。'
          if (isActive) {
            setError(errorMsg)
            optionsRef.current?.onLoadError?.(errorMsg)
            setIsLoading(false)
          }
          return
        }

        if (isActive) {
          optionsRef.current?.onLoadStart?.()
        }

        let pdfData: ArrayBuffer | Uint8Array

        // BlobをArrayBufferに変換（v6から）
        if (record.fileData instanceof Blob) {
          if (record.fileData.size === 0) {
            throw new Error('PDFファイルのサイズが0バイトです。')
          }
          console.log('📄 Blob → ArrayBuffer変換開始', {
            size: record.fileData.size,
            type: record.fileData.type
          })
          pdfData = await record.fileData.arrayBuffer()
        } else {
          // 後方互換性: 文字列（Base64）の場合
          const binaryString = atob(record.fileData as string)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          pdfData = bytes
        }

        if (!isActive) return

        console.log('PDFを読み込み中...', {
          dataSize: pdfData.byteLength,
          userAgent: navigator.userAgent
        })

        // Safari対応: タイムアウトとキャンセル可能な読み込み
        loadingTask = pdfjsLib.getDocument({
          data: pdfData,
          // Safari/iOSでのメモリ問題を回避
          useWorkerFetch: false,
          isEvalSupported: false,
          // タイムアウトを設定
          stopAtErrors: true
        })

        // タイムアウト処理（iPad/iPhoneでは60秒、それ以外は30秒）
        const timeoutMs = isIOS ? 60000 : 30000
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`PDF読み込みがタイムアウトしました（${timeoutMs / 1000}秒）`)), timeoutMs)
        })

        const pdf = await Promise.race([
          loadingTask.promise,
          timeoutPromise
        ]) as pdfjsLib.PDFDocumentProxy

        if (isActive) {
          loadedPdf = pdf
          setPdfDoc(pdf)
          setNumPages(pdf.numPages)
          setIsLoading(false)
          optionsRef.current?.onLoadSuccess?.(pdf.numPages)
        } else {
          // すでにアンマウントされている場合は破棄
          pdf.destroy()
        }

        // Cleanup function for this specific load attempt (if needed)
        // But main cleanup is in useEffect return

        // Store loadingTask for cleanup
        const originalDestroy = loadingTask.destroy
        loadingTask.destroy = async () => {
          if (originalDestroy) await originalDestroy.call(loadingTask!)
        }

      } catch (error) {
        if (isActive) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error('PDF読み込みエラー:', errorMsg)
          const fullErrorMsg = 'PDFの読み込みに失敗しました: ' + errorMsg
          setError(fullErrorMsg)
          optionsRef.current?.onLoadError?.(fullErrorMsg)
          setIsLoading(false)

          // Debugging for iPad: Show alert
          window.alert(fullErrorMsg)
        }
      }
    }

    loadPDF()

    return () => {
      isActive = false
      if (loadingTask) {
        loadingTask.destroy().catch(() => { })
      }
      if (loadedPdf) {
        loadedPdf.destroy().catch(() => { })
      }
    }
  }, [pdfRecord.id]) // Only reload if ID changes

  return {
    pdfDoc,
    numPages,
    isLoading,
    error
  }
}
