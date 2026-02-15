## GitHub Authentication
- GitHub連携が必要な操作では、プロジェクト直下の`.env`に保存された認証情報を使うこと。
- 使用する環境変数:
  - `GITHUB_TOKEN`
  - `GITHUB_USERNAME`
- 実行前に `source .env`（または同等の方法）で読み込んでからGitHub API/Git操作を行うこと。
- 認証情報をログやコミットに出力しないこと。

## Source Code Management
- このプロジェクトのソースコードはGitHubで管理すること。
- 変更は`git`で履歴管理し、意味のある単位でコミットすること。
- 作業完了後は`origin/main`へプッシュして、GitHub上の状態を最新に保つこと。

## Work Log
- 以後の作業ログはこの`AGENTS.md`に追記すること。

### 2026-02-14
- Added work-log policy to `AGENTS.md`.
- Corrected destination from `AGENT.md` to `AGENTS.md`.

### 2026-02-15
- Built a browser quiz app that loads the latest 3 years of MHLW physician national exam questions (117/118/119 rounds).
- Implemented a data build script that downloads official PDFs and extracts question/answer pairs into `data/generated/questions.json`.
- Added multi-select answer judging, score tracking, and random question navigation UI.
- Excluded non A-E answer-format questions (numeric fill-in style) from the playable dataset.
- Added booklet image extraction from each `*_02.pdf` and linked extracted images to questions containing `別冊 No.X`.
- Updated the quiz UI to display the linked booklet image with each applicable question.
