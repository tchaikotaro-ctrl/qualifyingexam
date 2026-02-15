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
- Created a separate reusable project `exam-quiz-platform/` with pluggable adapter architecture for applying the quiz system to arbitrary qualification exams.
- Added a sample adapter for MHLW physician exam data plus generic web UI consuming `web/output/questions.json`.
- Revised booklet processing to render PDF pages first and then crop image panels based on detected `No.` marker regions.
- Improved mapping by using question-number cues (`問題 XX`) when available, with `No.`-based and page-based fallback to prevent missing links.
- Updated both projects' UIs to support multiple booklet images per question (e.g., A/B panels).
- Reset generated booklet image assets and rebuilt them from raw booklet PDFs.
- Changed mapping workflow to: render full page image -> crop panel -> recognize question number from cropped region text -> link to question body.
- Attempted browser automation debugging with Playwright; blocked in this environment due missing system library (`libnspr4.so`) and no sudo for dependency install.
- Fixed question parsing to strip trailing lead-in text such as `次の文を読み...` so later-case headers are no longer appended to prompts/options.
- Updated booklet-image mapping to emit multi-image arrays (`bookletImagePaths` / `imagePaths`) while keeping single-path compatibility fields.
- Aligned mapping priority in both builders to prefer question-number-recognized images over plain `bookletNo` matches.
- Rebuilt datasets for both projects and verified that lead-in contamination count dropped to zero while multi-image questions are now emitted.
