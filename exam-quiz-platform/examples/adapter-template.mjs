export const adapterId = 'your-exam-adapter';

/**
 * @param {{projectRoot:string,outDir:string,rawDir:string,assetsDir:string,ensureDir:(dir:string)=>Promise<void>}} ctx
 */
export async function build(ctx) {
  // 1) 問題データを取得（API, CSV, PDF, DB など）
  // 2) 必要なら画像を ctx.assetsDir に保存
  // 3) 下記フォーマットで返却
  return {
    sourcePages: ['https://example.com/exam-source'],
    questions: [
      {
        id: 'Q001',
        sourceExam: 'サンプル資格試験',
        examYear: 2026,
        prompt: 'この中で正しいものはどれか。',
        options: {
          A: '選択肢A',
          B: '選択肢B',
          C: '選択肢C',
          D: '選択肢D',
          E: '選択肢E'
        },
        answer: 'B',
        bookletNo: undefined,
        imagePath: undefined
      }
    ]
  };
}
