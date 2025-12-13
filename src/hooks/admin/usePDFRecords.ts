import { useState } from 'react'
import { getAllPDFRecords, deletePDFRecord, savePDFRecord, generatePDFId, PDFFileRecord } from '../../utils/indexedDB'
import * as pdfjsLib from 'pdfjs-dist'

// Workerの設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

export const usePDFRecords = () => {
  const [pdfRecords, setPdfRecords] = useState<PDFFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadPDFRecords = async () => {
    try {
      setLoading(true)
      const records = await getAllPDFRecords()
      setPdfRecords(records)
    } catch (error) {
      console.error('Failed to load PDFs:', error)
      setErrorMessage('Failed to load PDF list')
    } finally {
      setLoading(false)
    }
  }

  // サムネイルを生成
  const generateThumbnail = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise

    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 0.5 })

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context not available')

    canvas.height = viewport.height
    canvas.width = viewport.width

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise

    return canvas.toDataURL('image/jpeg', 0.7)
  }

  const handleFileSelect = async () => {
    setUploading(true)
    try {
      let file: File | null = null

      if ('showOpenFilePicker' in window) {
        try {
          const [fileHandle] = await (window as any).showOpenFilePicker({
            types: [
              {
                description: 'PDF Files',
                accept: {
                  'application/pdf': ['.pdf'],
                },
              },
            ],
            multiple: false,
          })
          file = await fileHandle.getFile()
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.error('File picker failed:', error)
          }
          setUploading(false)
          return
        }
      } else {
        file = await new Promise<File | null>((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'application/pdf'

          let isResolved = false

          // ファイル選択イベント
          input.onchange = (e) => {
            if (isResolved) return
            isResolved = true
            const selectedFile = (e.target as HTMLInputElement).files?.[0]
            resolve(selectedFile || null)
          }

          // キャンセルイベント（ファイル選択ダイアログを閉じた時）
          input.oncancel = () => {
            if (isResolved) return
            isResolved = true
            resolve(null)
          }

          // フォーカスが戻った時の処理
          // iPadのSafariではonchangeが発火しないことがあるため、
          // フォーカスハンドラーでinput.filesを直接チェック
          const handleFocus = () => {
            setTimeout(() => {
              if (isResolved) return

              if (!input.files || input.files.length === 0) {
                isResolved = true
                resolve(null)
              } else {
                // ファイルが選択されているがonchangeが呼ばれていない場合
                isResolved = true
                const selectedFile = input.files[0]
                resolve(selectedFile)
              }
            }, 1000) // iPadのために待機時間を延長
          }

          window.addEventListener('focus', handleFocus, { once: true })
          input.click()
        })

        if (!file) {
          setUploading(false)
          return
        }
      }

      // ファイルサイズチェック（100MBまで）
      if (file.size > 100 * 1024 * 1024) {
        setErrorMessage('ファイルサイズが大きすぎます（最大100MB）')
        setUploading(false)
        return
      }

      const fileName = file.name
      const id = generatePDFId(fileName)

      // サムネイルを生成
      const thumbnail = await generateThumbnail(file)

      // ファイル全体をBlobとして保存（v6から）
      const arrayBuffer = await file.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' })

      const newRecord: PDFFileRecord = {
        id,
        fileName,
        fileData: blob,
        thumbnail,
        lastOpened: Date.now(),
        drawings: {},
      }

      await savePDFRecord(newRecord)
      await loadPDFRecords()

      // 自動的に開くのを無効化（ユーザーリクエスト: ファイル一覧のままにする）
    } catch (error) {
      console.error('Failed to add PDF:', error)
      setErrorMessage(`Failed to add PDF: ${error}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteRecord = async (id: string) => {
    try {
      // PDFに関連する解答データも削除
      const { deleteAnswersByPdfId } = await import('../../utils/indexedDB')
      await deleteAnswersByPdfId(id)
      console.log(`🗑️ PDF ${id} の解答データを削除しました`)

      await deletePDFRecord(id)
      await loadPDFRecords()
    } catch (error) {
      console.error('Failed to delete:', error)
      setErrorMessage('Failed to delete')
    }
  }


  return {
    pdfRecords,
    loading,
    uploading,
    errorMessage,
    setErrorMessage,
    loadPDFRecords,
    handleFileSelect,
    handleDeleteRecord
  }
}
