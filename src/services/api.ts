// 型定義
export interface AnalyzePageResponse {
  success: boolean
  pageType: 'answer' | 'problem' | 'other'
  data: {
    answers: Array<{
      problemNumber: string
      correctAnswer: string
      problemPage: number | null
      sectionName?: string
    }>
    printedPageNumber?: number | null
  }
}

export interface GradeResponse {
  isCorrect: boolean
  correctAnswer: string
  feedback: string
  explanation: string
  confidence?: string
  extractedText?: string
}

export type GradingResult = GradeResponse // Alias for compatibility with StudyPanel

export interface ModelInfo {
  id: string
  name: string
  description?: string
}

export interface ModelInfoResponse {
  default: string
  models: ModelInfo[]
}


// 環境変数からAPIのベースURLを取得（Viteの環境変数）
// see: https://vitejs.dev/guide/env-and-mode.html
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://hometeacher-api-736494768812.asia-northeast1.run.app'

console.log('🔌 API Base URL:', API_BASE_URL)

/**
 * 汎用的なページ解析API
 * 画像全体を送信して、問題番号と正答のペア、およびセクション名を抽出する
 */
export const analyzePage = async (
  imageData: string,
  pageNumber: number,
  language: string = 'ja'
): Promise<AnalyzePageResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analyze-page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData,
        pageNumber,
        language,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTPエラー: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    console.log(`📄 ページ解析結果 (${result.pageType}):`, result)
    return result
  } catch (error) {
    console.error('❌ ページ解析エラー:', error)
    throw error
  }
}

/**
 * コンテキスト付き採点API
 * 問題の切り抜き画像と、ページ全体のコンテキスト画像を送信して採点を行う
 */
export const gradeWorkWithContext = async (
  problemImage: string,
  contextImage: string,
  problemNumber: string,
  studentAnswer: string, // 手書き文字認識結果など（オプショナル）
  pageNumber: number,
  model?: string
): Promise<GradeResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData: problemImage, // 切り抜き画像
        contextImage,            // ページ全体（低解像度）
        problemNumber,
        studentAnswer,
        pageNumber,
        model
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API Error Response:', errorData);
      throw new Error(errorData.error || `HTTPエラー: ${response.status}`)
    }

    const result = await response.json()
    return result
  } catch (error) {
    console.error('❌ 採点エラー:', error)
    throw error
  }
}

/**
 * 利用可能なAIモデル一覧を取得
 */
export const getAvailableModels = async (): Promise<ModelInfoResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/models`)
    if (!response.ok) {
      // エンドポイントがない場合はデフォルトを返す（後方互換性）
      return {
        default: 'gemini-1.5-flash',
        models: [
          { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Default)', description: '高速・低コスト' },
          { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '高精度・推論能力が高い' }
        ]
      }
    }
    return await response.json()
  } catch (error) {
    console.warn('⚠️ モデル一覧取得失敗、デフォルトを使用:', error)
    return {
      default: 'gemini-1.5-flash',
      models: [
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Default)', description: '高速・低コスト' }
      ]
    }
  }
}
