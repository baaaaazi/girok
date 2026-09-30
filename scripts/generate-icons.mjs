import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const sizes = [192, 512, 180]
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const body = Buffer.concat([name, data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body), 0)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  return Buffer.concat([length, body, checksum])
}

function png(size) {
  const scale = size / 512
  const pixels = Buffer.alloc(size * size * 4, 0)
  const fill = (x, y, w, h, color) => {
    const left = Math.round(x * scale)
    const top = Math.round(y * scale)
    const right = Math.round((x + w) * scale)
    const bottom = Math.round((y + h) * scale)
    for (let row = Math.max(0, top); row < Math.min(size, bottom); row += 1) {
      for (let column = Math.max(0, left); column < Math.min(size, right); column += 1) {
        const offset = (row * size + column) * 4
        pixels[offset] = color[0]
        pixels[offset + 1] = color[1]
        pixels[offset + 2] = color[2]
        pixels[offset + 3] = 255
      }
    }
  }
  fill(0, 0, 512, 512, [39, 38, 32])
  fill(138, 118, 238, 54, [245, 243, 238])
  fill(138, 118, 54, 282, [245, 243, 238])
  fill(138, 346, 180, 54, [245, 243, 238])
  fill(318, 238, 58, 162, [245, 243, 238])
  const rows = []
  for (let row = 0; row < size; row += 1) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(row * size * 4, (row + 1) * size * 4)]))
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public', { recursive: true })
for (const size of sizes) {
  const suffix = size === 180 ? 'apple-touch-icon' : `pwa-${size}`
  const bytes = png(size)
  writeFileSync(`public/${suffix}.png`, bytes)
  if (size !== 180) writeFileSync(`public/${suffix}-maskable.png`, bytes)
}
