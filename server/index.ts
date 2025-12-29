import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'

dotenv.config()

const app = express()
const port = process.env.PORT || 3003

// Increase payload size limit for base64 images
app.use(express.json({ limit: '50mb' }))
app.use(cors())

// Log API Key status (do not log the actual key)
console.log(`API Key status: ${process.env.GEMINI_API_KEY ? 'Present' : 'Missing'}`)

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY is not set in environment variables.')
}

// Google GenAI クライアント初期化
// gemini-2.0-flash-exp を使用（高速でコスト効率が良い）
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
console.log(`Using Gemini Model: ${MODEL_NAME}`)

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: MODEL_NAME })

// デフォルトモデルID
const DEFAULT_MODEL_ID = 'gemini-2.0-flash-exp'

// 利用可能なモデル一覧
const AVAILABLE_MODELS = [
  { id: DEFAULT_MODEL_ID, name: 'Gemini 2.0 Flash Exp', description: '高速でバランスの良いモデル（推奨）' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '高速で軽量なモデル' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '高精度で複雑な推論が可能' },
]

app.get('/api/models', (req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    default: DEFAULT_MODEL_ID
  })
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL_NAME })
})

// PDF Proxy endpoint to bypass CORS for external URLs
app.get('/api/proxy-pdf', async (req, res) => {
  try {
    const url = req.query.url as string

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' })
    }

    // Basic URL validation
    try {
      new URL(url)
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' })
    }

    // Only allow PDF files
    if (!url.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are allowed' })
    }

    console.log(`📥 Proxying PDF from: ${url}`)

    const response = await fetch(url)

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch: ${response.statusText}`
      })
    }

    const buffer = await response.arrayBuffer()

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${url.split('/').pop()}"`)
    res.send(Buffer.from(buffer))

    console.log(`✅ PDF proxied successfully: ${url}`)
  } catch (error) {
    console.error('❌ Proxy error:', error)
    res.status(500).json({ error: 'Failed to proxy PDF' })
  }
})

// 簡素化された採点API（切り抜き画像のみ）
app.post('/api/grade-work', async (req, res) => {
  try {
    const { croppedImageData, model: requestModel } = req.body

    if (!croppedImageData) {
      return res.status(400).json({ error: 'croppedImageData is required' })
    }

    const startTime = Date.now()
    console.log('Grading work (simplified)...')

    // Use requested model or default
    const currentModelName = requestModel || MODEL_NAME
    const currentModel = requestModel ? genAI.getGenerativeModel({ model: currentModelName }) : model

    // シンプルなプロンプト（切り抜き画像のみ）
    const simplePrompt = `あなたは小中学生の家庭教師です。以下の画像には生徒の解答が写っています。

この画像を見て：
1. 問題番号を特定してください（例: 1(1), 2(3) など）
2. 生徒の手書き解答を読み取ってください
3. 正誤判定をしてください
4. 正解とフィードバックを提供してください

【重要】以下のJSON形式のみを出力してください。前置きや説明文は絶対に含めないでください：
{
  "problemNumber": "問題番号（例: '1(1)', '2(3)'）",
  "studentAnswer": "生徒の解答",
  "isCorrect": true または false,
  "correctAnswer": "正解",
  "feedback": "励ましのフィードバック",
  "explanation": "解説"
}

JSONのみを出力してください。「はい」「承知しました」などの前置きは不要です。`

    // Extract mime type and clean base64
    const cropMatch = croppedImageData.match(/^data:(image\/(png|jpeg));base64,(.+)$/)
    const cropData = cropMatch ? cropMatch[3] : croppedImageData.replace(/^data:image\/\w+;base64,/, '')
    const cropMime = cropMatch ? cropMatch[1] : 'image/jpeg'

    const result = await currentModel.generateContent([
      {
        inlineData: {
          mimeType: cropMime,
          data: cropData
        }
      },
      { text: simplePrompt }
    ])

    const response = await result.response
    const responseText = response.text()

    if (!responseText) {
      throw new Error('Empty response from Gemini')
    }

    // JSONを抽出（マークダウンコードブロック除去 + JSON部分を探す）
    let jsonStr = responseText.replace(/```\w*\s*/g, '')
    // JSON部分を抽出（{から始まり}で終わる部分）
    const jsonStart = jsonStr.indexOf('{')
    const jsonEnd = jsonStr.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)
    }

    let gradingData
    try {
      gradingData = JSON.parse(jsonStr)
    } catch (e) {
      console.error("JSON Parse Error:", e)
      console.log("Raw Response:", responseText)
      throw new Error("Failed to parse AI response")
    }

    const elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))

    // Normalize gradingData to always be an array of problems
    let problems: any[] = []
    if (Array.isArray(gradingData)) {
      // AI returned an array of problems
      problems = gradingData.map((p: any) => ({ ...p, gradingSource: 'ai-simple' }))
    } else if (gradingData.problemNumber !== undefined) {
      // AI returned a single problem object
      problems = [{ ...gradingData, gradingSource: 'ai-simple' }]
    } else {
      // AI returned an object with numeric keys (e.g., {"0": {...}, "1": {...}})
      const numericKeys = Object.keys(gradingData).filter(k => /^\d+$/.test(k))
      if (numericKeys.length > 0) {
        problems = numericKeys.map(k => ({ ...gradingData[k], gradingSource: 'ai-simple' }))
      } else {
        // Fallback: treat as single problem
        problems = [{ ...gradingData, gradingSource: 'ai-simple' }]
      }
    }

    const responseData = {
      success: true,
      modelName: currentModelName,
      responseTime: elapsedTime,
      result: {
        problems,
        overallComment: gradingData.feedback || (problems[0] && problems[0].feedback)
      }
    }

    console.log(`Grading complete. Problem: ${gradingData.problemNumber}, Correct: ${gradingData.isCorrect}`)
    res.json(responseData)

  } catch (error) {
    console.error('Error in /api/grade-work:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
      details: String(error)
    })
  }
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
