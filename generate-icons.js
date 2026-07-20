const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPNG(width, height, getPixel) {
  const lineSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * lineSize);

  for (let y = 0; y < height; y++) {
    const lineStart = y * lineSize;
    rawData[lineStart] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const idx = lineStart + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);

    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

function renderIconPixel(x, y, w, h) {
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;

  const cornerR = 0.4;
  const absX = Math.abs(nx);
  const absY = Math.abs(ny);
  let isInsideBg = false;
  if (absX <= 0.8 && absY <= 0.8) {
    isInsideBg = true;
  } else {
    const dx = Math.max(0, absX - (0.8 - cornerR));
    const dy = Math.max(0, absY - (0.8 - cornerR));
    isInsideBg = (dx * dx + dy * dy) <= (cornerR * cornerR);
  }

  if (!isInsideBg) return [0, 0, 0, 0];

  const t = (ny + 1) / 2;
  let r = Math.round(15 + t * (49 - 15));
  let g = Math.round(23 + t * (16 - 23));
  let b = Math.round(42 + t * (63 - 42));

  const hx = nx * 1.35;
  const hy = (ny + 0.08) * -1.35;
  const heartEq = Math.pow(hx * hx + hy * hy - 0.45, 3) - hx * hx * Math.pow(hy, 3);

  if (heartEq <= 0) {
    const ht = (hy + 0.7) / 1.4;
    r = Math.round(244 - ht * 19);
    g = Math.round(63 - ht * 34);
    b = Math.round(94 - ht * 22);

    if (Math.abs(hy - (-0.05 + Math.abs(hx) * 0.7)) < 0.06 && Math.abs(hx) < 0.35) {
      r = 255;
      g = 255;
      b = 255;
    }
  }

  return [r, g, b, 255];
}

const icon192 = createPNG(192, 192, renderIconPixel);
const icon512 = createPNG(512, 512, renderIconPixel);

fs.writeFileSync(path.join(__dirname, 'icon-192.png'), icon192);
fs.writeFileSync(path.join(__dirname, 'icon-512.png'), icon512);

// Also generate icon.svg
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#31103f"/>
    </linearGradient>
    <linearGradient id="heart" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f43f5e"/>
      <stop offset="100%" stop-color="#e11d48"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="180" fill="#f43f5e" opacity="0.15" filter="url(#glow)"/>
  <path d="M256 420s-140-92-140-190c0-54 42-96 96-96 32 0 62 16 76 42 14-26 44-42 76-42 54 0 96 42 96 96 0 98-140 190-140 190z" fill="url(#heart)"/>
  <path d="M190 220l66 50 66-50" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/>
</svg>`;

fs.writeFileSync(path.join(__dirname, 'icon.svg'), svg);

console.log('Icons generated successfully: icon-192.png, icon-512.png, icon.svg');
