import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'
import fs from 'fs'

dotenv.config()

const app = express()
const port = process.env.PORT || 3003

// 蛻ｩ逕ｨ蜿ｯ閭ｽ縺ｪGemini繝｢繝・Ν縺ｮ繝槭ャ繝斐Φ繧ｰ
const AVAILABLE_MODELS: Record<string, { id: string; name: string; description: string }> = {
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: '譛譁ｰ縺ｮ鬮倬溷ｮ牙ｮ夂沿繝｢繝・Ν・・025蟷ｴ6譛医Μ繝ｪ繝ｼ繧ｹ・・
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: '譛譁ｰ縺ｮ鬮俶ｧ閭ｽ螳牙ｮ夂沿繝｢繝・Ν・・025蟷ｴ6譛医Μ繝ｪ繝ｼ繧ｹ・・
  },
  'gemini-2.0-flash-exp': {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash (Experimental)',
    description: '螳滄ｨ鍋沿縺ｮ鬮倬溘Δ繝・Ν'
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: '螳牙ｮ夂沿縺ｮ鬮倬溘Δ繝・Ν'
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: '鬮俶ｧ閭ｽ縺ｪ螳牙ｮ夂沿繝｢繝・Ν'
  },
  'gemini-1.5-flash': {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: '鬮倬溘↑螳牙ｮ夂沿繝｢繝・Ν'
  }
}

// CORS險ｭ螳夲ｼ医そ繧ｭ繝･繝ｪ繝・ぅ蠑ｷ蛹也沿・・
const allowedOrigins = [
  // 譛ｬ逡ｪ迺ｰ蠅・ｼ・itHub Pages・・
  'https://thousandsofties.github.io',

  // 繧ｹ繝・・繧ｸ繝ｳ繧ｰ迺ｰ蠅・ｼ・itHub Pages・・
  // Note: 蜷後§繝峨Γ繧､繝ｳ縺ｪ縺ｮ縺ｧ譛ｬ逡ｪURL縺ｧ荳｡譁ｹ繧ｫ繝舌・縺輔ｌ繧・

  // 髢狗匱迺ｰ蠅・ｼ・ocalhost蜈ｨ闊ｬ繧定ｨｱ蜿ｯ・・
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
]

