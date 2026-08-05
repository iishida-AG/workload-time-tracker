# 業務・工数管理Webアプリケーション

予定 vs 実績、週次件数目標、週次・月次振り返りを運用する小規模チーム向けの静的Webアプリです。

## セットアップ

```bash
npm install react react-dom lucide-react date-fns
npm install -D vite typescript @vitejs/plugin-react vitest playwright
```

この環境ではPowerShellの実行ポリシーにより `npm.ps1` が止まる場合があります。その場合は `npm.cmd install` のように `npm.cmd` を使ってください。

## ローカル実行

```bash
npm run build
python -m http.server 4173 -d dist
```

ブラウザで `http://127.0.0.1:4173/` を開きます。

## テスト

```bash
npm test
npm run lint
npm run build
```

このCodex環境ではNodeの子プロセス起動が制限されるため、検証は同等の直接コマンドで実施しています。

```bash
node tests/run-all.mjs
node scripts/check-syntax.mjs
node scripts/build.mjs
```

## Firebase Hosting

`firebase.json` は `dist` を公開対象にしています。デプロイ前に `.firebaserc` の `REPLACE_WITH_FIREBASE_PROJECT_ID` を実際のFirebaseプロジェクトIDに置き換えてください。

```bash
firebase deploy --only hosting
```
