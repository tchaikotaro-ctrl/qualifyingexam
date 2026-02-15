# Exam Quiz Platform

任意の資格試験データを「アダプタ」で取り込み、同一UIで出題できる汎用プロジェクトです。

## 目的

- 試験ごとの取得・整形ロジックは `adapters/*.mjs` に分離
- クイズUI (`web/`) は共通化
- JSON形式を揃えるだけで他資格試験に横展開可能

## セットアップ

```bash
cd exam-quiz-platform
npm install
```

## サンプル（医師国家試験）データ生成

```bash
npm run build:sample
```

生成物:
- `web/output/questions.json`
- `web/output/assets/**`（問題に紐づく画像）

## 起動

```bash
npm start
```

- URL: `http://localhost:8090`

## 他資格試験へ適用する流れ

1. `examples/adapter-template.mjs` をコピーして `adapters/<your-exam>.mjs` を作成
2. `build(ctx)` で問題データを `questions` 配列に整形して返す
3. ビルド実行:

```bash
node core/build.mjs --adapter adapters/<your-exam>.mjs --outDir web/output --rawDir output/raw
```

4. `npm start` で同じUIから出題

## アダプタの返却フォーマット（必須）

- `sourcePages: string[]`
- `questions: Array<Question>`

`Question`:
- `id: string`
- `sourceExam: string`
- `examYear: number`
- `prompt: string`
- `options: { A,B,C,D,E }`
- `answer: string`（例: `A`, `BE`）
- `bookletNo?: number`
- `imagePath?: string`（`web/` からの相対パス。例: `output/assets/2026/no-01.png`）

## 同梱サンプルアダプタ

- `adapters/mhlw-physician.mjs`
  - 厚労省公開の第117回〜第119回医師国家試験を取得
  - 問題・正答を抽出
  - 別冊参照問題は画像化して紐づけ
