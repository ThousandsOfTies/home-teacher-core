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
}

export const usePDFRenderer = (
  pdfRecord: PDFFileRecord,
  containerRef: React.RefObject<HTMLDivElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options?: UsePDFRendererOptions
) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // optionsをrefで保持して依存配列の問題を回避
  const optionsRef = useRef(options)
  optionsRef.current = options

  // PDFを読み込む
  useEffect(() => {
    const loadPDF = async () => {
      setIsLoading(true)
      setError(null)
      try {
        // iPad対応: SNSタイムアウト後のIndexedDB安定化待機
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        if (isIOS) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }

        let pdfData: ArrayBuffer | Uint8Array

        if (pdfRecord.fileData) {
          optionsRef.current?.onLoadStart?.()

          // BlobをArrayBufferに変換（v6から）
          if (pdfRecord.fileData instanceof Blob) {
            console.log('📄 Blob → ArrayBuffer変換開始', {
              size: pdfRecord.fileData.size,
              type: pdfRecord.fileData.type
            })
            pdfData = await pdfRecord.fileData.arrayBuffer()
            console.log('✅ ArrayBuffer変換完了:', pdfData.byteLength, 'bytes')
          } else {
            // 後方互換性: 文字列（Base64）の場合
            console.log('📄 Base64 → ArrayBuffer変換開始')
            const binaryString = atob(pdfRecord.fileData as string)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            pdfData = bytes
            console.log('✅ ArrayBuffer変換完了:', pdfData.byteLength, 'bytes')
          }
        } else {
          const errorMsg =
            'PDFデータが見つかりません。\n\n' +
            'PDFレコード情報:\n' +
            `- ID: ${pdfRecord.id}\n` +
            `- ファイル名: ${pdfRecord.fileName}\n` +
            `- fileDataの型: ${typeof pdfRecord.fileData}\n` +
            `- IndexedDBから正しく読み込まれていない可能性があります\n\n` +
            '以下の手順で再度ファイルを追加してください：\n' +
            '1. 管理画面に戻る（🏠ボタン）\n' +
            '2. このPDFを削除\n' +
            '3. PDFを再度追加'
          console.error('❌ PDFデータが見つかりません:', {
            id: pdfRecord.id,
            fileName: pdfRecord.fileName,
            fileDataType: typeof pdfRecord.fileData,
            fileData: pdfRecord.fileData
          })
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

        // 保存されている最後のページ番号を復元
        if (pdfRecord.lastPageNumber && pdfRecord.lastPageNumber <= pdf.numPages) {
          setPageNum(pdfRecord.lastPageNumber)
          console.log(`📖 前回のページ (${pdfRecord.lastPageNumber}) を復元しました`)
        } else {
          setPageNum(1)
        }

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
  }, [pdfRecord])

  const goToPrevPage = () => {
    if (pageNum > 1) {
      setPageNum(pageNum - 1)
    }
  }

  const goToNextPage = () => {
    if (pageNum < numPages) {
      setPageNum(pageNum + 1)
    }
  }

  const jumpToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNum(page)
    }
  }

  return {
    pdfDoc,
    pageNum,
    setPageNum,
    numPages,
    isLoading,
    error,
    goToPrevPage,
    goToNextPage,
    jumpToPage
  }
}
