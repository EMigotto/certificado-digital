/**
 * Build script: bundles frontend TS → dist/public/ using esbuild.
 * Copies index.html and CSS files alongside the JS bundle.
 */

import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const frontendDir = join(root, 'src', 'frontend');
const outDir = join(root, 'dist', 'public');

// Ensure output directories
mkdirSync(join(outDir, 'scripts'), { recursive: true });
mkdirSync(join(outDir, 'styles'), { recursive: true });

// Bundle TypeScript
await build({
  entryPoints: [join(frontendDir, 'scripts', 'app.ts')],
  bundle: true,
  outfile: join(outDir, 'scripts', 'app.js'),
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
});

// Copy static files
cpSync(join(frontendDir, 'index.html'), join(outDir, 'index.html'));
cpSync(join(frontendDir, 'styles'), join(outDir, 'styles'), { recursive: true });

console.log('✓ Frontend built to dist/public/');
