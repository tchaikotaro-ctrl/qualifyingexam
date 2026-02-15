import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const rawDir = path.join(rootDir, 'data', 'raw');
const outDir = path.join(rootDir, 'data', 'generated');
const bookletImageRootDir = path.join(outDir, 'booklet-images');
const cMapUrl = path.join(rootDir, 'node_modules', 'pdfjs-dist', 'cmaps') + '/';
const standardFontDataUrl = path.join(rootDir, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';

const exams = [
  {
    label: '第117回（2023年公表）',
    year: 2023,
    sourcePage: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/tp230502-01.html',
    prefix: 'tp220502-01'
  },
  {
    label: '第118回（2024年公表）',
    year: 2024,
    sourcePage: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/tp240424-01.html',
    prefix: 'tp240424-01'
  },
  {
    label: '第119回（2025年公表）',
    year: 2025,
    sourcePage: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/tp250428-01.html',
    prefix: 'tp250428-01'
  }
];

const sections = ['a', 'b', 'c', 'd', 'e', 'f'];
const sectionUpper = ['A', 'B', 'C', 'D', 'E', 'F'];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function download(url, dest) {
  try {
    await fs.access(dest);
    return;
  } catch {
    // no-op
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${url} (${res.status})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  await fs.writeFile(dest, Buffer.from(arrayBuffer));
}

async function loadPdfDocument(pdfPath) {
  const data = new Uint8Array(await fs.readFile(pdfPath));
  return pdfjs.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl
  }).promise;
}

async function loadPdfLines(pdfPath) {
  const doc = await loadPdfDocument(pdfPath);

  const allLines = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map();

    for (const item of tc.items) {
      const y = Math.round(item.transform[5] * 10) / 10;
      if (!rows.has(y)) {
        rows.set(y, []);
      }
      rows.get(y).push({ x: item.transform[4], str: item.str });
    }

    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const line = rows
        .get(y)
        .sort((a, b) => a.x - b.x)
        .map((part) => part.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!line) continue;
      allLines.push(line);
    }
  }

  return allLines;
}

function parseQuestions(lines, exam, section) {
  const questions = [];
  let current = null;
  let currentOption = null;

  const isNoise = (line) => {
    if (/^DKIX-/.test(line)) return true;
    if (/^\d+$/.test(line)) return true;
    return false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isNoise(line)) continue;

    const questionMatch = line.match(/^([1-9]|[1-6][0-9]|7[0-5])\s+(.+)$/);
    if (questionMatch) {
      if (current) {
        questions.push(current);
      }

      const questionNumber = Number(questionMatch[1]);
      current = {
        id: `${section}${String(questionNumber).padStart(3, '0')}`,
        examLabel: exam.label,
        examYear: exam.year,
        sourcePage: exam.sourcePage,
        section,
        number: questionNumber,
        prompt: questionMatch[2],
        options: {},
        optionOrder: ['A', 'B', 'C', 'D', 'E']
      };
      currentOption = null;
      continue;
    }

    if (!current) continue;

    const optionMatch = line.match(/^([ａ-ｅ])\s+(.+)$/);
    if (optionMatch) {
      const optionKey = optionMatch[1]
        .replace('ａ', 'A')
        .replace('ｂ', 'B')
        .replace('ｃ', 'C')
        .replace('ｄ', 'D')
        .replace('ｅ', 'E');

      current.options[optionKey] = optionMatch[2];
      currentOption = optionKey;
      continue;
    }

    if (currentOption && current.options[currentOption]) {
      current.options[currentOption] = `${current.options[currentOption]} ${line}`;
    } else {
      current.prompt = `${current.prompt} ${line}`;
    }
  }

  if (current) {
    questions.push(current);
  }

  return questions;
}

async function parseAnswerMap(answerPdfPath) {
  const lines = await loadPdfLines(answerPdfPath);
  const text = lines.join(' ');
  const answerMap = new Map();

  const regex = /([A-F]\d{3})\s+([A-E0-9]{1,5})/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const id = match[1];
    const answer = match[2];
    answerMap.set(id, answer);
  }

  return answerMap;
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function detectBookletNo(question) {
  const target = [question.prompt, ...Object.values(question.options)].join(' ');
  const m = target.match(/別\s*冊\s*No\.?\s*(\d+)/i);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function renderBookletPage(pdfDoc, pageNumber, outPath) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.3 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');

  await page.render({
    canvasContext: context,
    viewport
  }).promise;

  await fs.writeFile(outPath, canvas.toBuffer('image/png'));
}

