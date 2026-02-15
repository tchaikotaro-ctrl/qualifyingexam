/**
 * @typedef {Object} ExamQuestion
 * @property {string} id
 * @property {string} sourceExam
 * @property {number} examYear
 * @property {string} prompt
 * @property {{A:string,B:string,C:string,D:string,E:string}} options
 * @property {string} answer
 * @property {number | undefined} bookletNo
 * @property {string | undefined} imagePath
 */

/**
 * @typedef {Object} BuildResult
 * @property {string} generatedAt
 * @property {string[]} sourcePages
 * @property {number} totalQuestions
 * @property {number} questionsWithImage
 * @property {ExamQuestion[]} questions
 */

export {};
