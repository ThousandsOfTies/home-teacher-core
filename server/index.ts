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
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY || ''})

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

app.listen(port, () => {
  console.log(`\n🚀 APIサーバーが起動しました!`)
  console.log(`   http://localhost:${port}`)
  console.log(`\n🤖 Gemini API Key: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-api-key-here' ? '設定済み ✅' : '未設定 ❌'}`)
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here') {
    console.log('\n⚠️  .envファイルにGEMINI_API_KEYを設定してください')
    console.log('   https://makersuite.google.com/app/apikey\n')
  }
})
