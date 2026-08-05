# 業務・工数管理Webアプリケーション Design

## 目的

個人および小規模チームが、1時間単位の予定・実績、週次件数目標、週次・月次振り返りを一つの画面群で運用できる工数管理アプリを作る。

## 追加パッケージ

```bash
npm install react react-dom lucide-react date-fns
npm install -D vite typescript @vitejs/plugin-react vitest playwright
```

## データベース構造

Firestore化しやすい正規化構造を採用する。今回のMVPでは同じ形を `localStorage` に保存する。

- `projects`: `{ id, name, order, status }`
- `tasks`: `{ id, projectId, name, nature, countable, status, order }`
- `dayPlans`: `{ date, hour, taskId, note }`
- `dayActuals`: `{ date, hour, taskId, note }`
- `weeklyGoals`: `{ weekStart, taskId, targetCount }`
- `dailyCounts`: `{ date, taskId, count }`
- `weeklyReviews`: `{ weekStart, goalReflection, overtimeCause, nextPromise, updatedAt }`

## 主要コンポーネント

- `AppShell`: 全体レイアウト、タブ、日付・週の状態管理。
- `ReminderStrip`: 今週の改善約束と主要KPIの常時表示。
- `TimelineBoard`: 9:00〜19:00の予定・実績タイムライン、予定通りコピー、セル選択。
- `ShortcutPalette`: 有効な小分類カード、クイック追加導線。
- `KpiCounterPanel`: 件数管理対象タスクの週次目標と日次実績の加算。
- `MasterDataScreen`: 大分類・小分類の追加、編集、非表示。
- `ReviewDashboard`: 週次・月次の集計、円グラフ、予実ギャップTop3、振り返りフォーム。

## 方針

最初はFirebase Hostingへデプロイ可能なReact + Viteの静的SPAとして作る。データ保存は `storage` モジュールに閉じ込め、Firestoreへ移す場合は保存アダプタ差し替えで対応する。集計ロジックはUIから切り離してVitestで検証する。

## テスト

集計・コピー・件数更新・翌週改善約束の解決をユニットテストで守る。UIはビルド後にPlaywrightでPC幅とスマホ幅のスクリーンショットを確認する。
