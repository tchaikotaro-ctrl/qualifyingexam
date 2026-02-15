import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { adapter: '', outDir: 'web/output', rawDir: 'output/raw' };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--adapter') out.adapter = args[i + 1];
    if (args[i] === '--outDir') out.outDir = args[i + 1];
    if (args[i] === '--rawDir') out.rawDir = args[i + 1];
  }

  if (!out.adapter) {
    throw new Error('Missing --adapter <module-path>');
  }

  return out;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const args = parseArgs();
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const outDir = path.resolve(projectRoot, args.outDir);
  const rawDir = path.resolve(projectRoot, args.rawDir);
  const assetsDir = path.join(outDir, 'assets');

  await ensureDir(outDir);
  await ensureDir(rawDir);
  await ensureDir(assetsDir);

  const adapterPath = path.resolve(projectRoot, args.adapter);
  const adapter = await import(pathToFileURL(adapterPath).href);

  if (typeof adapter.build !== 'function') {
    throw new Error('Adapter must export async function build(context)');
  }

  const dataset = await adapter.build({
    projectRoot,
    outDir,
    rawDir,
    assetsDir,
    ensureDir
  });

  const result = {
    generatedAt: new Date().toISOString(),
    sourcePages: dataset.sourcePages,
    totalQuestions: dataset.questions.length,
    questionsWithImage: dataset.questions.filter((q) => q.imagePath).length,
    questions: dataset.questions
  };

  const outPath = path.join(outDir, 'questions.json');
  await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');

  console.log(`Adapter: ${adapter.adapterId || 'unknown'}`);
  console.log(`Saved ${result.totalQuestions} questions -> ${outPath}`);
  console.log(`Questions with image: ${result.questionsWithImage}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
