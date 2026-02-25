import { useState } from 'react'
import { getAllPDFRecords, deletePDFRecord, savePDFRecord, generatePDFId, PDFFileRecord } from '../../utils/indexedDB'
import * as pdfjsLib from 'pdfjs-dist'
import { detectSubject } from '../../services/api'
import { isSupportedImageFile, processImageFiles } from '../../utils/imageProcessor'
import { convertImagesToPDF } from '../../services/pdfConverter'

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
      let files: File[] = []

      if ('showOpenFilePicker' in window) {
        console.log('📂 Using modern file picker API...')
        try {
          const fileHandles = await (window as any).showOpenFilePicker({
            types: [
              {
                description: 'PDF and Image Files',
                accept: {
                  'application/pdf': ['.pdf'],
                  'image/jpeg': ['.jpg', '.jpeg'],
                  'image/png': ['.png'],
                  'image/heic': ['.heic'],
                  'image/heif': ['.heif'],
                },
              },
            ],
            multiple: true,
          })
          console.log(`📂 File handles received: ${fileHandles.length}`)
          files = await Promise.all(fileHandles.map((handle: any) => handle.getFile()))
          console.log(`📂 Files loaded: ${files.length}`)

          if (!files || files.length === 0) {
            console.log('⚠️ No files selected')
            setUploading(false)
            return
          }
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.error('File picker failed:', error)
          } else {
            console.log('📂 File picker cancelled by user')
          }
          setUploading(false)
          return
        }
      } else {
        console.log('📂 Using fallback file picker...')
        const selectedFiles = await new Promise<FileList | null>((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'application/pdf,image/jpeg,image/jpg,image/png,image/heic,image/heif'
          input.multiple = true

          let isResolved = false

          // ファイル選択イベント
          input.onchange = (e) => {
            if (isResolved) return
            isResolved = true
            const selectedFiles = (e.target as HTMLInputElement).files
            resolve(selectedFiles)
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
                resolve(input.files)
              }
            }, 1000) // iPadのために待機時間を延長
          }

          window.addEventListener('focus', handleFocus, { once: true })
          input.click()
        })

        if (!selectedFiles || selectedFiles.length === 0) {
          setUploading(false)
          return
        }

        files = Array.from(selectedFiles)
      }

      // ファイル数制限チェック
      const MAX_FILES = 100
      const MAX_FILE_SIZE_MB = 100
      const MAX_TOTAL_SIZE_MB = 300

      if (files.length > MAX_FILES) {
        const message = `ファイル数が多すぎます。最大${MAX_FILES}枚まで選択できます。\n現在: ${files.length}枚`
        setErrorMessage(message)
        alert(message)
        setUploading(false)
        return
      }

      // ファイルサイズチェック（各ファイル100MBまで）
      console.log(`📁 Selected ${files.length} file(s)`)
      let totalSize = 0

      for (const file of files) {
        console.log(`  - ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, ${file.type})`)
        totalSize += file.size

        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          const message = `ファイルサイズが大きすぎます（最大${MAX_FILE_SIZE_MB}MB）\nファイル: ${file.name}\nサイズ: ${(file.size / 1024 / 1024).toFixed(2)}MB`
          setErrorMessage(message)
          alert(message)
          setUploading(false)
          return
        }
      }

      // 合計サイズチェック
      const totalSizeMB = totalSize / 1024 / 1024
      console.log(`📊 Total size: ${totalSizeMB.toFixed(2)}MB`)

      if (totalSizeMB > MAX_TOTAL_SIZE_MB) {
        const message = `合計ファイルサイズが大きすぎます。\n最大: ${MAX_TOTAL_SIZE_MB}MB\n現在: ${totalSizeMB.toFixed(2)}MB\n\nファイル数を減らすか、小さい画像を選択してください。`
        setErrorMessage(message)
        alert(message)
        setUploading(false)
        return
      }

      // ファイルを種類別に分類
      console.log('🔍 Classifying files...')
      const pdfFiles: File[] = []
      const imageFiles: File[] = []

      for (const file of files) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(file)
          console.log(`  ✅ PDF: ${file.name}`)
        } else if (isSupportedImageFile(file)) {
          imageFiles.push(file)
          console.log(`  ✅ Image: ${file.name}`)
        } else {
          console.warn(`  ⚠️ Unsupported file type: ${file.name}`)
        }
      }

      console.log(`📊 Classification result: ${pdfFiles.length} PDF(s), ${imageFiles.length} image(s)`)

      // 画像ファイルをPDFに変換
      if (imageFiles.length > 0) {
        console.log(`📷 Converting ${imageFiles.length} image(s) to PDF...`)
        try {
          console.log('  🔄 Step 1: Processing images...')
          const processedImages = await processImageFiles(imageFiles)
          console.log(`  ✅ Step 1 complete: ${processedImages.length} images processed`)

          console.log('  🔄 Step 2: Converting to PDF...')
          const pdfBlob = await convertImagesToPDF(processedImages, 'converted-images.pdf')
          console.log(`  ✅ Step 2 complete: PDF created (${(pdfBlob.size / 1024 / 1024).toFixed(2)}MB)`)

          // 変換されたPDFを追加
          const fileName = imageFiles.length === 1
            ? imageFiles[0].name.replace(/\.[^/.]+$/, '.pdf') // 拡張子をpdfに変更
            : 'converted-images.pdf'

          console.log(`  🔄 Step 3: Saving PDF as "${fileName}"...`)
          await addPDF(pdfBlob, fileName)
          console.log(`  ✅ Step 3 complete: PDF saved`)
        } catch (error) {
          console.error('❌ Image conversion failed:', error)
          throw error
        }
      }

      // PDFファイルを直接追加
      if (pdfFiles.length > 0) {
        console.log(`📄 Adding ${pdfFiles.length} PDF file(s)...`)
        for (const pdfFile of pdfFiles) {
          console.log(`  🔄 Adding: ${pdfFile.name}`)
          await addPDF(pdfFile, pdfFile.name)
          console.log(`  ✅ Added: ${pdfFile.name}`)
        }
      }

      console.log('🎉 All files processed successfully!')

    } catch (error) {
      console.error('Failed to select files:', error)
      setErrorMessage(`Failed to select files: ${error}`)
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
