/**
 * 採点処理のユーティリティ関数
 * 
 * IndexedDBから取得した解答と、AIが検出した問題をマッチングして採点する
 */

import { AnswerRecord, saveGradingHistory, generateGradingHistoryId } from '../../../utils/indexedDB'
import { Problem, GradingResult } from '../../../services/api'
import { matchAndGrade } from './gradingMatcher'

export interface GradingContext {
    pdfId: string
    pdfFileName: string
    pageNum: number
    croppedImageData: string
}

/**
 * 問題配列を採点し、履歴を保存する
 */
export async function gradeProblems(
    problems: Problem[],
    registeredAnswers: AnswerRecord[],
    context: GradingContext
): Promise<void> {
    console.log(`📚 登録済み解答: ${registeredAnswers.length}件`)
    console.log(`📦 解答リスト:`, registeredAnswers.map(a => ({
        problemNumber: a.problemNumber,
        correctAnswer: a.correctAnswer,
        pageNumber: a.pageNumber,
        problemPageNumber: a.problemPageNumber
    })))

    for (const problem of problems) {
        // matchAndGrade関数を使用してマッチングと採点を実行
        const result = matchAndGrade(problem, registeredAnswers, context.pageNum)

        const historyRecord = {
            id: generateGradingHistoryId(),
            pdfId: context.pdfId,
            pdfFileName: context.pdfFileName,
            pageNumber: context.pageNum,
            problemNumber: problem.problemNumber,
            studentAnswer: problem.studentAnswer,
            isCorrect: result.isCorrect,
            correctAnswer: result.correctAnswer,
            feedback: result.feedback,
            explanation: result.explanation,
            timestamp: Date.now(),
            imageData: context.croppedImageData,
            matchingMetadata: problem.matchingMetadata
        }
        await saveGradingHistory(historyRecord)

        // 表示用にも判定結果を更新
        problem.isCorrect = result.isCorrect
        problem.correctAnswer = result.correctAnswer
        problem.feedback = result.feedback
        problem.explanation = result.explanation
        problem.gradingSource = result.gradingSource
        problem.dbMatchedAnswer = result.dbMatchedAnswer
    }

    console.log('採点履歴を保存しました:', problems.length, '件')
}
