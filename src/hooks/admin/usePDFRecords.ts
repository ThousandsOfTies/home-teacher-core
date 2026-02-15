import { useState } from 'react'
import { getAllPDFRecords, deletePDFRecord, savePDFRecord, generatePDFId, PDFFileRecord } from '../../utils/indexedDB'
import * as pdfjsLib from 'pdfjs-dist'
import { detectSubject } from '../../services/api'

// Workerの設定
// Workerの設定（ローカルファイルを使用）
const baseUrl = import.meta.env.BASE_URL
const safeBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
pdfjsLib.GlobalWorkerOptions.workerSrc = `${safeBaseUrl}pdf.worker.min.js`

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

  // PDFファイルを追加
  const addPDF = async (file: Blob, fileName: string) => {
    setUploading(true)
    try {
      const id = generatePDFId(fileName)

      // サムネイルを生成（Fileの場合はFileとして、Blobの場合はBlobとして扱う）
      // generateThumbnail takes File but Blob is compatible for arrayBuffer()
      const thumbnailModel = new File([file], fileName, { type: 'application/pdf' })
      const thumbnail = await generateThumbnail(thumbnailModel)

      // 教科を自動検出（表紙画像を使用）
      let detectedSubjectId: string | undefined = undefined
      try {
        console.log('🔍 Detecting subject from cover page...')
        const subjectResponse = await detectSubject(thumbnail)
        if (subjectResponse.success && subjectResponse.subjectId) {
          detectedSubjectId = subjectResponse.subjectId
          console.log(`✅ Subject detected: ${detectedSubjectId} (confidence: ${subjectResponse.confidence})`)
        } else {
          console.warn('⚠️ Subject detection failed or returned no result')
        }
      } catch (error) {
        console.error('❌ Subject detection error:', error)
        // エラーが起きても続行（教科は未設定のまま）
      }

      const newRecord: PDFFileRecord = {
        id,
        fileName,
        fileData: file,
        thumbnail,
        lastOpened: Date.now(),
        drawings: {},
        subjectId: detectedSubjectId, // 検出された教科ID（未検出の場合はundefined）
      }

      await savePDFRecord(newRecord)
      await loadPDFRecords()
      return true
    } catch (error) {
      console.error('Failed to add PDF:', error)
      setErrorMessage(`Failed to add PDF: ${error}`)
      return false
    } finally {
      setUploading(false)
    }
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

      // addPDFを呼び出し
      await addPDF(file, file.name)

    } catch (error) {
      console.error('Failed to select PDF:', error)
      setErrorMessage(`Failed to select PDF: ${error}`)
      setUploading(false)
    }
  }

  const handleDeleteRecord = async (id: string) => {
    try {
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
    handleDeleteRecord,
    addPDF
  }
}
