/**
 * 採点マッチングロジック
 * 
 * AIが検出した問題番号と印刷ページ番号を使用して、
 * IndexedDBに登録された正解を検索・マッチングする
 */

import { AnswerRecord } from '../../../utils/indexedDB'
import { normalizeAnswer, normalizeProblemNumber } from '../utils/normalizers'
import { Problem } from '../../../services/api'

export interface MatchResult {
    matchedAnswer: AnswerRecord | null
    isCorrect: boolean
    correctAnswer: string
    feedback: string
    explanation: string
    gradingSource: 'db' | 'ai'
    dbMatchedAnswer?: {
        problemNumber: string
        correctAnswer: string
        problemPageNumber?: number
        pageNumber: number
    }
}

/**
 * AIが検出した問題と登録済み解答をマッチングして採点結果を返す
 */
export function matchAndGrade(
    problem: Problem,
    registeredAnswers: AnswerRecord[],
    pageNum: number
): MatchResult {
    const normalizedAiProblem = normalizeProblemNumber(problem.problemNumber)
    const printedPage = problem.printedPageNumber ?? null

    let matchedAnswer: AnswerRecord | null = null

    // デバッグログ
    console.log(`🎯 AI検出: 問題番号="${problem.problemNumber}", 生徒解答="${problem.studentAnswer}"`)

    if (printedPage !== null) {
        console.log(`📄 AIが検出した印刷ページ番号: ${printedPage}`)

        // Step 1: まずセクション（ページ番号）で絞り込み
        const allPageNumbers = registeredAnswers
            .map(a => a.problemPageNumber)
            .filter((p): p is number => p !== undefined && p <= printedPage)

        if (allPageNumbers.length > 0) {
            const targetSectionPage = Math.max(...allPageNumbers)
            console.log(`📂 対象セクション: 問題ページ ${targetSectionPage} (印刷ページ ${printedPage} 以下で最大)`)

            // Step 2: 対象セクション内で問題番号でマッチング
            const sectionAnswers = registeredAnswers.filter(ans =>
                ans.problemPageNumber === targetSectionPage
            )

            const matchingInSection = sectionAnswers.filter(ans => {
                if (!ans.problemNumber) return false
                const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                return normalizedDbProblem === normalizedAiProblem
            })

            if (matchingInSection.length === 1) {
                matchedAnswer = matchingInSection[0]
                console.log(`✅ セクション${targetSectionPage}内で一意に特定`)
            } else if (matchingInSection.length > 1) {
                console.log(`⚠️ セクション${targetSectionPage}内に${matchingInSection.length}件の候補 → AIの判定を使用`)
            } else {
                // セクション内に見つからない場合、問題番号でグローバル検索
                console.log(`⚠️ セクション${targetSectionPage}内に問題「${problem.problemNumber}」が見つかりません → グローバル検索`)

                const matchingAnswers = registeredAnswers.filter(ans => {
                    if (!ans.problemNumber) return false
                    const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                    return normalizedDbProblem === normalizedAiProblem
                })

                if (matchingAnswers.length === 1) {
                    matchedAnswer = matchingAnswers[0]
                    console.log(`✅ 問題番号「${problem.problemNumber}」の解答が一意に特定されました (グローバル検索)`)
                } else if (matchingAnswers.length > 1) {
                    // 複数候補がある場合、印刷ページに最も近いものを選択
                    const closest = matchingAnswers.reduce((prev, curr) => {
                        const prevDist = Math.abs((prev.problemPageNumber ?? 9999) - printedPage)
                        const currDist = Math.abs((curr.problemPageNumber ?? 9999) - printedPage)
                        return currDist < prevDist ? curr : prev
                    })
                    matchedAnswer = closest
                    console.log(`📍 ${matchingAnswers.length}件の候補から最も近いページ(${closest.problemPageNumber})の解答を選択`)
                }
            }
        } else {
            console.log(`⚠️ 印刷ページ${printedPage}以下のセクションが見つかりません → AIの判定を使用`)
        }
    } else {
        // 印刷ページが検出できなかった場合のフォールバック
        console.log(`⚠️ 印刷ページ番号が検出できませんでした → PDFページ番号(${pageNum})を使用`)

        const allPageNumbers = registeredAnswers
            .map(a => a.problemPageNumber)
            .filter((p): p is number => p !== undefined && p <= pageNum)

        if (allPageNumbers.length > 0) {
            const targetSectionPage = Math.max(...allPageNumbers)
            console.log(`📂 PDFページ${pageNum}から推定されるセクション: 問題ページ ${targetSectionPage}`)

            const sectionAnswers = registeredAnswers.filter(ans =>
                ans.problemPageNumber === targetSectionPage
            )

            const matchingInSection = sectionAnswers.filter(ans => {
                if (!ans.problemNumber) return false
                const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                return normalizedDbProblem === normalizedAiProblem
            })

            if (matchingInSection.length === 1) {
                matchedAnswer = matchingInSection[0]
                console.log(`✅ セクション${targetSectionPage}内で一意に特定 (PDFページベース)`)
            } else if (matchingInSection.length > 1) {
                console.log(`⚠️ セクション${targetSectionPage}内に${matchingInSection.length}件の候補 → AIの判定を使用`)
            } else {
                // 問題番号のみでマッチング（後方互換性）
                const matchingAnswers = registeredAnswers.filter(ans => {
                    if (!ans.problemNumber) return false
                    const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                    return normalizedDbProblem === normalizedAiProblem
                })

                if (matchingAnswers.length === 1) {
                    matchedAnswer = matchingAnswers[0]
                    console.log(`✅ 問題番号「${problem.problemNumber}」の解答が一意に特定されました`)
                } else if (matchingAnswers.length > 1) {
                    console.log(`⚠️ ${matchingAnswers.length}件の候補があります → AIの判定を使用`)
                }
            }
        } else {
            // セクションが見つからない場合
            const matchingAnswers = registeredAnswers.filter(ans => {
                if (!ans.problemNumber) return false
                const normalizedDbProblem = normalizeProblemNumber(ans.problemNumber)
                return normalizedDbProblem === normalizedAiProblem
            })

            if (matchingAnswers.length === 1) {
                matchedAnswer = matchingAnswers[0]
                console.log(`✅ 問題番号「${problem.problemNumber}」の解答が一意に特定されました`)
            } else if (matchingAnswers.length > 1) {
                console.log(`⚠️ ${matchingAnswers.length}件の候補があります → AIの判定を使用`)
            }
        }
    }

    // ログ出力
    console.log(`🔎 マッチング結果: 問題番号="${problem.problemNumber}" (正規化: "${normalizedAiProblem}"), 印刷ページ=${printedPage ?? '不明'}, PDFページ=${pageNum}`)
    console.log(`   見つかった解答:`, matchedAnswer ? {
        problemNumber: matchedAnswer.problemNumber,
        correctAnswer: matchedAnswer.correctAnswer,
        pageNumber: matchedAnswer.pageNumber,
        problemPageNumber: matchedAnswer.problemPageNumber
    } : '(AI判定を使用)')

    // 採点結果を生成
    let isCorrect = false
    let correctAnswer = ''
    let feedback = ''
    let explanation = ''
    let gradingSource: 'db' | 'ai' = 'ai'

    if (matchedAnswer) {
        gradingSource = 'db'
        correctAnswer = matchedAnswer.correctAnswer
        const normalizedStudent = normalizeAnswer(problem.studentAnswer)
        const normalizedCorrect = normalizeAnswer(correctAnswer)

        isCorrect = normalizedStudent === normalizedCorrect

        console.log(`🔍 問題${problem.problemNumber}:`)
        console.log(`   生徒: "${problem.studentAnswer}" → "${normalizedStudent}"`)
        console.log(`   正解: "${correctAnswer}" → "${normalizedCorrect}"`)
        console.log(`   判定: ${isCorrect ? '✓ 正解' : '✗ 不正解'}`)

        if (isCorrect) {
            feedback = '正解です！よくできました！'
            explanation = `正解は ${correctAnswer} です。`
        } else {
            feedback = '惜しい！もう一度確認してみましょう。'
            explanation = `正解は ${correctAnswer} です。あなたの解答「${problem.studentAnswer}」を見直してみてください。`
        }
    } else {
        // ⚠️ DBに正解がない → AIの判定を採用
        console.log(`🤖 問題${problem.problemNumber}: AI判定使用`)
        isCorrect = problem.isCorrect || false
        correctAnswer = problem.correctAnswer || ''
        feedback = problem.feedback || '採点結果を確認してください。'
        explanation = problem.explanation || ''
    }

    return {
        matchedAnswer,
        isCorrect,
        correctAnswer,
        feedback,
        explanation,
        gradingSource,
        dbMatchedAnswer: matchedAnswer ? {
            problemNumber: matchedAnswer.problemNumber,
            correctAnswer: matchedAnswer.correctAnswer,
            problemPageNumber: matchedAnswer.problemPageNumber,
            pageNumber: matchedAnswer.pageNumber
        } : undefined
    }
}
