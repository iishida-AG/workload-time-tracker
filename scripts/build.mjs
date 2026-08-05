import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const dist = resolve(root, 'dist');

await mkdir(dist, { recursive: true });
await cp(resolve(root, 'src'), resolve(dist, 'src'), { recursive: true, force: true });

const html = await readFile(resolve(root, 'index.html'), 'utf8');
await writeFile(resolve(dist, 'index.html'), html, 'utf8');

console.log(`Built static app into ${dist}`);
