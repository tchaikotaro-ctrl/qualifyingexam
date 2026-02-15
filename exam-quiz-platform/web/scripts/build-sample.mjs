import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const child = spawn(
  process.execPath,
  [
    path.join(projectRoot, 'core', 'build.mjs'),
    '--adapter',
    'adapters/mhlw-physician.mjs',
    '--outDir',
    'web/output',
    '--rawDir',
    'output/raw'
  ],
  {
    cwd: projectRoot,
    stdio: 'inherit'
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
