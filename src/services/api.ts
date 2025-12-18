import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * ============================================================================
 * 🔒 CRITICAL CONFIGURATION - DO NOT MODIFY WITHOUT READING
 * ============================================================================
 * 
 * For AI Agents: この設定は本番環境の基盤です。変更前に必ず確認してください。
 * See: /.agent/workflows/architecture-rules.md
 * 
 * PRODUCTION_API_URL を変更すると:
 * - GitHub Pages での採点機能が停止します
 * - 解答登録機能が停止します
 * - すべての API 呼び出しが失敗します
 * 
 * 変更が必要な場合（Cloud Run の URL が変わった場合のみ）:
 * 1. この定数を更新
 * 2. .github/workflows/deploy.yml の VITE_API_URL も同時に更新
 * 3. server/index.ts の CORS 設定も確認
 * ============================================================================
 */
const PRODUCTION_API_URL = 'https://hometeacher-api-n5ja4qrrqq-an.a.run.app'

/**
 * 環境を自動検出して適切な API URL を返す
 * 
 * 優先順位:
 * 1. 環境変数 VITE_API_URL（ビルド時に deploy.yml で注入）
 * 2. GitHub Pages の自動検出（*.github.io）
 * 3. 本番環境フォールバック（localhost 以外）
 * 4. ローカル開発用 localhost（開発時のみ）
 * 
 * この関数のロジックを変更する場合は、必ず GitHub Pages で動作確認してください。
 */
const getApiBaseUrl = (): string => {
  // 1. First, check environment variable (set during build in deploy.yml)
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl) {
    console.log('🌐 API Base URL (from env):', envUrl)
    return envUrl
  }

  // 2. Auto-detect GitHub Pages deployment
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname

    // If running on GitHub Pages, use production API
    if (hostname === 'thousandsofties.github.io' || hostname.endsWith('.github.io')) {
      console.log('🌐 API Base URL (GitHub Pages auto-detect):', PRODUCTION_API_URL)
      return PRODUCTION_API_URL
    }

    // If not localhost and not GitHub Pages, still use production (safer default)
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      console.log('🌐 API Base URL (production fallback):', PRODUCTION_API_URL)
      return PRODUCTION_API_URL
    }
  }

  // 3. Fallback to localhost only for local development
  console.log('🌐 API Base URL (localhost dev):', 'http://localhost:3003')
  return 'http://localhost:3003'
}

const API_BASE_URL = getApiBaseUrl()

export interface ModelInfo {
  id: string
  name: string
  description?: string
}

export interface AvailableModelsResponse {
  models: ModelInfo[]
  default: string
}

export interface Answer {
  problemNumber: string
  correctAnswer: string
  problemPage: number | null
  sectionName?: string
}

export interface AnalyzePageResponse {
  success: boolean
  data: {
    pageType: string
    answers: Answer[]
  }
  pageType: string
  result: any
  error?: string
}

export interface GradingResult {
  problemNumber: string
  studentAnswer: string
  correctAnswer?: string
  isCorrect?: boolean
  explanation?: string
  feedback?: string
  confidence?: string | number
  printedPageNumber?: number | null
  problemText?: string
  positionReasoning?: string
  overallComment?: string
  gradingSource?: string
  dbMatchedAnswer?: any
  matchingMetadata?: any
}

export interface GradingResponseResult {
  pageType?: string
  printedPageNumber?: number | null
  problems: GradingResult[]
  overallComment?: string
  rawResponse?: string
}

export interface GradeResponse {
  success: boolean
  modelName?: string
  responseTime?: number
  result: GradingResponseResult
  error?: string
}

export const getAvailableModels = async (): Promise<AvailableModelsResponse> => {
  // TODO: Fetch from server if endpoint exists
  // For now return hardcoded list matching server capabilities
  return {
    models: [
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash (latest)' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ],
    default: 'gemini-3-flash'
  }
}

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
      throw new Error(errorData.error || `HTTP Error: ${response.status}`)
    }

    const result = await response.json()
    console.log(`✅ Page Analysis Result (${result.pageType}):`, result)
    return result
  } catch (error) {
    console.error('❌ Page Analysis Error:', error)
    throw error
  }
}

export const gradeWorkWithContext = async (
  fullPageImageData: string,
  croppedImageData: string,
  pageNumber: number,
  model?: string
): Promise<GradeResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/grade-work-with-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullPageImageData,
        croppedImageData,
        pageNumber,
        model,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP Error: ${response.status}`)
    }

    const result = await response.json()
    console.log(`✅ Grading Result:`, result)
    return result
  } catch (error) {
    console.error('❌ Grading Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      result: { problems: [] }
    }
  }
}
