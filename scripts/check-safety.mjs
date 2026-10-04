import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { root } from './process.mjs';
import ignore from 'ignore';
import { createRequire } from 'node:module';

function filesIn(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    if (['node_modules', 'dist'].includes(name)) return [];
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}
const forbidden = ['WAYPOINT_DATA', 'S1-041', 'demo_allocation.csv', 'prototype/data.js'];
const ignored = ignore().add(readFileSync(resolve(root, '.gitignore'), 'utf8'));
for (const path of ['.env', '.local/postgres/PG_VERSION', 'input resources/prototype/data.js', 'input resources/competition.zip', 'prototype/data.js', 'prototype/data/demo_allocation.csv', 'private/outlets.csv', 'private-data/reference/calendar.csv', 'private-data/validation.json', 'competition.zip']) {
  if (!ignored.ignores(path)) throw new Error(`Private resource is not ignored: ${path}`);
}
const dockerIgnore = readFileSync(resolve(root, '.dockerignore'), 'utf8').split(/\r?\n/);
for (const pattern of ['.env', '.local', 'prototype', 'input resources', 'private', 'private-data', 'datasets', '*.zip', '**/*.csv']) {
  if (!dockerIgnore.includes(pattern)) throw new Error(`Missing Docker private-resource exclusion: ${pattern}`);
}
const files = [...filesIn(resolve(root, 'apps')), ...filesIn(resolve(root, 'packages')), ...filesIn(resolve(root, 'prisma'))];
for (const file of files) {
  if (/\.(ts|tsx|js|json|html|css|sql)$/.test(file) && forbidden.some(text => readFileSync(file, 'utf8').includes(text))) {
    throw new Error(`Competition reference found in application source: ${relative(root, file)}`);
  }
}
if (existsSync(resolve(root, 'apps/web/dist'))) {
  for (const file of filesIn(resolve(root, 'apps/web/dist'))) {
    if (!/\.(js|html|css)$/.test(file)) continue;
    if (forbidden.some(text => readFileSync(file, 'utf8').includes(text))) throw new Error('Competition reference found in public build.');
  }
}
const parse = createRequire(resolve(root, 'apps/api/package.json'))('csv-parse/sync').parse;
const privateIds = new Set();
for (const [name, field] of [['outlets.csv', 'outlet_id'], ['vehicles.csv', 'vehicle_id']]) {
  const path = resolve(root, 'private-data/reference', name);
  if (!existsSync(path)) continue;
  for (const row of parse(readFileSync(path, 'utf8'), { columns: true, bom: true })) {
    if (typeof row[field] === 'string' && row[field].length >= 4) privateIds.add(row[field]);
  }
}
const publicFiles = [...filesIn(resolve(root, 'apps/web')), ...filesIn(resolve(root, 'packages/shared')), resolve(root, 'prisma/seed.ts')];
if (existsSync(resolve(root, 'apps/web/dist'))) publicFiles.push(...filesIn(resolve(root, 'apps/web/dist')));
for (const file of publicFiles.filter(path => /\.(ts|tsx|js|html|css|json)$/.test(path))) {
  const content = readFileSync(file, 'utf8');
  if ([...privateIds].some(id => content.includes(id))) throw new Error(`Private reference identifier found in a public source/bundle or seed: ${relative(root, file)}`);
}
console.log(`PASS: ${privateIds.size} locally available official identifiers checked against frontend, shared package, auth seed and public bundle.`);
console.log('PASS: private files are ignored/excluded; application, seed and web bundle contain no embedded competition dataset markers.');
