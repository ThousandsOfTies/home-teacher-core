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
    const loadPDF = async () => {
      // Use the current record
      const record = pdfRecordRef.current

      setIsLoading(true)
      setError(null)
      try {
        // iPad対応: SNSタイムアウト後のIndexedDB安定化待機
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        if (isIOS) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }

        let pdfData: ArrayBuffer | Uint8Array

        if (record.fileData) {
          optionsRef.current?.onLoadStart?.()

          // BlobをArrayBufferに変換（v6から）
          if (record.fileData instanceof Blob) {
            console.log('📄 Blob → ArrayBuffer変換開始', {
              size: record.fileData.size,
              type: record.fileData.type
            })
            pdfData = await record.fileData.arrayBuffer()
            console.log('✅ ArrayBuffer変換完了:', pdfData.byteLength, 'bytes')
          } else {
            // 後方互換性: 文字列（Base64）の場合
            // ... existing logic but using record ...
            console.log('📄 Base64 → ArrayBuffer変換開始')
            const binaryString = atob(record.fileData as string)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            pdfData = bytes
            console.log('✅ ArrayBuffer変換完了:', pdfData.byteLength, 'bytes')
          }
        } else {
          // Error handling...
          const errorMsg = 'PDFデータが見つかりません。'
          // ... truncated for brevity ...
          setError(errorMsg)
          optionsRef.current?.onLoadError?.(errorMsg)
          setIsLoading(false)
          return
        }

        console.log('PDFを読み込み中...', {
          dataSize: pdfData.byteLength,
          userAgent: navigator.userAgent
        })

        // Safari対応: タイムアウトとキャンセル可能な読み込み
        const loadingTask = pdfjsLib.getDocument({
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
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)

        setIsLoading(false)
        optionsRef.current?.onLoadSuccess?.(pdf.numPages)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('PDF読み込みエラー:', errorMsg)
        const fullErrorMsg = 'PDFの読み込みに失敗しました: ' + errorMsg
        setError(fullErrorMsg)
        optionsRef.current?.onLoadError?.(fullErrorMsg)
        setIsLoading(false)
      }
    }

    loadPDF()
  }, [pdfRecord.id]) // Only reload if ID changes

  return {
    pdfDoc,
    numPages,
    isLoading,
    error
  }
}
