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

app.post('/api/analyze-page', async (req, res) => {
  try {
    const { imageData, pageNumber, language = 'ja' } = req.body

    if (!imageData) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    console.log(`🔍 汎用ページ分析開始: ページ ${pageNumber}`)

    // Base64データの抽出
    const base64Match = imageData.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
    if (!base64Match) {
      return res.status(400).json({ error: '無効な画像データ形式です' })
    }

    const mimeType = `image/${base64Match[1]}`
    const base64Data = base64Match[2]

    // 日本語プロンプト（最も精度が高かったバージョン）
    const universalPrompt = `あなたは問題集・ドリルの解答ページを解析するAIです。

【タスク】
この画像から、すべての問題番号と正解を漏れなく抽出してください。

【重要なルール】
1. 問題番号は必ず「大問番号(小問番号)」の形式で出力すること
   例: 1(1), 1(2), 2(1), 2(2) など
   
2. 横に並んでいる解答も全て抽出すること
   例: 「1 (1) 105度 (2) 10度 (3) 47度 (4) 100度」
   → 1(1)=105度, 1(2)=10度, 1(3)=47度, 1(4)=100度
   
3. セクションヘッダーに「問題は○ページ」と書いてあれば、それをproblemPageとして記録

4. 「解説」の文章は無視して、答えの値のみを抽出すること

5. 複数の値を求める問題の場合（例: x と y を求めよ）:
   - 解答が「x=107°, y=47°」のように複数ある場合は、そのまま全て含めること
   - 例: correctAnswer: "x=107°, y=47°" または "x=107度, y=47度"

【出力形式】
必ず以下のJSON形式で出力してください（他のテキストは不要）:

{
  "pageType": "answer",
  "pageNumber": 78,
  "answers": [
    {"problemNumber": "1(1)", "correctAnswer": "105度", "problemPage": 6, "sectionName": "平面図形Ⅰ レベルA（問題は6ページ）"},
    {"problemNumber": "1(2)", "correctAnswer": "10度", "problemPage": 6, "sectionName": "平面図形Ⅰ レベルA（問題は6ページ）"},
    {"problemNumber": "1(3)", "correctAnswer": "x=107度, y=47度", "problemPage": 6, "sectionName": "平面図形Ⅰ レベルA（問題は6ページ）"},
    {"problemNumber": "1(4)", "correctAnswer": "100度", "problemPage": 6, "sectionName": "平面図形Ⅰ レベルA（問題は6ページ）"}
  ]
}

もしこれが問題ページ（解答ページではない）の場合は:
{
  "pageType": "problem",
  "pageNumber": 6,
  "problems": [{"problemNumber": "1(1)", "type": "計算", "hasDiagram": false}]
}

【最重要】
- すべての小問を漏れなく抽出すること
- 「(2)」だけでなく「1(2)」のように大問番号を必ず付けること
- 解説文は無視し、答えの数値・記号のみを抽出すること
- 複数値の解答（x, y など）は全ての値を含めること`

    const startTime = Date.now()

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      },
      { text: universalPrompt }
    ])

    const elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))

    const response = await result.response
    const responseText = response.text()

    if (!responseText) {
      throw new Error('APIからレスポンスを取得できませんでした')
    }

    // JSONを抽出
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

    // Add metadata
    analyzedData.pdfPage = pageNumber

    const pageType = analyzedData.pageType || 'unknown'
    const itemCount = analyzedData.answers?.length || analyzedData.problems?.length || 0

    console.log(`✅ ページ分析完了: ${elapsedTime}秒`)
    console.log(`📄 ページタイプ: ${pageType}, アイテム数: ${itemCount}`)

    // デバッグ: 解答ページの場合、各解答のproblemPageを表示
    if (pageType === 'answer' && analyzedData.answers) {
      console.log(`📋 解答詳細:`)
      analyzedData.answers.forEach((ans: any, i: number) => {
        console.log(`   ${i + 1}. ${ans.problemNumber} = "${ans.correctAnswer}" (問題ページ: ${ans.problemPage ?? '未設定'})`)
      })
    }

    res.json({
      success: true,
      data: analyzedData,
      pageType: analyzedData.pageType,
      result: analyzedData,
      responseTime: elapsedTime
    })

  } catch (error) {
    console.error('❌ ページ分析エラー:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
      details: String(error)
    })
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

// 後方互換性のため旧APIも維持（新APIにリダイレクト）
app.post('/api/grade-work-with-context', async (req, res) => {
  console.log('⚠️ /api/grade-work-with-context is deprecated, using simple grading')
  // 旧APIが呼ばれても新しいシンプルなロジックを使用
  const { croppedImageData, model: requestModel } = req.body

  try {
    const startTime = Date.now()
    const currentModelName = requestModel || MODEL_NAME
    const currentModel = requestModel ? genAI.getGenerativeModel({ model: currentModelName }) : model

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

    res.json({
      success: true,
      modelName: currentModelName,
      responseTime: elapsedTime,
      result: {
        problems: [{
          ...gradingData,
          gradingSource: 'ai-simple',
        }],
        overallComment: gradingData.feedback
      }
    })

  } catch (error) {
    console.error('Error in /api/grade-work-with-context:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
      details: String(error)
    })
  }
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
