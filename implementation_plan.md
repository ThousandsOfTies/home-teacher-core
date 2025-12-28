# PWAデータ消失対策（アップデート改善案）

ユーザー要望「削除＆作成を要さずソフトウェア更新したい」「通知（トースト）は見落とすのでバッジ表示にしたい」に基づき、**PWAの更新フロー自体を修正する**アプローチに変更します。

## 方針：Prompt for update（バッジ通知＆手動更新）

1.  **更新検知**: アプリ起動時または定期的に更新を確認。
2.  **バッジ表示**: 更新がある場合、初期画面の「Admin（管理画面）」切り替えタブに**オレンジの丸バッジ**を表示。
3.  **手動更新**: Admin画面内に「アプリを更新」ボタンを表示し、ユーザーがタップすると更新を実行。

### 変更点

1.  **`vite.config.ts` の設定変更**
    -   `registerType: 'autoUpdate'` を `'prompt'` に変更。

2.  **`src/App.tsx` の修正**
    -   `vite-plugin-pwa/react` の `useRegisterSW` フックをここで呼び出す。
    -   `needRefresh`（更新ありフラグ）と `updateServiceWorker`（更新関数）を取得。
    -   これらの状態を `<AdminPanel />` にPropsとして渡す。

3.  **`src/components/admin/AdminPanel.tsx` の修正**
    -   Propsに `hasUpdate: boolean`, `onUpdate: () => void` を追加。
    -   **Adminタブボタン**: `hasUpdate` が `true` の場合、右上にオレンジのドットを表示。
    -   **Admin画面コンテンツ**: `hasUpdate` が `true` の場合、リストの一番上に「✨ アプリを更新する」カードを表示。

### バックアップ機能について（今回は保留）
まずは「更新フロー改善」を実装します。

## 実装ステップ

1.  `vite.config.ts` 修正 (`registerType: 'prompt'`)
2.  `src/App.tsx` に `useRegisterSW` を組み込み
3.  `src/components/admin/AdminPanel.tsx` にバッジと更新ボタンを追加
4.  ビルド＆検証
