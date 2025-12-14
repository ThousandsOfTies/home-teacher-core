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

// Initialize Google GenAI Client
// Use gemini-2.0-flash-exp as default, or fallback to 1.5-flash if needed
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
console.log(`Using Gemini Model: ${MODEL_NAME}`)

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: MODEL_NAME })

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL_NAME })
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

app.post('/api/grade-work-with-context', async (req, res) => {
  try {
    const { fullPageImageData, croppedImageData, pageNumber, model: requestModel } = req.body

    if (!fullPageImageData || !croppedImageData) {
      return res.status(400).json({ error: 'Both fullPageImageData and croppedImageData are required' })
    }

    const startTime = Date.now()
    console.log(`Grading work for page ${pageNumber}...`)

    // Use requested model or default
    const currentModelName = requestModel || MODEL_NAME
    const currentModel = genAI.getGenerativeModel({ model: currentModelName })

    // Determine response language
    const language = 'ja' // Default to Japanese as per original implementation
    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = langCode === 'ja' ? 'Japanese' : 'English'

    // Restore the detailed prompt from the working version
    const contextPrompt = `
Your task:
1. Look at IMAGE 1 (full page) to:
   a. Find the PRINTED PAGE NUMBER(s) visible on the page (e.g., "p.4", "5ページ", "4", "5" in corners/margins)
   b. Understand the PROBLEM STRUCTURE of the page:
      - Identify ALL major problem numbers (大問: 1, 2, 3...)
      - Identify how sub-problems are organized (小問: (1), (2), (3)...)
      - Note the position of the cropped area within this structure
   c. Identify which printed page the cropped problem belongs to

2. Look at IMAGE 2 (cropped) to:
   a. Identify the COMPLETE problem number by combining:
      - The major problem number (大問) from IMAGE 1's structure
      - The sub-problem number (小問) visible in IMAGE 2
      - Example: If IMAGE 1 shows this is under 問1 and IMAGE 2 shows (3), return "1(3)"
   b. Read the student's handwritten answer (include ALL values if multiple, e.g., "x=107°, y=47°")
   c. Grade the answer (Correct/Incorrect) against standard math/subject rules

IMPORTANT RULES:
- ALWAYS include the major problem number (大問番号) in problemNumber
- If you see "(3)" in the cropped image, look at IMAGE 1 to find which major problem it belongs to
- Example: "(3)" under 大問1 should be returned as "1(3)", not just "3" or "(3)"
- Grade ONLY the answer visible in IMAGE 2 (the cropped image)
- DO NOT mention or grade other problems from IMAGE 1
- For multi-value answers (x and y), include ALL values in studentAnswer

Return valid JSON:
{
  "problemNumber": "COMPLETE problem number with major+sub (e.g., '1(3)', '2(1)', NOT just '3' or '(3)')",
  "confidence": "high/medium/low",
  "positionReasoning": "explain: which major problem (大問) this belongs to based on IMAGE 1 layout, and the sub-problem number",
  "problemText": "problem text from IMAGE 2 (cropped)",
  "studentAnswer": "student's answer from IMAGE 2 - include ALL values (e.g., 'x=107°, y=47°')",
  "isCorrect": true or false (based on the answer in IMAGE 2),
  "correctAnswer": "correct answer if determinable",
  "feedback": "encouraging feedback about the answer in IMAGE 2",
  "explanation": "detailed explanation about the answer in IMAGE 2",
  "overallComment": "overall comment",
  "printedPageNumber": number | null // The page number printed on the workbook page
}

LANGUAGE: ${responseLang}`

    // Extract mime types and clean base64
    const pageMatch = fullPageImageData.match(/^data:(image\/(png|jpeg));base64,(.+)$/)
    const cropMatch = croppedImageData.match(/^data:(image\/(png|jpeg));base64,(.+)$/)

    if (!pageMatch || !cropMatch) {
      // Fallback for clean base64 strings passed without header
      // This handles the case where clean base64 is sent or header format varies
    }

    // Robust data preparation
    const fullPageData = pageMatch ? pageMatch[3] : fullPageImageData.replace(/^data:image\/\w+;base64,/, '')
    const fullPageMime = pageMatch ? pageMatch[1] : 'image/jpeg'

    const cropData = cropMatch ? cropMatch[3] : croppedImageData.replace(/^data:image\/\w+;base64,/, '')
    const cropMime = cropMatch ? cropMatch[1] : 'image/jpeg'

    const result = await currentModel.generateContent([
      // Image Order is Important as per prompt instructions
      {
        inlineData: {
          mimeType: fullPageMime,
          data: fullPageData
        }
      },
      {
        inlineData: {
          mimeType: cropMime,
          data: cropData
        }
      },
      { text: contextPrompt }
    ])

    const response = await result.response
    const responseText = response.text()

    if (!responseText) {
      throw new Error('Empty response from Gemini')
    }

    const jsonStr = responseText.replace(/```json\n?|\n?```/g, '') // Basic markdown cleanup
    let gradingData
    try {
      gradingData = JSON.parse(jsonStr)
    } catch (e) {
      console.error("JSON Parse Error:", e)
      console.log("Raw Response:", responseText)
      throw new Error("Failed to parse AI response")
    }

    // Measure time
    const elapsedTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(2))

    // Construct response matching the structure expected by client logic (similar to old_index.ts)
    // The previous logic wrapped the single result in an array 'problems'
    const problemWithMetadata = {
      ...gradingData,
      gradingSource: 'ai-context', // Flag to indicate AI graded this
    }

    const responseData = {
      success: true,
      modelName: currentModelName,
      responseTime: elapsedTime,
      result: {
        problems: [problemWithMetadata],
        printedPageNumber: gradingData.printedPageNumber,
        overallComment: gradingData.overallComment || gradingData.positionReasoning
      }
    }

    console.log(`Grading complete. Problem: ${gradingData.problemNumber}, Correct: ${gradingData.isCorrect}`)
    res.json(responseData)

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
