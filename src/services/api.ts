// 髢狗匱迺ｰ蠅・ localhost:3003縲∵悽逡ｪ迺ｰ蠅・ Cloud Run
// VITE_API_URL縺瑚ｨｭ螳壹＆繧後※縺・↑縺・ｴ蜷医・縲∵悽逡ｪ迺ｰ蠅・ｼ・itHub Pages・峨°繝ｭ繝ｼ繧ｫ繝ｫ髢狗匱縺九ｒ蛻､螳・
const getApiBaseUrl = () => {
  // 迺ｰ蠅・､画焚縺梧・遉ｺ逧・↓險ｭ螳壹＆繧後※縺・ｋ蝣ｴ蜷医・縺昴ｌ繧剃ｽｿ逕ｨ
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  // 譛ｬ逡ｪ迺ｰ蠅・ｼ・itHub Pages・峨°縺ｩ縺・°繧貞愛螳・
  const isProduction = window.location.hostname === 'thousandsofties.github.io'

  if (isProduction) {
    // Cloud Run 繧ｹ繝・・繧ｸ繝ｳ繧ｰURL・・evelop繝悶Λ繝ｳ繝∫畑・・
    return 'https://hometeacher-api-staging-n5ja4qrrqq-an.a.run.app/api'
  }

  // 繝ｭ繝ｼ繧ｫ繝ｫ髢狗匱迺ｰ蠅・
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
  printedPageNumber?: number  // AI縺梧､懷・縺励◆蜊ｰ蛻ｷ縺輔ｌ縺溘・繝ｼ繧ｸ逡ｪ蜿ｷ・郁ｦ矩幕縺恒DF蟇ｾ蠢懶ｼ・
  matchingMetadata?: {
    method: 'exact' | 'ai' | 'context' | 'hybrid';
    confidence?: string;
    reasoning?: string;
    candidates?: string[];
    similarity?: number;
  }
  // 謗｡轤ｹ繧ｽ繝ｼ繧ｹ諠・ｱ・医ョ繝舌ャ繧ｰ繝ｻ遒ｺ隱咲畑・・
  gradingSource?: 'db' | 'ai';  // 豁｣隗｣縺ｮ蛻､螳壼・・咼B縺ｮ逋ｻ骭ｲ隗｣遲・or AI縺ｮ謗ｨ隲・
  dbMatchedAnswer?: {           // DB縺九ｉ蜿門ｾ励＠縺溯ｧ｣遲疲ュ蝣ｱ・医・繝・メ縺励◆蝣ｴ蜷茨ｼ・
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
  printedPageNumber?: number  // AI縺梧､懷・縺励◆蜊ｰ蛻ｷ縺輔ｌ縺溘・繝ｼ繧ｸ逡ｪ蜿ｷ・郁ｦ矩幕縺恒DF蟇ｾ蠢懶ｼ・
}

export interface GradeResponse {
  success: boolean
  result: GradingResult
  modelName?: string
  responseTime?: number
  error?: string
}


// 譁・ц繝吶・繧ｹ謗｡轤ｹ・・逕ｻ蜒城∽ｿ｡・壹ヵ繝ｫ繝壹・繧ｸ + 驕ｸ謚樒ｯ・峇・・
export const gradeWorkWithContext = async (
  fullPageImageData: string,
  croppedImageData: string,
  pageNumber: number,
  model?: string
): Promise<GradeResponse> => {
  try {
    const userLanguage = navigator.language

    console.log('識 譁・ц繝吶・繧ｹ謗｡轤ｹ繝ｪ繧ｯ繧ｨ繧ｹ繝磯∽ｿ｡:', {
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
      let errorMessage = '謗｡轤ｹ縺ｫ螟ｱ謨励＠縺ｾ縺励◆'

      try {
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.details || errorMessage
        } else {
          const errorText = await response.text()
          errorMessage = errorText || `HTTP繧ｨ繝ｩ繝ｼ: ${response.status} ${response.statusText}`
        }
      } catch (parseError) {
        errorMessage = `HTTP繧ｨ繝ｩ繝ｼ: ${response.status} ${response.statusText}`
      }

      throw new Error(errorMessage)
    }

    const responseText = await response.text()
    if (!responseText || responseText.trim() === '') {
      throw new Error('繧ｵ繝ｼ繝舌・縺九ｉ遨ｺ縺ｮ繝ｬ繧ｹ繝昴Φ繧ｹ縺瑚ｿ斐＆繧後∪縺励◆')
    }

    try {
      const result = JSON.parse(responseText)
      console.log('笨・譁・ц繝吶・繧ｹ謗｡轤ｹ邨先棡繧貞女菫｡:', result)
      return result
    } catch (parseError) {
      console.error('JSON繝代・繧ｹ繧ｨ繝ｩ繝ｼ:', parseError)
      throw new Error('繧ｵ繝ｼ繝舌・縺九ｉ縺ｮ蠢懃ｭ斐ｒ隗｣譫舌〒縺阪∪縺帙ｓ縺ｧ縺励◆')
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
      throw new Error('繝｢繝・Ν荳隕ｧ縺ｮ蜿門ｾ励↓螟ｱ謨励＠縺ｾ縺励◆')
    }
    return await response.json()
  } catch (error) {
    console.error('Models API Error:', error)
    // 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 繝・ヵ繧ｩ繝ｫ繝医・繝｢繝・Ν繝ｪ繧ｹ繝医ｒ霑斐☆
    return {
      models: [
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: '螳滄ｨ鍋沿縺ｮ鬮倬溘Δ繝・Ν' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '鬮俶ｧ閭ｽ縺ｪ螳牙ｮ夂沿繝｢繝・Ν' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '鬮倬溘↑螳牙ｮ夂沿繝｢繝・Ν' }
      ],
      default: 'gemini-2.0-flash-exp'
    }
  }
}

// ========================================
// 豎守畑繝壹・繧ｸ蛻・梵API・亥撫鬘・隗｣遲碑・蜍募愛螳夲ｼ・
// ========================================

export interface UniversalPageResponse {
  success: boolean
  pageType: 'problem' | 'answer' | 'unknown'
  pageNumber: number
  data: any // 繝壹・繧ｸ繧ｿ繧､繝励↓蠢懊§縺ｦ problems 縺ｾ縺溘・ answers
  responseTime?: number
  error?: string
}

// 繝壹・繧ｸ繧貞・譫撰ｼ亥撫鬘後・繝ｼ繧ｸ縺玖ｧ｣遲斐・繝ｼ繧ｸ縺玖・蜍募愛螳夲ｼ・
export const analyzePage = async (
  imageData: string,
  pageNumber: number
): Promise<UniversalPageResponse> => {
  try {
    const userLanguage = navigator.language

    console.log('剥 豎守畑繝壹・繧ｸ蛻・梵繝ｪ繧ｯ繧ｨ繧ｹ繝磯∽ｿ｡:', {
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
      throw new Error(errorData.error || `HTTP繧ｨ繝ｩ繝ｼ: ${response.status}`)
    }

    const result = await response.json()
    console.log(`塘 繝壹・繧ｸ蛻・梵邨先棡 (${result.pageType}):`, result)
    return result

  } catch (error) {
    console.error('笶・豎守畑繝壹・繧ｸ蛻・梵繧ｨ繝ｩ繝ｼ:', error)
    throw error
  }
}