async function extractBookletImages(examYear, section, bookletPdfPath, neededNos) {
  const imageMap = new Map();
  if (neededNos.size === 0) return imageMap;

  const pdfDoc = await loadPdfDocument(bookletPdfPath);
  const sectionDir = path.join(bookletImageRootDir, String(examYear), section);
  await ensureDir(sectionDir);

  const sortedNos = [...neededNos].sort((a, b) => a - b);

  for (const no of sortedNos) {
    if (no > pdfDoc.numPages) continue;

    const fileName = `no-${String(no).padStart(2, '0')}.png`;
    const absPath = path.join(sectionDir, fileName);
    const relPath = path
      .join('data', 'generated', 'booklet-images', String(examYear), section, fileName)
      .split(path.sep)
      .join('/');

    try {
      await fs.access(absPath);
    } catch {
      await renderBookletPage(pdfDoc, no, absPath);
    }

    imageMap.set(no, relPath);
  }

  return imageMap;
}

async function main() {
  await ensureDir(rawDir);
  await ensureDir(outDir);
  await ensureDir(bookletImageRootDir);

  const allQuestions = [];

  for (const exam of exams) {
    const answerFileName = `${exam.prefix}seitou.pdf`;
    const answerUrl = `https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/dl/${answerFileName}`;
    const answerPath = path.join(rawDir, answerFileName);

    await download(answerUrl, answerPath);
    const answerMap = await parseAnswerMap(answerPath);

    const sectionBuckets = new Map();

    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      const sectionId = sectionUpper[i];
      const problemFileName = `${exam.prefix}${section}_01.pdf`;
      const bookletFileName = `${exam.prefix}${section}_02.pdf`;
      const problemUrl = `https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/dl/${problemFileName}`;
      const bookletUrl = `https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/dl/${bookletFileName}`;
      const problemPath = path.join(rawDir, problemFileName);
      const bookletPath = path.join(rawDir, bookletFileName);

      await download(problemUrl, problemPath);
      await download(bookletUrl, bookletPath);

      const lines = await loadPdfLines(problemPath);
      const parsed = parseQuestions(lines, exam, sectionId);
      const questions = [];
      const neededNos = new Set();

      for (const q of parsed) {
        const answer = answerMap.get(q.id);
        if (!answer) continue;

        // keep A-E based questions only; skip numeric fill-in answers.
        if (!/^[A-E]+$/.test(answer)) continue;

        q.answer = answer.split('').sort().join('');
        q.prompt = normalizeText(q.prompt);
        for (const key of Object.keys(q.options)) {
          q.options[key] = normalizeText(q.options[key]);
        }

        // ensure all options exist for UI consistency.
        if (!q.optionOrder.every((k) => typeof q.options[k] === 'string' && q.options[k].length > 0)) {
          continue;
        }

        const bookletNo = detectBookletNo(q);
        if (bookletNo) {
          q.bookletNo = bookletNo;
          neededNos.add(bookletNo);
        }

        questions.push(q);
      }

      sectionBuckets.set(sectionId, {
        sectionId,
        bookletPath,
        questions,
        neededNos
      });
    }

    for (const [sectionId, bucket] of sectionBuckets.entries()) {
      const imageMap = await extractBookletImages(exam.year, sectionId, bucket.bookletPath, bucket.neededNos);

      for (const q of bucket.questions) {
        if (q.bookletNo && imageMap.has(q.bookletNo)) {
          q.bookletImagePath = imageMap.get(q.bookletNo);
        }
        allQuestions.push(q);
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourcePages: exams.map((e) => e.sourcePage),
    totalQuestions: allQuestions.length,
    questionsWithBookletImage: allQuestions.filter((q) => q.bookletImagePath).length,
    questions: allQuestions
  };

  const outPath = path.join(outDir, 'questions.json');
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');

  const byExam = allQuestions.reduce((acc, q) => {
    acc[q.examLabel] = (acc[q.examLabel] || 0) + 1;
    return acc;
  }, {});

  console.log(`Saved ${allQuestions.length} questions -> ${outPath}`);
  console.log(`Questions with booklet image: ${output.questionsWithBookletImage}`);
  console.log(byExam);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
