# 医師国家試験ランダムクイズ

指定の厚生労働省ページ（第117回/第118回/第119回）から問題PDF・正答PDFを取得し、ブラウザで解けるランダム出題クイズです。

## セットアップ

```bash
npm install
```

## 問題データ生成

```bash
npm run build:data
```

- 生成物: `data/generated/questions.json`
- A-Eの選択肢で解答できる問題のみ収録（数値入力問題は除外）

## 起動

```bash
npm start
```

`http://localhost:8080` を開いて利用します。

## データ出典

- https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/tp230502-01.html
- https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/tp240424-01.html
- https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/tp250428-01.html
