import fs from 'node:fs/promises';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

export const adapterId = 'mhlw-physician';

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

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

async function download(url, dest) {
  try {
    await fs.access(dest);
    return;
  } catch {
    // noop
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${url} (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  await fs.writeFile(dest, Buffer.from(arrayBuffer));
}

async function loadPdfDocument(pdfPath, projectRoot) {
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const cMapUrl = path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'cmaps') + '/';
  const standardFontDataUrl = path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';

  return pdfjs.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl
  }).promise;
}

async function loadPdfLines(pdfPath, projectRoot) {
  const doc = await loadPdfDocument(pdfPath, projectRoot);
  const allLines = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map();

    for (const item of tc.items) {
      const y = Math.round(item.transform[5] * 10) / 10;
      if (!rows.has(y)) rows.set(y, []);
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

      if (line) allLines.push(line);
    }
  }

  return allLines;
}

function parseQuestions(lines, exam, section) {
  const questions = [];
  let current = null;
  let currentOption = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^DKIX-/.test(line) || /^\d+$/.test(line)) continue;

    const questionMatch = line.match(/^([1-9]|[1-6][0-9]|7[0-5])\s+(.+)$/);
    if (questionMatch) {
      if (current) questions.push(current);
      const number = Number(questionMatch[1]);
      current = {
        id: `${section}${String(number).padStart(3, '0')}`,
        sourceExam: exam.label,
        examYear: exam.year,
        prompt: questionMatch[2],
        options: {},
        answer: ''
      };
      currentOption = null;
      continue;
    }

    if (!current) continue;

    const optionMatch = line.match(/^([ａ-ｅ])\s+(.+)$/);
    if (optionMatch) {
      const key = optionMatch[1]
        .replace('ａ', 'A')
        .replace('ｂ', 'B')
        .replace('ｃ', 'C')
        .replace('ｄ', 'D')
        .replace('ｅ', 'E');
      current.options[key] = optionMatch[2];
      currentOption = key;
      continue;
    }

    if (currentOption) {
      current.options[currentOption] = `${current.options[currentOption]} ${line}`;
    } else {
      current.prompt = `${current.prompt} ${line}`;
    }
  }

  if (current) questions.push(current);
  return questions;
}

async function parseAnswerMap(answerPdfPath, projectRoot) {
  const lines = await loadPdfLines(answerPdfPath, projectRoot);
  const text = lines.join(' ');
  const answerMap = new Map();

  const regex = /([A-F]\d{3})\s+([A-E0-9]{1,5})/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    answerMap.set(match[1], match[2]);
  }

  return answerMap;
}

function detectBookletNo(question) {
  const full = [question.prompt, ...Object.values(question.options)].join(' ');
  const m = full.match(/別\s*冊\s*No\.?\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function renderBookletPage(pdfDoc, pageNumber, outPath) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.3 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');

  await page.render({ canvasContext: context, viewport }).promise;
  await fs.writeFile(outPath, canvas.toBuffer('image/png'));
}

async function extractBookletImages(ctx, bookletPdfPath, examYear, sectionId, neededNos) {
  const imageMap = new Map();
  if (neededNos.size === 0) return imageMap;

  const pdfDoc = await loadPdfDocument(bookletPdfPath, ctx.projectRoot);
  const targetDir = path.join(ctx.assetsDir, String(examYear), sectionId);
  await ctx.ensureDir(targetDir);

  for (const no of [...neededNos].sort((a, b) => a - b)) {
    if (no > pdfDoc.numPages) continue;

    const fileName = `no-${String(no).padStart(2, '0')}.png`;
    const absPath = path.join(targetDir, fileName);
    const relPath = `output/assets/${examYear}/${sectionId}/${fileName}`;

    try {
      await fs.access(absPath);
    } catch {
      await renderBookletPage(pdfDoc, no, absPath);
    }

    imageMap.set(no, relPath);
  }

  return imageMap;
}

export async function build(ctx) {
  const questions = [];

  for (const exam of exams) {
    const answerFileName = `${exam.prefix}seitou.pdf`;
    const answerUrl = `https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/dl/${answerFileName}`;
    const answerPath = path.join(ctx.rawDir, answerFileName);

    await download(answerUrl, answerPath);
    const answerMap = await parseAnswerMap(answerPath, ctx.projectRoot);

    const sectionBuckets = [];

    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      const sectionId = sectionUpper[i];
      const problemPath = path.join(ctx.rawDir, `${exam.prefix}${section}_01.pdf`);
      const bookletPath = path.join(ctx.rawDir, `${exam.prefix}${section}_02.pdf`);
      const problemUrl = `https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/dl/${exam.prefix}${section}_01.pdf`;
      const bookletUrl = `https://www.mhlw.go.jp/seisakunitsuite/bunya/kenkou_iryou/iryou/topics/dl/${exam.prefix}${section}_02.pdf`;

      await download(problemUrl, problemPath);
      await download(bookletUrl, bookletPath);

      const lines = await loadPdfLines(problemPath, ctx.projectRoot);
      const parsed = parseQuestions(lines, exam, sectionId);
      const filtered = [];
      const neededNos = new Set();

      for (const q of parsed) {
        const ans = answerMap.get(q.id);
        if (!ans || !/^[A-E]+$/.test(ans)) continue;

        const hasAllOptions = ['A', 'B', 'C', 'D', 'E'].every((key) => typeof q.options[key] === 'string');
        if (!hasAllOptions) continue;

        q.prompt = normalizeText(q.prompt);
        q.options = {
          A: normalizeText(q.options.A),
          B: normalizeText(q.options.B),
          C: normalizeText(q.options.C),
          D: normalizeText(q.options.D),
          E: normalizeText(q.options.E)
        };
        q.answer = ans.split('').sort().join('');

        const bookletNo = detectBookletNo(q);
        if (bookletNo) {
          q.bookletNo = bookletNo;
          neededNos.add(bookletNo);
        }

        filtered.push(q);
      }

      sectionBuckets.push({ exam, sectionId, bookletPath, questions: filtered, neededNos });
    }

    for (const bucket of sectionBuckets) {
      const imageMap = await extractBookletImages(
        ctx,
        bucket.bookletPath,
        bucket.exam.year,
        bucket.sectionId,
        bucket.neededNos
      );

      for (const q of bucket.questions) {
        if (q.bookletNo && imageMap.has(q.bookletNo)) {
          q.imagePath = imageMap.get(q.bookletNo);
        }
        questions.push(q);
      }
    }
  }

  return {
    sourcePages: exams.map((e) => e.sourcePage),
    questions
  };
}
