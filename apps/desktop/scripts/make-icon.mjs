// Gera build/icon.png (256x256) sem dependências: um quadrado arredondado
// azul com um "2" branco. O electron-builder converte o PNG para .ico.
// Uso: npm run icon -w @discord-2/desktop
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 256;
const RADIUS = 56;
const BG = [88, 101, 242];
const FG = [255, 255, 255];

// "2" em uma grade 5x7, cada célula vira um bloco de CELL pixels.
const GLYPH = ['01110', '10001', '00001', '00010', '00100', '01000', '11111'];
const CELL = 22;
const glyphX = (SIZE - GLYPH[0].length * CELL) / 2;
const glyphY = (SIZE - GLYPH.length * CELL) / 2;

/** Cobertura (0..1) do quadrado arredondado no pixel, com borda suavizada. */
function background(x, y) {
  const cx = Math.min(Math.max(x + 0.5, RADIUS), SIZE - RADIUS);
  const cy = Math.min(Math.max(y + 0.5, RADIUS), SIZE - RADIUS);
  const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return Math.min(Math.max(RADIUS - dist + 0.5, 0), 1);
}

function inGlyph(x, y) {
  const col = Math.floor((x - glyphX) / CELL);
  const row = Math.floor((y - glyphY) / CELL);
  return GLYPH[row]?.[col] === '1';
}

// Cada linha do PNG começa com o byte do filtro (0 = nenhum), seguido de RGBA.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1);
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b] = inGlyph(x, y) ? FG : BG;
    raw.set([r, g, b, Math.round(background(x, y) * 255)], row + 1 + x * 4);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, compressão/filtro/entrelaçamento padrão

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`ícone gerado em ${out}`);
