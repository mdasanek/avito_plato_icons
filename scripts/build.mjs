import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('.nojekyll', 'dist/.nojekyll');
await cp('src', 'dist/src', { recursive: true });
console.log('Static website built in dist/');
