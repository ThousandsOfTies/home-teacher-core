// 開発環境: localhost:3003、本番環境: Cloud Run
// VITE_API_URLが設定されていない場合は、本番環境（GitHub Pages）かローカル開発かを判定
const getApiBaseUrl = () => {
  // 環境変数が明示的に設定されている場合はそれを使用
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  // 本番環境（GitHub Pages）かどうかを判定
  const isProduction = window.location.hostname === 'thousandsofties.github.io'

  if (isProduction) {
    // Cloud Run ステージングURL（developブランチ用）
    return 'https://hometeacher-api-staging-n5ja4qrrqq-an.a.run.app/api'
  }

  // ローカル開発環境
  return 'http://localhost:3003/api'
}

const API_BASE_URL = getApiBaseUrl()

export interface Problem {
  problemNumber: string
  problemText: string
  studentAnswer: string
  isCorrect: boolean
  correctAnswer: string
  feedback: string
  explanation: string
  printedPageNumber?: number  // AIが検出した印刷されたページ番号（見開きPDF対応）
  matchingMetadata?: {
    method: 'exact' | 'ai' | 'context' | 'hybrid';
    confidence?: string;
    reasoning?: string;
    candidates?: string[];
    similarity?: number;
  }
  // 採点ソース情報（デバッグ・確認用）
  gradingSource?: 'db' | 'ai';  // 正解の判定元：DBの登録解答 or AIの推論
  dbMatchedAnswer?: {           // DBから取得した解答情報（マッチした場合）
    problemNumber: string;
    correctAnswer: string;
    problemPageNumber?: number;
    pageNumber: number;
  };
}

export interface GradingResult {
  problems: Problem[]
  overallComment: string
  rawResponse?: string
  printedPageNumber?: number  // AIが検出した印刷されたページ番号（見開きPDF対応）
}

export interface GradeResponse {
  success: boolean
  result: GradingResult
  modelName?: string
  responseTime?: number
  error?: string
}

export const gradeWork = async (
  imageData: string,
  pageNumber: number,
  problemContext?: string,
  model?: string
): Promise<GradeResponse> => {
  try {
    // ユーザーの言語設定を取得（例: 'ja', 'en-US', 'zh-CN'）
    const userLanguage = navigator.language

    console.log('採点リクエスト送信:', {
      url: `${API_BASE_URL}/grade`,
      pageNumber,
      language: userLanguage,
      model: model || 'default',
      imageDataSize: imageData.length
    })

    const response = await fetch(`${API_BASE_URL}/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData,
        pageNumber,
        problemContext,
        language: userLanguage,
        model: model || undefined, // モデルが指定されている場合のみ送信
      }),
    })

    console.log('サーバーレスポンス:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type')
    })

    if (!response.ok) {
      // レスポンスボディを取得してエラーを詳細に表示
      const contentType = response.headers.get('content-type')
      let errorMessage = '採点に失敗しました'

      try {
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.details || errorMessage
        } else {
          const errorText = await response.text()
          errorMessage = errorText || `HTTPエラー: ${response.status} ${response.statusText}`
        }
      } catch (parseError) {
        errorMessage = `HTTPエラー: ${response.status} ${response.statusText}`
      }

      throw new Error(errorMessage)
    }

    // レスポンスボディが空でないか確認
    const responseText = await response.text()
    if (!responseText || responseText.trim() === '') {
      throw new Error('サーバーから空のレスポンスが返されました')
    }

    // JSONをパース
    try {
      const result = JSON.parse(responseText)
      console.log('採点結果を受信:', result)
      return result
    } catch (parseError) {
      console.error('JSONパースエラー:', parseError)
      console.error('レスポンステキスト:', responseText.substring(0, 500))
      throw new Error('サーバーからの応答を解析できませんでした: ' + (parseError instanceof Error ? parseError.message : String(parseError)))
    }
  } catch (error) {
    console.error('API Error:', error)
    throw error
  }
}

// 文脈ベース採点（2画像送信：フルページ + 選択範囲）
export const gradeWorkWithContext = async (
  fullPageImageData: string,
  croppedImageData: string,
  pageNumber: number,
  model?: string
): Promise<GradeResponse> => {
  try {
    const userLanguage = navigator.language

    console.log('🎯 文脈ベース採点リクエスト送信:', {
      url: `${API_BASE_URL}/grade-with-context`,
      pageNumber,
      language: userLanguage,
      model: model || 'default',
      fullPageSize: fullPageImageData.length,
      croppedSize: croppedImageData.length
    })

    const response = await fetch(`${API_BASE_URL}/grade-with-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pageFullImage: fullPageImageData,
        croppedImage: croppedImageData,
        pageNumber,
        language: userLanguage,
        model: model || undefined,
      }),
    })

    if (!response.ok) {
      const contentType = response.headers.get('content-type')
      let errorMessage = '採点に失敗しました'

      try {
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.details || errorMessage
        } else {
          const errorText = await response.text()
          errorMessage = errorText || `HTTPエラー: ${response.status} ${response.statusText}`
        }
      } catch (parseError) {
        errorMessage = `HTTPエラー: ${response.status} ${response.statusText}`
      }

      throw new Error(errorMessage)
    }

    const responseText = await response.text()
    if (!responseText || responseText.trim() === '') {
      throw new Error('サーバーから空のレスポンスが返されました')
    }

    try {
      const result = JSON.parse(responseText)
      console.log('✅ 文脈ベース採点結果を受信:', result)
      return result
    } catch (parseError) {
      console.error('JSONパースエラー:', parseError)
      throw new Error('サーバーからの応答を解析できませんでした')
    }
  } catch (error) {
    console.error('Context-based Grading API Error:', error)
    throw error
  }
}

