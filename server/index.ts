import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'

dotenv.config()

// 文字列の正規化と一致判定を行う関数
function validateAndOverrideGrading(student: string, correct: string): boolean {
  if (!student || !correct) return false;

  const normalize = (str: string) => {
    return str
      .trim()
      // 全角英数字を半角に
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      // 不要な空白を削除
      .replace(/\s+/g, '')
      // 文末の句読点や「です」「ます」を削除（簡易的）
      .replace(/[、。\.．]$/, '')
      .replace(/(です|ます|だ)$/, '')
      // 単位の揺れを吸収（一旦削除して数値のみ比較する戦略もアリだが、ここでは簡易正規化）
      .toLowerCase();
  };

  const normStudent = normalize(student);
  const normCorrect = normalize(correct);

  // 完全一致
  if (normStudent === normCorrect) return true;

  // 数値としての比較（"40" と "40.0" など）
  const numStudent = parseFloat(normStudent);
  const numCorrect = parseFloat(normCorrect);
  if (!isNaN(numStudent) && !isNaN(numCorrect) && Math.abs(numStudent - numCorrect) < 0.0001) {
    return true;
  }

  // "40" と "40度" のような包含関係（正解が短い数字で、生徒が単位をつけている場合など）
  // ただし逆（正解"40度"、生徒"40"）は文脈によるため慎重に。
  // ここでは「正解」が「生徒の解答」に含まれている、またはその逆で、かつ数値が含まれている場合を救済
  if ((normStudent.includes(normCorrect) || normCorrect.includes(normStudent)) && !isNaN(numCorrect)) {
    // 数字が含まれていて、かつ包含関係にあるならOKとする（危険かもしれないが40と40度は救いたい）
    // いや、 "140" と "40" がマッチしてしまうのを防ぐ必要がある。
    // ここはシンプルに「単位を除去して一致するか」を見る
    const removeUnit = (s: string) => s.replace(/[^0-9\.]/g, '');
    if (removeUnit(normStudent) === removeUnit(normCorrect) && removeUnit(normStudent).length > 0) {
      return true;
    }
  }

  return false;
}

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
// Google GenAI クライアント初期化
// gemini-2.5-flash-lite を使用（速度重視）
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
console.log(`Using Gemini Model: ${MODEL_NAME}`)

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: MODEL_NAME })

// デフォルトモデルID
const DEFAULT_MODEL_ID = 'gemini-2.5-flash-lite'

// 利用可能なモデル一覧
const AVAILABLE_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '高速でバランスの良いモデル（推奨）' },
  { id: DEFAULT_MODEL_ID, name: 'Gemini 2.5 Flash Lite', description: '非常に高速でコスト効率の良いモデル' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '安定した高速モデル' },
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

// ==========================================
// Subject Management
// ==========================================

// Define available subjects with multi-language support
const SUBJECTS = [
  { id: 'math', labels: { ja: '算数・数学', en: 'Math' }, icon: '📐', description: 'Mathematics and Arithmetic' },
  { id: 'japanese', labels: { ja: '国語', en: 'Japanese' }, icon: '�🇵', description: 'Japanese Language' },
  { id: 'english', labels: { ja: '英語', en: 'English' }, icon: '�🇧', description: 'English Language' },
  { id: 'science', labels: { ja: '理科', en: 'Science' }, icon: '🔬', description: 'Science' },
  { id: 'social', labels: { ja: '社会', en: 'Social Studies' }, icon: '🌍', description: 'Social Studies' },
  { id: 'other', labels: { ja: 'その他', en: 'Other' }, icon: '📝', description: 'Other subjects' }
]

// GET /api/subjects - Return available subjects
app.get('/api/subjects', (req, res) => {
  res.json({
    subjects: SUBJECTS,
    default: 'math'
  })
})

