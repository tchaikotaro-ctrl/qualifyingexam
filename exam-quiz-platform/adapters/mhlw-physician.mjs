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
        number,
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

function extractNoMarkers(textItems) {
  const items = textItems
    .map((item) => ({
      s: String(item.str || '').trim(),
      x: item.transform[4],
      y: item.transform[5]
    }))
    .filter((i) => i.s);

  const numbers = items.filter((i) => /^\d+$/.test(i.s));
  const markers = [];

  for (const it of items) {
    if (it.s !== 'No.') continue;

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const num of numbers) {
      const dx = num.x - it.x;
      const dy = Math.abs(num.y - it.y);
      if (dx < -2 || dx > 140 || dy > 28) continue;
      const score = dy * 3 + dx;
      if (score < bestScore) {
        bestScore = score;
        best = num;
      }
    }

    if (!best) continue;
    const no = Number(best.s);
    if (!Number.isInteger(no) || no <= 0 || no >= 100) continue;

    const duplicated = markers.some((m) => m.no === no && Math.abs(m.x - it.x) < 8 && Math.abs(m.y - it.y) < 4);
    if (!duplicated) {
      markers.push({ no, x: it.x, y: it.y });
    }
  }

  return markers.sort((a, b) => b.y - a.y || a.x - b.x);
}

function recognizeQuestionNoInRegion(textItems, marker, upperPt, lowerPt) {
  const minX = marker.x - 10;
  const maxX = marker.x + 380;
  const maxY = upperPt + 6;
  const minY = lowerPt - 6;

  const target = textItems
    .map((item) => ({
      s: String(item.str || '').trim(),
      x: item.transform[4],
      y: item.transform[5]
    }))
    .filter((i) => i.s && i.x >= minX && i.x <= maxX && i.y >= minY && i.y <= maxY)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((i) => i.s)
    .join(' ');

  const compact = target.replace(/\s+/g, '');
  const m = compact.match(/問題([1-9][0-9]?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 75) return null;
  return n;
}

function cropPanel(fullCanvas, sx, sy, sw, sh) {
  const w = Math.max(1, Math.floor(sw));
  const h = Math.max(1, Math.floor(sh));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(fullCanvas, Math.floor(sx), Math.floor(sy), w, h, 0, 0, w, h);
  return canvas;
}

async function extractBookletImages(ctx, bookletPdfPath, examYear, sectionId, neededNos) {
  const imageMap = new Map();
  const questionImageMap = new Map();
  if (neededNos.size === 0) return { imageMap, questionImageMap };

  const pdfDoc = await loadPdfDocument(bookletPdfPath, ctx.projectRoot);
  const targetDir = path.join(ctx.assetsDir, String(examYear), sectionId);
  await ctx.ensureDir(targetDir);

  const scale = 1.7;
  const sideMargin = 20;
  const topPad = 18;
  const bottomPad = 10;

  const markersByPage = new Map();
  const pageCountsByNo = new Map();

  for (let pageNo = 1; pageNo <= pdfDoc.numPages; pageNo += 1) {
    const page = await pdfDoc.getPage(pageNo);
    const textContent = await page.getTextContent();
    const markers = extractNoMarkers(textContent.items).filter((m) => neededNos.has(m.no));
    if (markers.length === 0) continue;

    markersByPage.set(pageNo, { markers, textItems: textContent.items });
    for (const marker of markers) {
      if (!pageCountsByNo.has(marker.no)) pageCountsByNo.set(marker.no, new Map());
      const counter = pageCountsByNo.get(marker.no);
      counter.set(pageNo, (counter.get(pageNo) || 0) + 1);
    }
  }

  const selectedPageByNo = new Map();
  for (const [no, counts] of pageCountsByNo.entries()) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (best) selectedPageByNo.set(no, best[0]);
  }

  for (const [pageNo, payload] of markersByPage.entries()) {
    const targetMarkers = payload.markers
      .filter((m) => selectedPageByNo.get(m.no) === pageNo)
      .sort((a, b) => b.y - a.y || a.x - b.x);
    if (targetMarkers.length === 0) continue;

    const page = await pdfDoc.getPage(pageNo);
    const viewport = page.getViewport({ scale });
    const fullCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const fullCtx = fullCanvas.getContext('2d');

    await page.render({ canvasContext: fullCtx, viewport }).promise;

    const pageHeightPt = viewport.height / scale;
    const pageWidthPx = fullCanvas.width;
    const pageHeightPx = fullCanvas.height;

    for (let i = 0; i < targetMarkers.length; i += 1) {
      const marker = targetMarkers[i];
      const upperPt = i === 0 ? pageHeightPt - 6 : (targetMarkers[i - 1].y + marker.y) / 2;
      const lowerPt = i === targetMarkers.length - 1 ? 8 : (marker.y + targetMarkers[i + 1].y) / 2;

      const cropTopPx = Math.max(0, Math.floor((pageHeightPt - upperPt - topPad) * scale));
      const cropBottomPx = Math.min(pageHeightPx, Math.ceil((pageHeightPt - lowerPt + bottomPad) * scale));
      const cropLeftPx = sideMargin;
      const cropWidthPx = Math.max(1, pageWidthPx - sideMargin * 2);
      const cropHeightPx = Math.max(1, cropBottomPx - cropTopPx);

      const subCanvas = cropPanel(fullCanvas, cropLeftPx, cropTopPx, cropWidthPx, cropHeightPx);

      const existing = imageMap.get(marker.no) || [];
      const idx = existing.length + 1;
      const fileName = `no-${String(marker.no).padStart(2, '0')}-${idx}.png`;
      const absPath = path.join(targetDir, fileName);
      const relPath = `output/assets/${examYear}/${sectionId}/${fileName}`;

      await fs.writeFile(absPath, subCanvas.toBuffer('image/png'));
      existing.push(relPath);
      imageMap.set(marker.no, existing);

      const questionNo = recognizeQuestionNoInRegion(payload.textItems, marker, upperPt, lowerPt);
      if (Number.isInteger(questionNo)) {
        const byQuestion = questionImageMap.get(questionNo) || [];
        byQuestion.push(relPath);
        questionImageMap.set(questionNo, byQuestion);
      }
    }
  }

  // Fallback: when marker detection fails, use booklet page number as No.
  for (const no of neededNos) {
    if (imageMap.has(no)) continue;
    if (no > pdfDoc.numPages) continue;

    const page = await pdfDoc.getPage(no);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;

    const fileName = `no-${String(no).padStart(2, '0')}-fallback.png`;
    const absPath = path.join(targetDir, fileName);
    const relPath = `output/assets/${examYear}/${sectionId}/${fileName}`;
    await fs.writeFile(absPath, canvas.toBuffer('image/png'));
    imageMap.set(no, [relPath]);
  }

  return { imageMap, questionImageMap };
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
      const { imageMap, questionImageMap } = await extractBookletImages(
        ctx,
        bucket.bookletPath,
        bucket.exam.year,
        bucket.sectionId,
        bucket.neededNos
      );

      for (const q of bucket.questions) {
        if (q.bookletNo && Number.isInteger(q.number) && questionImageMap.has(q.number)) {
          q.imagePaths = questionImageMap.get(q.number);
          q.imagePath = q.imagePaths[0];
        } else if (q.bookletNo && imageMap.has(q.bookletNo)) {
          q.imagePaths = imageMap.get(q.bookletNo);
          q.imagePath = q.imagePaths[0];
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
