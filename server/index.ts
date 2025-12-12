import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'
import fs from 'fs'

dotenv.config()

const app = express()
const port = process.env.PORT || 3003

// 利用可能なGeminiモデルのマッピング
const AVAILABLE_MODELS: Record<string, { id: string; name: string; description: string }> = {
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: '最新の高速安定版モデル（2025年6月リリース）'
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: '最新の高性能安定版モデル（2025年6月リリース）'
  },
  'gemini-2.0-flash-exp': {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash (Experimental)',
    description: '実験版の高速モデル'
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: '安定版の高速モデル'
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: '高性能な安定版モデル'
  },
  'gemini-1.5-flash': {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: '高速な安定版モデル'
  }
}

// CORS設定（セキュリティ強化版）
const allowedOrigins = [
  // 本番環境（GitHub Pages）
  'https://thousandsofties.github.io',

  // ステージング環境（GitHub Pages）
  // Note: 同じドメインなので本番URLで両方カバーされる

  // 開発環境（localhost全般を許可）
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
]

app.use(cors({
  origin: (origin, callback) => {
    // originがundefined = 同一オリジンリクエスト（許可）
    if (!origin) return callback(null, true)

    // 許可リストチェック（文字列またはRegex）
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin
      } else {
        return allowed.test(origin)
      }
    })

    if (isAllowed) {
      callback(null, true)
    } else {
      console.warn(`🚫 CORS blocked: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}))

app.use(express.json({ limit: '50mb' }))

// Gemini APIクライアント (新SDK)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// シンプルなレート制限（メモリベース）
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15分
const RATE_LIMIT_MAX = 20 // 15分間に20リクエストまで

const checkRateLimit = (identifier: string): boolean => {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)

  if (!record || now > record.resetTime) {
    // 新規または期限切れ
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (record.count >= RATE_LIMIT_MAX) {
    // 制限超過
    return false
  }

  // カウント増加
  record.count++
  return true
}

// 採点エンドポイント
app.post('/api/grade', async (req, res) => {
  // レート制限チェック（IPアドレスベース）
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'リクエストが多すぎます',
      details: '15分後に再度お試しください'
    })
  }
  try {
    const { imageData, pageNumber, problemContext, language, model } = req.body

    if (!imageData) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    console.log(`🤖 リクエストされたモデル: ${model || 'default'}`)


    // 言語マッピング（navigator.language → 言語名）
    const languageMap: Record<string, string> = {
      'ja': 'Japanese',
      'en': 'English',
      'zh': 'Chinese',
      'ko': 'Korean',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'th': 'Thai',
      'vi': 'Vietnamese',
      'id': 'Indonesian',
    }

    // 言語コードの最初の部分を取得（例: 'en-US' → 'en'）
    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = languageMap[langCode] || 'Japanese'

    console.log(`🌍 ユーザー言語: ${language} → レスポンス言語: ${responseLang}`)

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here') {
      return res.status(500).json({
        error: 'Gemini APIキーが設定されていません',
        details: '.envファイルにGEMINI_API_KEYを設定してください'
      })
    }

    // Base64からメディアタイプとデータを抽出
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!base64Match) {
      return res.status(400).json({ error: '無効な画像データ形式です' })
    }

    const mimeType = `image/${base64Match[1]}`
    const base64Data = base64Match[2]

    // デバッグ: 画像を保存
    const debugImagePath = './debug-image.jpg'
    fs.writeFileSync(debugImagePath, Buffer.from(base64Data, 'base64'))
    console.log(`🖼️ デバッグ画像を保存: ${debugImagePath}`)

    // モデル選択ロジック
    // 1. リクエストで指定されたモデルを優先
    // 2. なければ環境変数 GEMINI_MODEL
    // 3. デフォルトは gemini-2.0-flash-exp
    let preferredModelName = model || process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'

    // モデル名をマッピング（Geminiモデルの場合）
    if (preferredModelName in AVAILABLE_MODELS) {
      preferredModelName = AVAILABLE_MODELS[preferredModelName].id
    }

    // Gemini以外のモデル（GPT/Claude）が指定された場合の処理
    if (preferredModelName.startsWith('gpt-') || preferredModelName.startsWith('o1') || preferredModelName.startsWith('claude-')) {
      console.warn(`⚠️ ${preferredModelName} は未対応です。Geminiモデルにフォールバックします。`)
      preferredModelName = 'gemini-2.0-flash-exp'
    }

    const fallbackModelName = 'gemini-2.0-flash-exp'

    console.log(`🤖 使用するモデル: ${preferredModelName}`)

    const prompt = `You are an experienced teacher grading student work. Analyze this image carefully and provide detailed, educational feedback.

IMPORTANT GUIDELINES:
- Only grade problems that are clearly visible in the image
- Transcribe problem text and student answers exactly as shown
- For geometry/diagrams: reference specific numbers, angles, and labels visible in the image
- Provide thorough explanations that help students understand their mistakes
- Use encouraging language while being accurate about correctness

For each problem visible in the image:
1. Identify the problem number/letter (if labeled)
2. Transcribe the problem text
3. Read the student's handwritten answer carefully
4. Determine if the answer is correct
5. Provide detailed feedback:
   - If CORRECT: Explain the reasoning/steps that lead to the correct answer
   - If INCORRECT: Explain what went wrong, show the correct solution step-by-step
6. Use specific mathematical terminology and concepts

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "problems": [
    {
      "problemNumber": "1" or "A" or null,
      "problemText": "exact problem text from image",
      "studentAnswer": "student's handwritten answer",
      "isCorrect": true or false,
      "correctAnswer": "correct answer (null if student is correct)",
      "feedback": "encouraging comment about their work",
      "explanation": "detailed step-by-step explanation of the solution, including relevant mathematical concepts and reasoning. For geometry problems, reference specific angles, sides, and properties. Be thorough and educational."
    }
  ],
  "overallComment": "overall evaluation of student's work with encouragement and suggestions for improvement"
}

LANGUAGE: All text must be in ${responseLang}.
OUTPUT: Valid JSON only - no markdown formatting, no code blocks.`

    // Gemini APIにリクエスト（モデルフォールバック機能付き）
    let result
    let lastError
    let usedModelName = preferredModelName
    let elapsedTime = 0
    const startTime = Date.now()

    // 優先モデルで試行
    try {
      console.log(`⏱️ 採点リクエスト開始 (${preferredModelName})...`)

      result = await ai.models.generateContent({
        model: preferredModelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              },
              { text: prompt }
            ]
          }
        ],
        config: {
          temperature: 0.2, // 決定論的な採点
          maxOutputTokens: 4096, // 速度優先で削減
          topP: 0.95,
          topK: 40,
        }
      })

      elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))
      console.log(`✅ APIレスポンス (${preferredModelName}): ${elapsedTime}秒`)
    } catch (error: any) {
      lastError = error
      console.warn(`⚠️ ${preferredModelName} で失敗:`, error.message)

      // フォールバックモデルで再試行（優先モデルと異なる場合のみ）
      if (preferredModelName !== fallbackModelName) {
        try {
          console.log(`🔄 フォールバック: ${fallbackModelName} で再試行...`)

          result = await ai.models.generateContent({
            model: fallbackModelName,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Data
                    }
                  },
                  { text: prompt }
                ]
              }
            ],
            config: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              topP: 0.95,
              topK: 40,
            }
          })

          usedModelName = fallbackModelName
          elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))
          console.log(`✅ APIレスポンス (${fallbackModelName}): ${elapsedTime}秒`)
        } catch (fallbackError: any) {
          console.error(`❌ ${fallbackModelName} でも失敗:`, fallbackError.message)
          throw fallbackError
        }
      } else {
        throw error
      }
    }

    if (!result) {
      throw lastError
    }

    console.log(`📊 使用されたモデル: ${usedModelName}`)

    // 新SDKのレスポンス取得方法
    // @google/genai SDK では candidates[0].content.parts[0].text からテキストを取得
    let responseText = ''

    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0]

      // finishReasonを確認
      if (candidate.finishReason === 'MAX_TOKENS') {
        console.warn('⚠️ 警告: 最大トークン数に達しました。maxOutputTokensを増やします')
      }

      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        responseText = candidate.content.parts[0].text || ''
      }
    }

    if (!responseText) {
      console.error('❌ レスポンスにテキストが含まれていません')
      console.log('result全体:', JSON.stringify(result, null, 2).substring(0, 1000))
      throw new Error('Gemini APIからテキストレスポンスを取得できませんでした')
    }

    // デバッグ用：生の応答をログ出力
    console.log('=== Gemini API 応答 ===')
    console.log(responseText.substring(0, 500) + '...') // 最初の500文字
    console.log('テキスト長:', responseText.length)
    console.log('=====================')

    // JSONを抽出（プロンプトでmarkdownブロック禁止を指示しているが、念のため両対応）
    let gradingResult

    // まずmarkdown形式を試す（```json ... ```）
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/)
    if (jsonMatch) {
      try {
        gradingResult = JSON.parse(jsonMatch[1])
        console.log('✅ JSON抽出成功 (markdown形式)')
      } catch (parseError) {
        console.warn('⚠️ Markdownブロック内のJSONパースに失敗:', parseError)
        gradingResult = null
      }
    }

    // markdownブロックがないか、パースに失敗した場合は直接JSON抽出を試す
    if (!gradingResult) {
      try {
        const jsonStart = responseText.indexOf('{')
        const jsonEnd = responseText.lastIndexOf('}') + 1
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const jsonString = responseText.substring(jsonStart, jsonEnd)
          gradingResult = JSON.parse(jsonString)
          console.log('✅ JSON抽出成功 (直接形式)')
        } else {
          throw new Error('JSON構造が見つかりません')
        }
      } catch (parseError) {
        console.error('❌ JSONパース失敗:', parseError)
        // JSON形式でない場合は、マークダウンブロックを除去してテキストを返す
        let cleanText = responseText
        // ```json ... ``` を除去
        cleanText = cleanText.replace(/```json\n/g, '').replace(/\n```/g, '')
        // 先頭の説明文も除去（"以下のJSON形式で..."など）
        const jsonStart = cleanText.indexOf('{')
        if (jsonStart > 0) {
          cleanText = cleanText.substring(jsonStart)
        }

        gradingResult = {
          problems: [],
          overallComment: cleanText,
          rawResponse: responseText
        }
        console.warn('⚠️ フォールバック: マークダウン除去後のテキストを返します')
      }
    }

    res.json({
      success: true,
      result: gradingResult,
      modelName: usedModelName,
      responseTime: elapsedTime,
    })
  } catch (error) {
    console.error('採点エラー:', error)
    res.status(500).json({
      error: '採点処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

// 利用可能なモデル一覧を取得
app.get('/api/models', (req, res) => {
  res.json({
    models: Object.values(AVAILABLE_MODELS),
    default: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
  })
})

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiApiKey: process.env.GEMINI_API_KEY ? '設定済み' : '未設定'
  })
})

// ========================================
// 解答抽出API（採点精度改善 PoC）
// ========================================

// 解答ページから解答を抽出
app.post('/api/extract-answers', async (req, res) => {
  // レート制限チェック（IPアドレスベース）
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'リクエストが多すぎます',
      details: '15分後に再度お試しください'
    })
  }

  try {
    const { imageData, pageNumber, language } = req.body

    if (!imageData) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    console.log(`📖 解答抽出開始: ページ ${pageNumber}`)

    // Base64からメディアタイプとデータを抽出
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!base64Match) {
      return res.status(400).json({ error: '無効な画像データ形式です' })
    }

    const mimeType = `image/${base64Match[1]}`
    const base64Data = base64Match[2]

    // 言語設定
    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = langCode === 'ja' ? 'Japanese' : 'English'

    const extractionPrompt = `You are extracting answers from an answer key page of a workbook/textbook.

Analyze this image carefully and extract ALL answers visible on this page.

For EACH answer visible:
1. Identify the problem number (e.g., "1", "問1", "A", "(1)")
2. Extract the correct answer EXACTLY as shown
3. Include units if present (cm, °, ㎠, etc.)

Return ONLY valid JSON in this format:
{
  "answers": [
    {
      "problemNumber": "1",
      "correctAnswer": "12cm"
    },
    {
      "problemNumber": "2", 
      "correctAnswer": "60°"
    }
  ],
  "pageInfo": {
    "totalProblems": 5,
    "description": "brief description of the page content"
  }
}

IMPORTANT:
- Extract ALL answers visible on the page
- Preserve exact formatting (units, symbols, fractions)
- For geometry: include units (cm, °, cm², etc.)
- If answer has multiple parts, list each separately: "問1(1)", "問1(2)"
- Return ONLY valid JSON, no markdown

LANGUAGE: ${responseLang}`

    const startTime = Date.now()

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            { text: extractionPrompt }
          ]
        }
      ],
      config: {
        temperature: 0.1, // 正確性重視
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40,
      }
    })

    const elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))
    console.log(`✅ 解答抽出完了: ${elapsedTime}秒`)

    // レスポンスからテキストを取得
    let responseText = ''
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0]
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        responseText = candidate.content.parts[0].text || ''
      }
    }

    if (!responseText) {
      throw new Error('APIからレスポンスを取得できませんでした')
    }

    // JSONを抽出
    let extractedData
    try {
      const jsonStart = responseText.indexOf('{')
      const jsonEnd = responseText.lastIndexOf('}') + 1
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonString = responseText.substring(jsonStart, jsonEnd)
        extractedData = JSON.parse(jsonString)
      } else {
        throw new Error('JSON構造が見つかりません')
      }
    } catch (parseError) {
      console.error('❌ JSONパース失敗:', parseError)
      console.error('レスポンス:', responseText.substring(0, 500))
      return res.status(500).json({
        error: '解答の抽出に失敗しました',
        details: 'AIレスポンスの解析エラー',
        rawResponse: responseText.substring(0, 500)
      })
    }

    console.log(`📝 抽出された解答: ${extractedData.answers?.length || 0}件`)

    res.json({
      success: true,
      pageNumber: pageNumber,
      answers: extractedData.answers || [],
      pageInfo: extractedData.pageInfo || {},
      responseTime: elapsedTime
    })

  } catch (error) {
    console.error('❌ 解答抽出エラー:', error)
    res.status(500).json({
      error: '解答抽出中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

// 問題ページの構造を分析
app.post('/api/analyze-problem-page', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'リクエストが多すぎます',
      details: '15分後に再度お試しください'
    })
  }

  try {
    const { imageData, pageNumber, language } = req.body

    if (!imageData) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    console.log(`📖 問題ページ分析開始: ページ ${pageNumber}`)

    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!base64Match) {
      return res.status(400).json({ error: '無効な画像データ形式です' })
    }

    const mimeType = `image/${base64Match[1]}`
    const base64Data = base64Match[2]

    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = langCode === 'ja' ? 'Japanese' : 'English'

    const analysisPrompt = `You are analyzing a problem page from a workbook/textbook to understand its structure.

Analyze this page carefully and extract:

1. Page number (if visible on the page)
2. ALL problem numbers visible on this page
3. For each problem:
   - Problem number (e.g., "1", "問1", "1(1)", "A")
   - Problem type (brief description: "angle calculation", "area calculation", etc.)
   - Whether it has a diagram/image

Return ONLY valid JSON in this format:
{
  "pageNumber": 5,
  "problems": [
    {
      "problemNumber": "1(1)",
      "type": "triangle angle calculation",
      "hasDiagram": true,
      "topic": "geometry"
    },
    {
      "problemNumber": "1(2)",
      "type": "triangle angle calculation",
      "hasDiagram": true,
      "topic": "geometry"
    }
  ],
  "totalProblems": 2,
  "pageType": "practice" 
}

IMPORTANT:
- Extract ALL problem numbers exactly as shown
- Identify whether problems have diagrams
- Brief problem type descriptions
- Return ONLY valid JSON, no markdown

LANGUAGE: ${responseLang}`

    const startTime = Date.now()

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            { text: analysisPrompt }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40,
      }
    })

    const elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))
    console.log(`✅ 問題ページ分析完了: ${elapsedTime}秒`)

    let responseText = ''
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0]
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        responseText = candidate.content.parts[0].text || ''
      }
    }

    if (!responseText) {
      throw new Error('APIからレスポンスを取得できませんでした')
    }

    let analyzedData
    try {
      const jsonStart = responseText.indexOf('{')
      const jsonEnd = responseText.lastIndexOf('}') + 1
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonString = responseText.substring(jsonStart, jsonEnd)
        analyzedData = JSON.parse(jsonString)
      } else {
        throw new Error('JSON構造が見つかりません')
      }
    } catch (parseError) {
      console.error('❌ JSONパース失敗:', parseError)
      console.error('レスポンス:', responseText.substring(0, 500))
      return res.status(500).json({
        error: '問題ページの分析に失敗しました',
        details: 'AIレスポンスの解析エラー',
        rawResponse: responseText.substring(0, 500)
      })
    }

    console.log(`📝 抽出された問題: ${analyzedData.problems?.length || 0}件`)

    res.json({
      success: true,
      pageNumber: pageNumber,
      problems: analyzedData.problems || [],
      totalProblems: analyzedData.totalProblems || 0,
      pageType: analyzedData.pageType || 'unknown',
      responseTime: elapsedTime
    })

  } catch (error) {
    console.error('❌ 問題ページ分析エラー:', error)
    res.status(500).json({
      error: '問題ページ分析中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

// ========================================
// 汎用ページ分析API（問題/解答自動判定）
// ========================================

app.post('/api/analyze-page', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'リクエストが多すぎます',
      details: '15分後に再度お試しください'
    })
  }

  try {
    const { imageData, pageNumber, language } = req.body

    if (!imageData) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    console.log(`🔍 汎用ページ分析開始: ページ ${pageNumber}`)

    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!base64Match) {
      return res.status(400).json({ error: '無効な画像データ形式です' })
    }

    const mimeType = `image/${base64Match[1]}`
    const base64Data = base64Match[2]

    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = langCode === 'ja' ? 'Japanese' : 'English'

    const universalPrompt = `You are analyzing a page from a workbook/textbook.

First, determine if this is a PROBLEM PAGE or an ANSWER KEY PAGE.

Then extract the appropriate information:

**If this is a PROBLEM PAGE:**
Extract the structure:
- Page number (if visible)
- All problem numbers
- Problem types
- Whether problems have diagrams

**If this is an ANSWER KEY PAGE:**
Extract the answers:
- Problem numbers
- Correct answers (with units)

Return ONLY valid JSON in ONE of these formats:

**For PROBLEM PAGE:**
{
  "pageType": "problem",
  "pageNumber": 5,
  "problems": [
    {
      "problemNumber": "1(1)",
      "type": "triangle angle calculation",
      "hasDiagram": true,
      "topic": "geometry"
    }
  ],
  "totalProblems": 1
}

**For ANSWER KEY PAGE:**
{
  "pageType": "answer",
  "pageNumber": 191,
  "answers": [
    {
      "problemNumber": "1(1)",
      "correctAnswer": "75°"
    }
  ],
  "totalAnswers": 1
}

IMPORTANT:
- Accurately determine page type
- Extract ALL items on the page
- Preserve exact formatting
- Return ONLY valid JSON, no markdown

LANGUAGE: ${responseLang}`

    const startTime = Date.now()

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            { text: universalPrompt }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40,
      }
    })

    const elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))

    let responseText = ''
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0]
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        responseText = candidate.content.parts[0].text || ''
      }
    }

    if (!responseText) {
      throw new Error('APIからレスポンスを取得できませんでした')
    }

    let analyzedData
    try {
      const jsonStart = responseText.indexOf('{')
      const jsonEnd = responseText.lastIndexOf('}') + 1
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonString = responseText.substring(jsonStart, jsonEnd)
        analyzedData = JSON.parse(jsonString)
      } else {
        throw new Error('JSON構造が見つかりません')
      }
    } catch (parseError) {
      console.error('❌ JSONパース失敗:', parseError)
      console.error('レスポンス:', responseText.substring(0, 500))
      return res.status(500).json({
        error: 'ページ分析に失敗しました',
        details: 'AIレスポンスの解析エラー',
        rawResponse: responseText.substring(0, 500)
      })
    }

    const pageType = analyzedData.pageType || 'unknown'
    const itemCount = analyzedData.problems?.length || analyzedData.answers?.length || 0

    console.log(`✅ ページ分析完了: ${elapsedTime}秒`)
    console.log(`📄 ページタイプ: ${pageType}, アイテム数: ${itemCount}`)

    res.json({
      success: true,
      pageType: pageType,
      pageNumber: pageNumber,
      data: analyzedData,
      responseTime: elapsedTime
    })

  } catch (error) {
    console.error('❌ ページ分析エラー:', error)
    res.status(500).json({
      error: 'ページ分析中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

// ========================================
// AI問題番号マッチング（複数候補から選択）
// ========================================

app.post('/api/match-problem-number', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'リクエストが多すぎます',
      details: '15分後に再度お試しください'
    })
  }

  try {
    const { imageData, aiProblemNumber, candidates, language } = req.body

    if (!imageData || !aiProblemNumber || !candidates || candidates.length === 0) {
      return res.status(400).json({ error: '必要なパラメータが不足しています' })
    }

    console.log(`🤖 AI問題番号マッチング: "${aiProblemNumber}" (候補: ${candidates.length}件)`)

    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!base64Match) {
      return res.status(400).json({ error: '無効な画像データ形式です' })
    }

    const mimeType = `image/${base64Match[1]}`
    const base64Data = base64Match[2]

    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = langCode === 'ja' ? 'Japanese' : 'English'

    // 候補リストを作成
    const candidatesText = candidates
      .map((c: any, i: number) => `${i + 1}. ${c.problemNumber}`)
      .join('\n')

    const matchPrompt = `You are helping to match a problem number in this image.

The AI recognized the problem number as: "${aiProblemNumber}"

However, there are multiple possible matches in our database:
${candidatesText}

Please look at the image carefully and determine which of the above candidates best matches the problem being shown.

Consider:
- If you can see a sub-problem number like (1), (2), etc., use it
- If no sub-problem number is visible, choose the first one (usually (1))
- Look at the context and problem type to make the best match

Return ONLY a JSON object with this format:
{
  "selectedIndex": 1,
  "confidence": "high",
  "reasoning": "brief explanation"
}

The selectedIndex should be 1, 2, 3, etc. (matching the list above).

LANGUAGE: ${responseLang}`

    const startTime = Date.now()

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            { text: matchPrompt }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      }
    })

    const elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))

    let responseText = ''
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0]
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        responseText = candidate.content.parts[0].text || ''
      }
    }

    if (!responseText) {
      throw new Error('APIからレスポンスを取得できませんでした')
    }

    let matchData
    try {
      const jsonStart = responseText.indexOf('{')
      const jsonEnd = responseText.lastIndexOf('}') + 1
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonString = responseText.substring(jsonStart, jsonEnd)
        matchData = JSON.parse(jsonString)
      } else {
        throw new Error('JSON構造が見つかりません')
      }
    } catch (parseError) {
      console.error('❌ JSONパース失敗:', parseError)
      // フォールバック: 最初の候補を選択
      matchData = {
        selectedIndex: 1,
        confidence: 'low',
        reasoning: 'JSON parse error, defaulting to first candidate'
      }
    }

    const selectedIndex = matchData.selectedIndex || 1
    const selectedCandidate = candidates[selectedIndex - 1]

    console.log(`✅ マッチング完了: ${elapsedTime}秒`)
    console.log(`   選択: ${selectedCandidate?.problemNumber} (confidence: ${matchData.confidence})`)

    res.json({
      success: true,
      selectedIndex: selectedIndex,
      selectedCandidate: selectedCandidate,
      confidence: matchData.confidence || 'medium',
      reasoning: matchData.reasoning || '',
      responseTime: elapsedTime
    })

  } catch (error) {
    console.error('❌ AI問題番号マッチングエラー:', error)
    res.status(500).json({
      error: 'AI問題番号マッチング中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

// ========================================
// 文脈ベース採点API（ページ全体+切り出し画像）
// ========================================

app.post('/api/grade-with-context', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'リクエストが多すぎます',
      details: '15分後に再度お試しください'
    })
  }

  try {
    const { pageFullImage, croppedImage, pageNumber, language, model } = req.body

    if (!pageFullImage || !croppedImage) {
      return res.status(400).json({ error: 'ページ全体画像と切り出し画像の両方が必要です' })
    }

    console.log(`📖 文脈ベース採点開始: ページ ${pageNumber}`)

    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = langCode === 'ja' ? 'Japanese' : 'English'

    // 両方の画像を処理
    const pageMatch = pageFullImage.match(/^data:image\/(\w+);base64,(.+)$/)
    const cropMatch = croppedImage.match(/^data:image\/(\w+);base64,(.+)$/)

    if (!pageMatch || !cropMatch) {
      return res.status(400).json({ error: '無効な画像データ形式です' })
    }

    const contextPrompt = `You are grading student work with context awareness.

You have TWO images:
1. **Full Page Image**: Shows the entire page layout with all problems
2. **Cropped Image**: Shows the specific problem/answer the student worked on

Your task:
1. Look at the FULL PAGE to understand the layout and see ALL problem numbers on this page
2. Look at the CROPPED IMAGE to identify which specific problem this is
3. Determine the EXACT problem number by considering:
   - Position on the page (top/middle/bottom, left/right)
   - Visual context and surrounding problems
   - Sub-problem numbers like (1), (2), (3) if visible

4. Grade the student's work shown in the cropped image

Return ONLY valid JSON:
{
  "problemNumber": "exact problem number (e.g., '1(1)', '1(2)', '2')",
  "confidence": "high/medium/low",
  "positionReasoning": "brief explanation of how you identified the problem number from position",
  "problemText": "problem text from cropped image",
  "studentAnswer": "student's handwritten answer",
  "isCorrect": true or false,
  "correctAnswer": "correct answer if student is wrong",
  "feedback": "encouraging feedback",
  "explanation": "detailed explanation"
}

IMPORTANT:
- Be very precise about the problem number
- Use the full page layout to disambiguate sub-problems
- If you see "問1(1)" and "問1(2)" on the full page, determine which one the cropped image shows

LANGUAGE: ${responseLang}`

    const startTime = Date.now()

    const preferredModelName = model || process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'

    const result = await ai.models.generateContent({
      model: preferredModelName,
      contents: [
        {
          role: 'user',
          parts: [
            // 画像1: ページ全体
            {
              inlineData: {
                mimeType: pageMatch[1] === 'png' ? 'image/png' : 'image/jpeg',
                data: pageMatch[2]
              }
            },
            // 画像2: 切り出し部分
            {
              inlineData: {
                mimeType: cropMatch[1] === 'png' ? 'image/png' : 'image/jpeg',
                data: cropMatch[2]
              }
            },
            // プロンプト
            { text: contextPrompt }
          ]
        }
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40,
      }
    })

    const elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))

    let responseText = ''
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0]
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        responseText = candidate.content.parts[0].text || ''
      }
    }

    if (!responseText) {
      throw new Error('APIからレスポンスを取得できませんでした')
    }

    // JSONを抽出
    let gradingData
    try {
      const jsonStart = responseText.indexOf('{')
      const jsonEnd = responseText.lastIndexOf('}') + 1
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonString = responseText.substring(jsonStart, jsonEnd)
        gradingData = JSON.parse(jsonString)
      } else {
        throw new Error('JSON構造が見つかりません')
      }
    } catch (parseError) {
      console.error('❌ JSONパース失敗:', parseError)
      console.error('レスポンス:', responseText.substring(0, 500))
      return res.status(500).json({
        error: '採点結果の解析に失敗しました',
        details: 'AIレスポンスの解析エラー',
        rawResponse: responseText.substring(0, 500)
      })
    }

    console.log(`✅ 文脈ベース採点完了: ${elapsedTime}秒`)
    console.log(`   問題番号: ${gradingData.problemNumber} (信頼度: ${gradingData.confidence})`)
    console.log(`   位置推定: ${gradingData.positionReasoning}`)

    // Metadata structure normalization
    const problemWithMetadata = {
      ...gradingData,
      matchingMetadata: {
        method: 'context',
        confidence: gradingData.confidence,
        reasoning: gradingData.positionReasoning
      }
    };

    res.json({
      success: true,
      result: {
        problems: [problemWithMetadata],
        overallComment: `問題番号の特定: ${gradingData.positionReasoning}`
      },
      modelName: preferredModelName,
      responseTime: elapsedTime
    })

  } catch (error) {
    console.error('❌ 文脈ベース採点エラー:', error)
    res.status(500).json({
      error: '採点中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

// ========================================
// テキストEmbedding API（意味的類似度判定用）
// ========================================

app.post('/api/embed-text', async (req, res) => {
  try {
    const { texts } = req.body

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'テキスト配列が必要です' })
    }

    console.log(`🔢 Embedding生成: ${texts.length}件`)

    const embeddings = []

    for (const text of texts) {
      const result = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: [{ parts: [{ text }] }]
      })

      embeddings.push({
        text: text,
        embedding: result.embeddings[0].values
      })
    }

    console.log(`✅ Embedding生成完了`)

    res.json({
      success: true,
      embeddings: embeddings
    })

  } catch (error) {
    console.error('❌ Embedding生成エラー:', error)
    res.status(500).json({
      error: 'Embedding生成中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

// 2つのテキストの類似度を計算
app.post('/api/compare-texts', async (req, res) => {
  try {
    const { text1, text2 } = req.body

    if (!text1 || !text2) {
      return res.status(400).json({ error: '2つのテキストが必要です' })
    }

    console.log(`📊 類似度計算: "${text1}" vs "${text2}"`)

    // 両方のEmbeddingを生成
    const result1 = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: [{ parts: [{ text: text1 }] }]
    })

    const result2 = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: [{ parts: [{ text: text2 }] }]
    })

    const embedding1 = result1.embeddings[0].values
    const embedding2 = result2.embeddings[0].values

    // コサイン類似度を計算
    let dotProduct = 0
    let magnitude1 = 0
    let magnitude2 = 0

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      magnitude1 += embedding1[i] * embedding1[i]
      magnitude2 += embedding2[i] * embedding2[i]
    }

    const similarity = dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2))

    console.log(`✅ 類似度: ${similarity.toFixed(4)}`)

    res.json({
      success: true,
      text1: text1,
      text2: text2,
      similarity: similarity,
      // 閾値判定（80%に下げて短いテキストにも対応）
      isMatch: similarity > 0.80,  // 80%以上で一致と判定
      confidence: similarity > 0.90 ? 'high' : similarity > 0.80 ? 'medium' : 'low'
    })

  } catch (error) {
    console.error('❌ 類似度計算エラー:', error)
    res.status(500).json({
      error: '類似度計算中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})


app.listen(port, () => {
  console.log(`\n🚀 APIサーバーが起動しました!`)
  console.log(`   http://localhost:${port}`)
  console.log(`\n🤖 Gemini API Key: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-api-key-here' ? '設定済み ✅' : '未設定 ❌'}`)
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here') {
    console.log('\n⚠️  .envファイルにGEMINI_API_KEYを設定してください')
    console.log('   https://makersuite.google.com/app/apikey\n')
  }
})