// POST /api/detect-subject - Detect subject from cover page image
app.post('/api/detect-subject', async (req, res) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.status(400).json({ error: 'image (base64) is required' })
    }

    console.log('🔍 Detecting subject from cover page...')

    // Extract mime type and clean base64
    const imageMatch = image.match(/^data:(image\/(png|jpeg));base64,(.+)$/)
    const imageData = imageMatch ? imageMatch[3] : image.replace(/^data:image\/\w+;base64,/, '')
    const imageMime = imageMatch ? imageMatch[1] : 'image/jpeg'

    // Use Gemini to detect subject
    const detectionPrompt = `この画像はドリルや問題集の表紙です。
この教材がどの教科のものか判定してください。

選択肢:
- math (算数・数学)
- japanese (国語)
- english (英語)
- science (理科)
- social (社会)
- other (その他)

【重要】以下のJSON形式のみを出力してください：
{
  "subjectId": "判定した教科のID（上記の選択肢から1つ）",
  "confidence": 0.0〜1.0の数値（確信度）,
  "reasoning": "判定理由（簡潔に）"
}

JSONのみを出力してください。`

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: imageMime,
          data: imageData
        }
      },
      { text: detectionPrompt }
    ])

    const response = await result.response
    const responseText = response.text()

    if (!responseText) {
      throw new Error('Empty response from Gemini')
    }

    // Parse JSON response
    let jsonStr = responseText.replace(/```\w *\s * /g, '').replace(/```/g, '').trim()
    const jsonStart = jsonStr.indexOf('{')
    const jsonEnd = jsonStr.lastIndexOf('}')

    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)
    }

    let detectionData
    try {
      detectionData = JSON.parse(jsonStr)
    } catch (e) {
      console.error('JSON Parse Error:', e)
      console.log('Raw Response:', responseText)
      // Fallback to math if parsing fails
      return res.json({
        success: true,
        subjectId: 'math',
        confidence: 0.5,
        reasoning: 'Failed to parse AI response, defaulting to math'
      })
    }

    console.log(`✅ Subject detected: ${detectionData.subjectId} (confidence: ${detectionData.confidence})`)

    res.json({
      success: true,
      subjectId: detectionData.subjectId || 'math',
      confidence: detectionData.confidence || 0.5,
      reasoning: detectionData.reasoning
    })

  } catch (error) {
    console.error('Error in /api/detect-subject:', error)
    res.status(500).json({
      success: false,
      subjectId: 'math', // fallback
      confidence: 0,
      error: error instanceof Error ? error.message : 'Internal Server Error'
    })
  }
})

