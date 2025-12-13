/**
 * 解答と問題番号の正規化ユーティリティ
 */

/**
 * 解答を正規化する関数
 * - 全角/半角変換
 * - 小文字変換
 * - 空白削除
 * - 数値の整形
 * - 単位の統一（度°）
 */
export function normalizeAnswer(answer: string): string {
    if (!answer) return ''

    let normalized = answer
        // 全角英数字を半角に変換
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
            String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
        )
        // 小文字に統一
        .toLowerCase()
        // スペースを削除
        .replace(/\s+/g, '')
        // 「度」と「°」を統一
        .replace(/度/g, '')
        .replace(/°/g, '')
        // 「cm」「m」などの単位を削除
        .replace(/cm²/gi, '')
        .replace(/cm/gi, '')
        .replace(/m²/gi, '')
        .replace(/m/gi, '')
        // 先頭のx=やy=を削除
        .replace(/^[xy]=/i, '')
        .trim()

    return normalized
}

/**
 * 問題番号を正規化する関数
 * - スペースを削除
 * - 全角括弧を半角に変換
 * - 小文字に統一
 */
export function normalizeProblemNumber(pn: string): string {
    if (!pn) return ''
    return pn
        .replace(/\s+/g, '') // スペースを削除: "1 (1)" → "1(1)"
        .replace(/（/g, '(')  // 全角括弧を半角に
        .replace(/）/g, ')')
        .toLowerCase()
        .trim()
}
