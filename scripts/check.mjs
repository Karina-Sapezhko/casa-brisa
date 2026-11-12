import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const sources = new Map([['index.html', html]]);

for (const name of await readdir(root)) {
  if (!/\.(css|js)$/.test(name)) continue;
  const content = await readFile(path.join(root, name), 'utf8');
  sources.set(name, content);
  if (name.endsWith('.js')) new Script(content, { filename: name });
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Every HTML/SVG ID must be unique');
for (const [, target] of html.matchAll(
  /\b(?:href|aria-labelledby|aria-describedby)="#?([^"]+)"/g,
)) {
  if (/^(?:[\w-]+\s*)+$/.test(target)) {
    for (const id of target.split(/\s+/))
      assert(ids.includes(id), `Missing anchor or label: ${id}`);
  }
}

const references = new Set();
for (const [name, content] of sources) {
  for (const [, url] of content.matchAll(
    /(?:\b(?:src|href|data-flower-video)=["']|url\(["']?)([^\s"'<>\)]+)/g,
  )) {
    if (/^(?:#|https?:|data:|mailto:|tel:)/.test(url)) continue;
    const local = decodeURIComponent(url.split(/[?#]/)[0]);
    if (local) references.add(path.normalize(path.join(path.dirname(name), local)));
  }
}

const roomScript = html.match(/<script\b[^>]*\bid="rooms-data"[^>]*>([\s\S]*?)<\/script>/);
assert(roomScript, 'Room data is present');
const rooms = JSON.parse(roomScript[1]);
assert.equal(rooms.length, 4, 'Four room categories are expected');
assert.equal(new Set(rooms.map((room) => room.slug)).size, rooms.length, 'Room slugs are unique');

let photos = 0;
for (const room of rooms) {
  assert(ids.includes(`stay-${room.slug}`), `Missing room section: ${room.slug}`);
  assert(html.includes(`data-book-room="${room.slug}"`), `Missing booking action: ${room.slug}`);
  assert(
    room.name && room.area > 0 && room.guests > 0 && room.floor,
    `Incomplete room: ${room.slug}`,
  );
  assert(room.photos.length > 1, `Gallery requires multiple photos: ${room.slug}`);
  assert.equal(
    new Set(room.photos.map((photo) => photo.src)).size,
    room.photos.length,
    `Duplicate photos: ${room.slug}`,
  );
  for (const photo of room.photos) {
    const [left, top, width, height] = photo.crop;
    assert(photo.alt?.trim(), `Missing image description: ${photo.src}`);
    assert([left, top, width, height].every(Number.isFinite), `Invalid crop: ${photo.src}`);
    assert(
      left >= 0 &&
        top >= 0 &&
        width > 0 &&
        height > 0 &&
        left + width <= 1000 &&
        top + height <= 662,
      `Crop outside source image: ${photo.src}`,
    );
    assert(photo.focus >= 0 && photo.focus <= 1, `Invalid focal point: ${photo.src}`);
    references.add(photo.src);
    photos++;
  }
}

for (const relative of references) {
  const file = path.resolve(root, relative);
  assert(file.startsWith(root), `Asset is outside the public directory: ${relative}`);
  assert((await stat(file)).isFile(), `Missing asset: ${relative}`);
}

async function checkAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await checkAssets(file);
    else
      assert(
        references.has(path.relative(root, file)),
        `Unused public asset: ${path.relative(root, file)}`,
      );
  }
}
await checkAssets(path.join(root, 'assets'));

console.log(
  `Checked ${sources.size} source files, ${references.size} local resources, ${ids.length} IDs and ${photos} gallery photos.`,
);