// 簡素化された採点API（切り抜き画像のみ）
app.post('/api/grade-work', async (req, res) => {
  try {
    const { croppedImageData, model: requestModel, language, subjectId } = req.body

    if (!croppedImageData) {
      return res.status(400).json({ error: 'croppedImageData is required' })
    }

    const startTime = Date.now()
    console.log(`Grading work (subject: ${subjectId || 'default'})...`)

    // Use requested model or default
    const currentModelName = requestModel || MODEL_NAME
    const currentModel = requestModel ? genAI.getGenerativeModel({ model: currentModelName }) : model

    // 言語設定の確認
    const isJapanese = !language || language.startsWith('ja');

    // 教科別のprompt補足説明
    const getSubjectSpecificGuidance = (subject: string | undefined) => {
      if (!subject) return '';

      const guidance: Record<string, { ja: string; en: string }> = {
        japanese: {
          ja: `\n\n【国語の採点について】
・記述問題では、生徒の表現が模範解答と異なっていても、意味が正しく伝わっていれば正解としてください。
・漢字の書き取りでは、とめ・はね・はらいを厳密にチェックしてください。
・文章の読解では、本文の内容と照らし合わせて判定してください。`,
          en: `\n\n【Japanese Language Grading】
・For written answers, accept answers that convey the correct meaning even if the expression differs from the model answer.
・For kanji writing, check the strokes strictly.
・For reading comprehension, verify against the text.`
        },
        math: {
          ja: `\n\n【算数・数学の採点について】
・計算過程が正しければ、最終的な答えが少し違っても部分点を考慮してください。
・単位の記入漏れは減点対象ですが、計算自体が正しければ大きく減点しないでください。
・図形問題では、補助線や考え方のプロセスも評価してください。`,
          en: `\n\n【Math Grading】
・If the calculation process is correct, consider partial credit even if the final answer is slightly different.
・Missing units should be noted but not heavily penalized if the calculation is correct.
・For geometry, evaluate the use of auxiliary lines and thought process.`
        },
        science: {
          ja: `\n\n【理科の採点について】
・専門用語の表記揺れ（ひらがな・カタカナ）は許容してください。
・実験の観察結果は、要点が合っていれば表現が違っても正解としてください。
・理由を問う問題では、科学的な根拠が含まれているか確認してください。`,
          en: `\n\n【Science Grading】
・Allow variations in technical term notation (hiragana/katakana).
・For experimental observations, accept if the key points are correct.
・For reasoning questions, verify scientific basis is included.`
        },
        social: {
          ja: `\n\n【社会の採点について】
・歴史的事項や地名の表記揺れは許容してください（例：「えどばくふ」「江戸幕府」）。
・記述問題では、重要なキーワードが含まれていれば、文章構成が違っても正解としてください。
・年号の前後数年のズレは大きく減点しないでください。`,
          en: `\n\n【Social Studies Grading】
・Allow variations in historical terms and place names.
・For written answers, accept if key terms are included.
・Minor errors in dates (within a few years) should not be heavily penalized.`
        },
        english: {
          ja: `\n\n【英語の採点について】
・スペルミスは減点対象ですが、意味が通じれば大きく減点しないでください。
・文法問題では、文法の理解を重視してください。
・英作文では、文法・語彙・内容の3つの観点で評価してください。`,
          en: `\n\n【English Grading】
・Spelling errors should be noted but not heavily penalized if meaning is clear.
・For grammar questions, focus on grammatical understanding.
・For composition, evaluate grammar, vocabulary, and content.`
        }
      };

      const subjectGuidance = guidance[subject];
      if (!subjectGuidance) return '';

      return isJapanese ? subjectGuidance.ja : subjectGuidance.en;
    };

    let simplePrompt = '';

    if (isJapanese) {
      simplePrompt = `あなたは小中学生の家庭教師です。以下の画像には生徒の解答が写っています。
${getSubjectSpecificGuidance(subjectId)}

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
  "explanation": "解説",
  "explanationSvg": "解説を補足するSVGコード（必要な場合のみ。不要ならnull）"
}


【SVG生成ルール】（必要な場合のみ）
・解説に図解（図形、グラフ、数直線など）があると分かりやすい場合は、シンプルなSVGコードを生成してください。
・複数の図が必要な場合は、1つのSVG内にレイアウト（左右や上下に配置）してまとめてください。
・解説テキスト内では「図の左側」「図の右側」のように参照してください。
・SVGタグのみを含めてください（\`\`\`xmlなどは不要）。
・レスポンシブに表示できるよう、width/height属性は指定せず、viewBoxを適切に設定してください。
・色は #333 (黒), #e74c3c (赤/強調), #3498db (青/補助) などを使い分けてください。

JSONのみを出力してください。「はい」「承知しました」などの前置きは不要です。`;
    } else {
      // 英語プロンプト
      simplePrompt = `You are a helpful tutor for students. The image shows a student's answer.
${getSubjectSpecificGuidance(subjectId)}

Please analyze this image:
1. Identify the problem number (e.g., 1(1), 2(3)).
2. Recognize the student's handwritten answer.
3. Determine if the answer is correct provided the context.
4. Provide the correct answer and feedback.

【IMPORTANT】Output ONLY the following JSON format. Do NOT include any introductory text or markdowns:
{
  "problemNumber": "Problem Number (e.g., '1(1)', '2(3)')",
  "studentAnswer": "Student's Answer",
  "isCorrect": true or false,
  "correctAnswer": "Correct Answer",
  "feedback": "Encouraging feedback",
  "explanation": "Explanation",
  "explanationSvg": "SVG code if helpful (optional, null if not needed)"
}

【SVG Rules】(Optional)
- Generate simple SVG code if diagrams (shapes, graphs, etc.) help explain.
- No \`\`\`xml tags. Just the SVG tag.
- Do not specify width/height, use viewBox.
- Use colors like #333 (black), #e74c3c (red/emphasis), #3498db (blue/secondary).

Output ONLY JSON. No introductory text.`;
    }

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
    // 開始タグ (```json など) と終了タグ(```) の両方を削除
    let jsonStr = responseText.replace(/```\w *\s * /g, '').replace(/```/g, '').trim()

    // JSON部分を抽出（オブジェクト {} または 配列 [] を検出）
    const firstBrace = jsonStr.indexOf('{')
    const firstBracket = jsonStr.indexOf('[')

    let jsonStart: number
    let jsonEnd: number

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      // 配列が先に見つかった場合
      jsonStart = firstBracket
      jsonEnd = jsonStr.lastIndexOf(']')
    } else if (firstBrace !== -1) {
      // オブジェクトが先に見つかった場合
      jsonStart = firstBrace
      jsonEnd = jsonStr.lastIndexOf('}')
    } else {
      jsonStart = -1
      jsonEnd = -1
    }

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

    // AIの判定結果をサーバーサイドで検証・オーバーライド
    problems = problems.map(problem => {
      const { studentAnswer, correctAnswer, isCorrect } = problem

      // もしAIが不正解と判定していても、文字列として一致していれば正解に強制変更
      if (!isCorrect && studentAnswer && correctAnswer) {
        if (validateAndOverrideGrading(studentAnswer, correctAnswer)) {
          console.log(`[Override] AI judged incorrect, but server validation matched. Force CORRECT. Answer: "${studentAnswer}"`)
          return { ...problem, isCorrect: true, gradingSource: 'server-override' }
        }
      }
      return problem
    })

    const responseData = {
      success: true,
      modelName: currentModelName,
      responseTime: elapsedTime,
      result: {
        problems,
        overallComment: gradingData.feedback || (problems[0] && problems[0].feedback)
      }
    }

    console.log(`Grading complete.Problem: ${gradingData.problemNumber}, Correct: ${gradingData.isCorrect}`)
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
