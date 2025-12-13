import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'

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

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL_NAME })
})

app.post('/api/analyze-page', async (req, res) => {
  try {
    const { imageData, pageNumber, language = 'ja' } = req.body

    if (!imageData) {
      return res.status(400).json({ error: 'imageData is required' })
    }

    // Base64 header removal if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')

    console.log(`Processing page ${pageNumber}...`)

    const prompt = `
Analyze this image of a workbook page answer key.
Extract all answer sets.

The user is a Japanese student.
The image likely contains problem numbers (like "1", "(1)", "問1") and their corresponding answers.
It may also contain section headers (like "p.4", "第1回", "練成問題").

Return ONLY a valid JSON object with the following structure:
{
  "pageType": "answer", // or "problem" or "other"
  "printedPageNumber": number | null, // The page number printed on the paper itself (e.g. at the bottom corners), NOT the PDF page number.
  "answers": [
    {
      "problemNumber": "string", // e.g. "1", "(1)", "問1"
      "correctAnswer": "string", // e.g. "ア", "5cm", "took"
      "problemPage": number | null, // If the answer key explicitly mentions which problem page it belongs to (e.g. "p.4の解答"), extract it.
      "sectionName": "string | null" // The section header this answer belongs to (e.g. "練成問題A", "p.4")
    }
  ]
}

Rules:
1. Extract ALL answers visible on the page.
2. Be precise with problem numbers.
3. If there are multiple columns, process them in logical reading order (usually top-down, left-right).
4. If you see a page number printed on the corner of the paper, set it to "printedPageNumber".
5. Use "sectionName" to capture hierarchial context (big headers).
`

    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    })

    const responseText = response.data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!responseText) {
      throw new Error('Empty response from Gemini')
    }

    // Clean up potential markdown code blocks
    const jsonStr = responseText.replace(/```json\n?|\n?```/g, '')
    const result = JSON.parse(jsonStr)

    // Add metadata
    result.pdfPage = pageNumber

    console.log(`Page ${pageNumber} analyzed successfully. Found ${result.answers?.length || 0} answers.`)
    res.json({ success: true, data: result, pageType: result.pageType, result: result }) // compatibility

  } catch (error) {
    console.error('Error in /api/analyze-page:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
      details: String(error)
    })
  }
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