export const checkHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`)
    return response.ok
  } catch {
    return false
  }
}

export interface ModelInfo {
  id: string
  name: string
  description: string
}

export interface ModelsResponse {
  models: ModelInfo[]
  default: string
}

export const getAvailableModels = async (): Promise<ModelsResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/models`)
    if (!response.ok) {
      throw new Error('モデル一覧の取得に失敗しました')
    }
    return await response.json()
  } catch (error) {
    console.error('Models API Error:', error)
    // フォールバック: デフォルトのモデルリストを返す
    return {
      models: [
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: '実験版の高速モデル' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '高性能な安定版モデル' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '高速な安定版モデル' }
      ],
      default: 'gemini-2.0-flash-exp'
    }
  }
}

// ========================================
// 解答抽出API（採点精度改善 PoC）
// ========================================

export interface ExtractedAnswer {
  problemNumber: string
  correctAnswer: string
}

export interface ExtractAnswersResponse {
  success: boolean
  pageNumber: number
  answers: ExtractedAnswer[]
  pageInfo?: {
    totalProblems?: number
    description?: string
  }
  responseTime?: number
  error?: string
}

// 解答ページから解答を抽出
export const extractAnswers = async (
  imageData: string,
  pageNumber: number
): Promise<ExtractAnswersResponse> => {
  try {
    const userLanguage = navigator.language

    console.log('📖 解答抽出リクエスト送信:', {
      url: `${API_BASE_URL}/extract-answers`,
      pageNumber,
      imageDataSize: imageData.length
    })

    const response = await fetch(`${API_BASE_URL}/extract-answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData,
        pageNumber,
        language: userLanguage,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTPエラー: ${response.status}`)
    }

    const result = await response.json()
    console.log('📝 解答抽出結果:', result)
    return result

  } catch (error) {
    console.error('❌ 解答抽出エラー:', error)
    throw error
  }
}

// ========================================
// 問題ページ分析API
// ========================================

export interface AnalyzedProblem {
  problemNumber: string
  type: string
  hasDiagram: boolean
  topic?: string
}

export interface AnalyzeProblemPageResponse {
  success: boolean
  pageNumber: number
  problems: AnalyzedProblem[]
  totalProblems: number
  pageType?: string
  responseTime?: number
  error?: string
}

// 問題ページの構造を分析
export const analyzeProblemPage = async (
  imageData: string,
  pageNumber: number
): Promise<AnalyzeProblemPageResponse> => {
  try {
    const userLanguage = navigator.language

    console.log('🔍 問題ページ分析リクエスト送信:', {
      url: `${API_BASE_URL}/analyze-problem-page`,
      pageNumber,
      imageDataSize: imageData.length
    })

    const response = await fetch(`${API_BASE_URL}/analyze-problem-page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData,
        pageNumber,
        language: userLanguage,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTPエラー: ${response.status}`)
    }

    const result = await response.json()
    console.log('📊 問題ページ分析結果:', result)
    return result

  } catch (error) {
    console.error('❌ 問題ページ分析エラー:', error)
    throw error
  }
}

// ========================================
// 汎用ページ分析API（問題/解答自動判定）
// ========================================

export interface UniversalPageResponse {
  success: boolean
  pageType: 'problem' | 'answer' | 'unknown'
  pageNumber: number
  data: any // ページタイプに応じて problems または answers
  responseTime?: number
  error?: string
}

// ページを分析（問題ページか解答ページか自動判定）
export const analyzePage = async (
  imageData: string,
  pageNumber: number
): Promise<UniversalPageResponse> => {
  try {
    const userLanguage = navigator.language

    console.log('🔍 汎用ページ分析リクエスト送信:', {
      url: `${API_BASE_URL}/analyze-page`,
      pageNumber,
      imageDataSize: imageData.length
    })

    const response = await fetch(`${API_BASE_URL}/analyze-page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageData,
        pageNumber,
        language: userLanguage,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTPエラー: ${response.status}`)
    }

    const result = await response.json()
    console.log(`📄 ページ分析結果 (${result.pageType}):`, result)
    return result

  } catch (error) {
    console.error('❌ 汎用ページ分析エラー:', error)
    throw error
  }
}
