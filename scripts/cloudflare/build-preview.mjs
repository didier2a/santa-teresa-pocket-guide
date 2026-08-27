import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const output = path.join(root, 'cloudflare-dist');
const publicDirectories = ['data', 'engine', 'js', 'vendor'];
const publicRootExtensions = new Set(['.css', '.html', '.js', '.webmanifest']);

async function copyDirectory(name) {
  await cp(path.join(root, name), path.join(output, name), {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source).split(path.sep).join('/');
      return !relative.startsWith('assets/avatar-local/references/');
    },
  });
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of await readdir(root)) {
  const source = path.join(root, entry);
  if (!(await stat(source)).isFile()) continue;
  if (entry === '.nojekyll' || entry === 'service-worker.js' || publicRootExtensions.has(path.extname(entry))) {
    await cp(source, path.join(output, entry));
  }
}

for (const directory of publicDirectories) await copyDirectory(directory);

await cp(path.join(root, 'assets'), path.join(output, 'assets'), {
  recursive: true,
  filter(source) {
    const relative = path.relative(root, source).split(path.sep).join('/');
    return !relative.startsWith('assets/avatar-local/references/');
  },
});

const indexPath = path.join(output, 'index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('pocketguide-v23.html')) {
  await writeFile(
    indexPath,
    '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./pocketguide-v23.html"><title>Pocket Guide</title><a href="./pocketguide-v23.html">Ouvrir Pocket Guide V2.3.2 avec Claire</a></html>\n',
  );
}

await writeFile(path.join(output, '_redirects'), '/pocketguide-v23 /pocketguide-v23.html 200\n');
await writeFile(path.join(output, '_headers'), '/service-worker.js\n  Cache-Control: no-cache, no-store, must-revalidate\n/assets/avatar-local/*\n  Cache-Control: public, max-age=31536000, immutable\n/vendor/avatar-local/*\n  Cache-Control: public, max-age=31536000, immutable\n');

console.log('Cloudflare bundle ready: Pocket Guide V2.3.2 + Claire-only local 3D.');
