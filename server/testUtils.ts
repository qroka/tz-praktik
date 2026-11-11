// Помощники для тестов сервера.
import { inflateRawSync } from 'node:zlib';
import { expect } from 'vitest';

/** Читает zip по центральному каталогу: независимая проверка того, что записал генератор. */
export function unzip(buffer: Buffer): Record<string, string> {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let pos = buffer.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(buffer.readUInt32LE(pos)).toBe(0x02014b50);
    const method = buffer.readUInt16LE(pos + 10);
    const size = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const local = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLength).toString('utf8');
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    expect(method).toBe(8);
    out[name] = inflateRawSync(buffer.subarray(dataStart, dataStart + size)).toString('utf8');
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}
