import { GoogleGenerativeAI } from '@google/generative-ai'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003'

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
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ],
    default: 'gemini-2.0-flash-exp'
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