app.use(cors({
  origin: (origin, callback) => {
    // origin縺蛍ndefined = 蜷御ｸ繧ｪ繝ｪ繧ｸ繝ｳ繝ｪ繧ｯ繧ｨ繧ｹ繝茨ｼ郁ｨｱ蜿ｯ・・
    if (!origin) return callback(null, true)

    // 險ｱ蜿ｯ繝ｪ繧ｹ繝医メ繧ｧ繝・け・域枚蟄怜・縺ｾ縺溘・Regex・・
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
      console.warn(`圻 CORS blocked: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}))

app.use(express.json({ limit: '50mb' }))

// Gemini API繧ｯ繝ｩ繧､繧｢繝ｳ繝・(譁ｰSDK)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// 繧ｷ繝ｳ繝励Ν縺ｪ繝ｬ繝ｼ繝亥宛髯撰ｼ医Γ繝｢繝ｪ繝吶・繧ｹ・・
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15蛻・
const RATE_LIMIT_MAX = process.env.NODE_ENV === 'production' ? 20 : 100 // 髢狗匱迺ｰ蠅・〒縺ｯ100繝ｪ繧ｯ繧ｨ繧ｹ繝医∪縺ｧ


const checkRateLimit = (identifier: string): boolean => {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)

  if (!record || now > record.resetTime) {
    // 譁ｰ隕上∪縺溘・譛滄剞蛻・ｌ
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (record.count >= RATE_LIMIT_MAX) {
    // 蛻ｶ髯占ｶ・℃
    return false
  }

  // 繧ｫ繧ｦ繝ｳ繝亥｢怜刈
  record.count++
  return true
}
app.get('/api/models', (req, res) => {
  res.json({
    models: Object.values(AVAILABLE_MODELS),
    default: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
  })
})

// 繝倥Ν繧ｹ繝√ぉ繝・け
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiApiKey: process.env.GEMINI_API_KEY ? '險ｭ螳壽ｸ医∩' : '譛ｪ險ｭ螳・
  })
})

app.post('/api/analyze-page', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: '繝ｪ繧ｯ繧ｨ繧ｹ繝医′螟壹☆縺弱∪縺・,
      details: '15蛻・ｾ後↓蜀榊ｺｦ縺願ｩｦ縺励￥縺縺輔＞'
    })
  }

  try {
    const { imageData, pageNumber, language } = req.body

    if (!imageData) {
      return res.status(400).json({ error: '逕ｻ蜒上ョ繝ｼ繧ｿ縺悟ｿ・ｦ√〒縺・ })
    }

    console.log(`剥 豎守畑繝壹・繧ｸ蛻・梵髢句ｧ・ 繝壹・繧ｸ ${pageNumber}`)

    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!base64Match) {
      return res.status(400).json({ error: '辟｡蜉ｹ縺ｪ逕ｻ蜒上ョ繝ｼ繧ｿ蠖｢蠑上〒縺・ })
    }

    const mimeType = `image/${base64Match[1]}`
    const base64Data = base64Match[2]

    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = langCode === 'ja' ? 'Japanese' : 'English'

    const universalPrompt = `縺ゅ↑縺溘・蝠城｡碁寔繝ｻ繝峨Μ繝ｫ縺ｮ隗｣遲斐・繝ｼ繧ｸ繧定ｧ｣譫舌☆繧帰I縺ｧ縺吶・

縲舌ち繧ｹ繧ｯ縲・
縺薙・逕ｻ蜒上°繧峨√☆縺ｹ縺ｦ縺ｮ蝠城｡檎分蜿ｷ縺ｨ豁｣隗｣繧呈ｼ上ｌ縺ｪ縺乗歓蜃ｺ縺励※縺上□縺輔＞縲・

縲宣㍾隕√↑繝ｫ繝ｼ繝ｫ縲・
1. 蝠城｡檎分蜿ｷ縺ｯ蠢・★縲悟､ｧ蝠冗分蜿ｷ(蟆丞撫逡ｪ蜿ｷ)縲阪・蠖｢蠑上〒蜃ｺ蜉帙☆繧九％縺ｨ
   萓・ 1(1), 1(2), 2(1), 2(2) 縺ｪ縺ｩ
   
2. 讓ｪ縺ｫ荳ｦ繧薙〒縺・ｋ隗｣遲斐ｂ蜈ｨ縺ｦ謚ｽ蜃ｺ縺吶ｋ縺薙→
   萓・ 縲・ (1) 105蠎ｦ (2) 10蠎ｦ (3) 47蠎ｦ (4) 100蠎ｦ縲・
   竊・1(1)=105蠎ｦ, 1(2)=10蠎ｦ, 1(3)=47蠎ｦ, 1(4)=100蠎ｦ
   
3. 繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ繝倥ャ繝繝ｼ縺ｫ縲悟撫鬘後・笳九・繝ｼ繧ｸ縲阪→譖ｸ縺・※縺ゅｌ縺ｰ縲√◎繧後ｒproblemPage縺ｨ縺励※險倬鹸

4. 縲瑚ｧ｣隱ｬ縲阪・譁・ｫ縺ｯ辟｡隕悶＠縺ｦ縲∫ｭ斐∴縺ｮ蛟､縺ｮ縺ｿ繧呈歓蜃ｺ

縲仙・蜉帛ｽ｢蠑上・
蠢・★莉･荳九・JSON蠖｢蠑上〒蜃ｺ蜉帙＠縺ｦ縺上□縺輔＞・井ｻ悶・繝・く繧ｹ繝医・荳崎ｦ・ｼ・

{
  "pageType": "answer",
  "pageNumber": 78,
  "answers": [
    {"problemNumber": "1(1)", "correctAnswer": "105蠎ｦ", "problemPage": 6, "sectionName": "蟷ｳ髱｢蝗ｳ蠖｢竇 繝ｬ繝吶ΝA・亥撫鬘後・6繝壹・繧ｸ・・},
    {"problemNumber": "1(2)", "correctAnswer": "10蠎ｦ", "problemPage": 6, "sectionName": "蟷ｳ髱｢蝗ｳ蠖｢竇 繝ｬ繝吶ΝA・亥撫鬘後・6繝壹・繧ｸ・・},
    {"problemNumber": "1(3)", "correctAnswer": "47蠎ｦ", "problemPage": 6, "sectionName": "蟷ｳ髱｢蝗ｳ蠖｢竇 繝ｬ繝吶ΝA・亥撫鬘後・6繝壹・繧ｸ・・},
    {"problemNumber": "1(4)", "correctAnswer": "100蠎ｦ", "problemPage": 6, "sectionName": "蟷ｳ髱｢蝗ｳ蠖｢竇 繝ｬ繝吶ΝA・亥撫鬘後・6繝壹・繧ｸ・・}
  ]
}

繧ゅ＠縺薙ｌ縺悟撫鬘後・繝ｼ繧ｸ・郁ｧ｣遲斐・繝ｼ繧ｸ縺ｧ縺ｯ縺ｪ縺・ｼ峨・蝣ｴ蜷医・:
{
  "pageType": "problem",
  "pageNumber": 6,
  "problems": [{"problemNumber": "1(1)", "type": "險育ｮ・, "hasDiagram": false}]
}

縲先怙驥崎ｦ√・
- 縺吶∋縺ｦ縺ｮ蟆丞撫繧呈ｼ上ｌ縺ｪ縺乗歓蜃ｺ縺吶ｋ縺薙→
- 縲・2)縲阪□縺代〒縺ｪ縺上・(2)縲阪・繧医≧縺ｫ螟ｧ蝠冗分蜿ｷ繧貞ｿ・★莉倥￠繧九％縺ｨ
- 隗｣隱ｬ譁・・辟｡隕悶＠縲∫ｭ斐∴縺ｮ謨ｰ蛟､繝ｻ險伜捷縺ｮ縺ｿ繧呈歓蜃ｺ縺吶ｋ縺薙→`

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
      throw new Error('API縺九ｉ繝ｬ繧ｹ繝昴Φ繧ｹ繧貞叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆')
    }

    let analyzedData
    try {
      const jsonStart = responseText.indexOf('{')
      const jsonEnd = responseText.lastIndexOf('}') + 1
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonString = responseText.substring(jsonStart, jsonEnd)
        analyzedData = JSON.parse(jsonString)
      } else {
        throw new Error('JSON讒矩縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ')
      }
    } catch (parseError) {
      console.error('笶・JSON繝代・繧ｹ螟ｱ謨・', parseError)
      console.error('繝ｬ繧ｹ繝昴Φ繧ｹ:', responseText.substring(0, 500))
      return res.status(500).json({
        error: '繝壹・繧ｸ蛻・梵縺ｫ螟ｱ謨励＠縺ｾ縺励◆',
        details: 'AI繝ｬ繧ｹ繝昴Φ繧ｹ縺ｮ隗｣譫舌お繝ｩ繝ｼ',
        rawResponse: responseText.substring(0, 500)
      })
    }

    const pageType = analyzedData.pageType || 'unknown'
    const itemCount = analyzedData.problems?.length || analyzedData.answers?.length || 0

    console.log(`笨・繝壹・繧ｸ蛻・梵螳御ｺ・ ${elapsedTime}遘蛋)
    console.log(`塘 繝壹・繧ｸ繧ｿ繧､繝・ ${pageType}, 繧｢繧､繝・Β謨ｰ: ${itemCount}`)

    // 繝・ヰ繝・げ: 隗｣遲斐・繝ｼ繧ｸ縺ｮ蝣ｴ蜷医∝推隗｣遲斐・problemPage繧定｡ｨ遉ｺ
    if (pageType === 'answer' && analyzedData.answers) {
      console.log(`搭 隗｣遲碑ｩｳ邏ｰ:`)
      analyzedData.answers.forEach((ans: any, i: number) => {
        console.log(`   ${i + 1}. ${ans.problemNumber} = "${ans.correctAnswer}" (蝠城｡後・繝ｼ繧ｸ: ${ans.problemPage ?? '譛ｪ險ｭ螳・})`)
      })
    }

    res.json({
      success: true,
      pageType: pageType,
      pageNumber: pageNumber,
      data: analyzedData,
      responseTime: elapsedTime
    })

  } catch (error) {
    console.error('笶・繝壹・繧ｸ蛻・梵繧ｨ繝ｩ繝ｼ:', error)
    res.status(500).json({
      error: '繝壹・繧ｸ蛻・梵荳ｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

app.post('/api/grade-with-context', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: '繝ｪ繧ｯ繧ｨ繧ｹ繝医′螟壹☆縺弱∪縺・,
      details: '15蛻・ｾ後↓蜀榊ｺｦ縺願ｩｦ縺励￥縺縺輔＞'
    })
  }

  try {
    const { pageFullImage, croppedImage, pageNumber, language, model } = req.body

    if (!pageFullImage || !croppedImage) {
      return res.status(400).json({ error: '繝壹・繧ｸ蜈ｨ菴鍋判蜒上→蛻・ｊ蜃ｺ縺礼判蜒上・荳｡譁ｹ縺悟ｿ・ｦ√〒縺・ })
    }

    console.log(`当 譁・ц繝吶・繧ｹ謗｡轤ｹ髢句ｧ・ 繝壹・繧ｸ ${pageNumber}`)

    const langCode = language ? language.split('-')[0] : 'ja'
    const responseLang = langCode === 'ja' ? 'Japanese' : 'English'

    // 荳｡譁ｹ縺ｮ逕ｻ蜒上ｒ蜃ｦ逅・
    const pageMatch = pageFullImage.match(/^data:image\/(\w+);base64,(.+)$/)
    const cropMatch = croppedImage.match(/^data:image\/(\w+);base64,(.+)$/)

    // 繝・ヰ繝・げ: 逕ｻ蜒上し繧､繧ｺ繧堤｢ｺ隱・
    console.log(`名・・ 逕ｻ蜒上し繧､繧ｺ遒ｺ隱・`)
    console.log(`   繝輔Ν繝壹・繧ｸ: ${pageFullImage.length} bytes`)
    console.log(`   蛻・ｊ蜿悶ｊ: ${croppedImage.length} bytes`)

    if (!pageMatch || !cropMatch) {
      return res.status(400).json({ error: '辟｡蜉ｹ縺ｪ逕ｻ蜒上ョ繝ｼ繧ｿ蠖｢蠑上〒縺・ })
    }

    const contextPrompt = `You are analyzing student work with context awareness.

IMAGE ORDER (VERY IMPORTANT):
- IMAGE 1 (FIRST): Full page showing ALL problems (REFERENCE ONLY - DO NOT GRADE THIS)
- IMAGE 2 (SECOND): Cropped area showing ONE problem (THIS IS WHAT YOU MUST GRADE)

Your task:
1. Look at IMAGE 1 (full page) to:
   a. Find the PRINTED PAGE NUMBER(s) visible on the page (e.g., "p.4", "5繝壹・繧ｸ", "4", "5" in corners/margins)
   b. Identify which printed page the cropped problem belongs to
   c. Identify the exact problem number

2. Many workbooks show 2 printed pages per PDF page (a spread/隕矩幕縺・. Look for page numbers in:
   - Top corners (left page number on left, right page number on right)
   - Bottom corners
   - Headers or footers
   - Examples: "4", "5", "p.4", "4繝壹・繧ｸ"

3. Determine the EXACT problem number by considering:
   - Position on the page (top/middle/bottom, left/right)
   - Which printed page (left or right) the problem appears on
   - Sub-problem numbers like (1), (2), (3) if visible

4. Look at IMAGE 2 (cropped) to see what the student actually answered
5. Extract the student's answer from IMAGE 2 (cropped) ONLY
6. Grade ONLY what is visible in IMAGE 2 (cropped)

CRITICAL RULES (READ CAREFULLY):
- IMAGE 1 is for identifying the problem number AND printed page number - DO NOT grade it
- IMAGE 2 is the ONLY thing you should grade
- The student wrote their answer in IMAGE 2, not IMAGE 1
- DO NOT grade blank/empty problems visible in IMAGE 1
- ONLY grade the answer visible in IMAGE 2
- Ignore all other problems visible in IMAGE 1

EXAMPLE:
- IMAGE 1 shows: A spread with page 4 (left) and page 5 (right), Problems 1(1), 1(2) on page 4
- IMAGE 2 shows: Problem 1(1) with answer "59ﾂｰ" (from the left side = page 4)
- printedPageNumber should be: 4 (not the PDF page, but the printed page number visible in IMAGE 1)

Return ONLY valid JSON:
{
  "printedPageNumber": <number or null - the page number printed on the workbook page where the problem is located>,
  "problemNumber": "exact problem number (e.g., '1(1)', '1(2)', '2')",
  "confidence": "high/medium/low",
  "positionReasoning": "brief explanation: which side of the spread (left/right), what printed page number you found",
  "problemText": "problem text from IMAGE 2 (cropped)",
  "studentAnswer": "student's answer from IMAGE 2 (cropped) ONLY",
  "isCorrect": true or false (based on the answer in IMAGE 2),
  "correctAnswer": "correct answer (if you can determine it from IMAGE 2)",
  "feedback": "encouraging feedback about the answer in IMAGE 2",
  "explanation": "detailed explanation about the answer in IMAGE 2"
}

IMPORTANT for printedPageNumber:
- This is the PAGE NUMBER PRINTED ON THE WORKBOOK, not the PDF page number
- Look for numbers like "4", "5", "p.4", "4繝壹・繧ｸ" in corners/margins of IMAGE 1
- If the problem is on the LEFT side of a spread, use the left page's number
- If the problem is on the RIGHT side, use the right page's number
- Return as a number (e.g., 4), not a string
- If no page number is visible, return null

FINAL REMINDER:
- Grade ONLY the answer visible in IMAGE 2 (the cropped image)
- DO NOT mention or grade other problems from IMAGE 1
- The correct answer should match what's asked in IMAGE 2, not other problems

LANGUAGE: ${responseLang}`

    const startTime = Date.now()

    const preferredModelName = model || process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'

    const result = await ai.models.generateContent({
      model: preferredModelName,
      contents: [
        {
          role: 'user',
          parts: [
            // 逕ｻ蜒・: 繝壹・繧ｸ蜈ｨ菴・
            {
              inlineData: {
                mimeType: pageMatch[1] === 'png' ? 'image/png' : 'image/jpeg',
                data: pageMatch[2]
              }
            },
            // 逕ｻ蜒・: 蛻・ｊ蜃ｺ縺鈴Κ蛻・
            {
              inlineData: {
                mimeType: cropMatch[1] === 'png' ? 'image/png' : 'image/jpeg',
                data: cropMatch[2]
              }
            },
            // 繝励Ο繝ｳ繝励ヨ
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
      throw new Error('API縺九ｉ繝ｬ繧ｹ繝昴Φ繧ｹ繧貞叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆')
    }

    // JSON繧呈歓蜃ｺ
    let gradingData
    try {
      const jsonStart = responseText.indexOf('{')
      const jsonEnd = responseText.lastIndexOf('}') + 1
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonString = responseText.substring(jsonStart, jsonEnd)
        gradingData = JSON.parse(jsonString)
      } else {
        throw new Error('JSON讒矩縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ')
      }
    } catch (parseError) {
      console.error('笶・JSON繝代・繧ｹ螟ｱ謨・', parseError)
      console.error('繝ｬ繧ｹ繝昴Φ繧ｹ:', responseText.substring(0, 500))
      return res.status(500).json({
        error: '謗｡轤ｹ邨先棡縺ｮ隗｣譫舌↓螟ｱ謨励＠縺ｾ縺励◆',
        details: 'AI繝ｬ繧ｹ繝昴Φ繧ｹ縺ｮ隗｣譫舌お繝ｩ繝ｼ',
        rawResponse: responseText.substring(0, 500)
      })
    }

    console.log(`笨・譁・ц繝吶・繧ｹ隗｣譫仙ｮ御ｺ・ ${elapsedTime}遘蛋)
    console.log(`   蜊ｰ蛻ｷ繝壹・繧ｸ逡ｪ蜿ｷ: ${gradingData.printedPageNumber ?? '(讀懷・縺ｧ縺阪★)'}`)
    console.log(`   蝠城｡檎分蜿ｷ: ${gradingData.problemNumber} (菫｡鬆ｼ蠎ｦ: ${gradingData.confidence})`)
    console.log(`   逕溷ｾ偵・隗｣遲・ "${gradingData.studentAnswer}"`)
    console.log(`   菴咲ｽｮ謗ｨ螳・ ${gradingData.positionReasoning}`)

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
        overallComment: `蝠城｡檎分蜿ｷ縺ｮ迚ｹ螳・ ${gradingData.positionReasoning}`,
        printedPageNumber: gradingData.printedPageNumber  // 蜊ｰ蛻ｷ繝壹・繧ｸ逡ｪ蜿ｷ繧偵Ξ繧ｹ繝昴Φ繧ｹ縺ｫ蜷ｫ繧√ｋ
      },
      modelName: preferredModelName,
      responseTime: elapsedTime
    })

  } catch (error) {
    console.error('笶・譁・ц繝吶・繧ｹ謗｡轤ｹ繧ｨ繝ｩ繝ｼ:', error)
    res.status(500).json({
      error: '謗｡轤ｹ荳ｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})



app.listen(port, () => {
  console.log(`\n噫 API繧ｵ繝ｼ繝舌・縺瑚ｵｷ蜍輔＠縺ｾ縺励◆!`)
  console.log(`   http://localhost:${port}`)
  console.log(`\n､・Gemini API Key: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-api-key-here' ? '險ｭ螳壽ｸ医∩ 笨・ : '譛ｪ險ｭ螳・笶・}`)
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-api-key-here') {
    console.log('\n笞・・ .env繝輔ぃ繧､繝ｫ縺ｫGEMINI_API_KEY繧定ｨｭ螳壹＠縺ｦ縺上□縺輔＞')
    console.log('   https://makersuite.google.com/app/apikey\n')
  }
})
