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

## Firebase realtime setup

1. Create a Firebase project on the Spark plan in the Firebase Console.
2. Add a Web app and enter its configuration values in `src/firebase-config.js`.
3. Create a Cloud Firestore database and use test mode only during initial setup.
4. Open Firestore rules are risky. Use Authentication and email-restricted rules before sharing the URL.
5. When the Firebase configuration is incomplete, the app uses localStorage instead.

## Firebase Authentication setup

For the public GitHub Pages URL, enable login before shared data is shown:

1. In Firebase Console, open Authentication.
2. Enable Email/Password sign-in.
3. Add only the two users who should use the app: Ishida and Tanoue.
4. Open Authentication settings and add the GitHub Pages domain, for example `<owner>.github.io`, to Authorized domains.
5. Open Firestore Rules and use `firestore.rules.example` as the template.
6. Replace `ISHIDA_EMAIL@example.com` and `TANOUE_EMAIL@example.com` with the two real login email addresses before publishing the rules.

Do not add a signup form to the app. User creation should stay in Firebase Console so only approved accounts can log in.

## GitHub Pages

GitHub Pages can host this static app from a public repository on GitHub Free.
Use the published Pages URL with a `user` query parameter:

- Ishida: `https://<owner>.github.io/<repository>/?user=ishida`
- Tanoue: `https://<owner>.github.io/<repository>/?user=tanoue`

The app also shows both share links in the header after deployment.
