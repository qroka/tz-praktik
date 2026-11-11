import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, CODE_WORDS, codeEntropyBits, generateCode, normalizeCode } from './resumeCode';

describe('Личный код попытки из русских слов', () => {
  it('в словаре достаточно слов, и они не совпадают даже без «ё»', () => {
    expect(CODE_WORDS.length).toBeGreaterThanOrEqual(256);
    const plain = CODE_WORDS.map((w) => w.replace(/ё/g, 'е'));
    expect(new Set(plain).size).toBe(plain.length);
    for (const word of CODE_WORDS) expect(word).toMatch(/^[а-яё]{2,12}$/);
  });
  it('даёт не меньше 32 бит случайности', () => expect(codeEntropyBits()).toBeGreaterThanOrEqual(32));
  it('сгенерированный код состоит из четырёх слов и сам себя распознаёт', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode((n) => randomInt(n));
      expect(code.split('-')).toHaveLength(CODE_LENGTH);
      expect(normalizeCode(code)).toBe(code);
    }
  });
  it('принимает любой регистр, пробелы и «е» вместо «ё»', () => {
    expect(normalizeCode('Лиса мост, РЕКА   замок')).toBe('лиса-мост-река-замок');
    expect(normalizeCode('ЛИСА–МОСТ–ЕЛКА–ЗАМОК')).toBe('лиса-мост-ёлка-замок');
  });
  it('отклоняет чужие слова, неверное число слов и не строки', () => {
    for (const bad of ['', 'лиса-мост-река', 'лиса-мост-река-замок-сад', 'лиса-мост-река-абракадабра', 'a-b-c-d', null, 42, 'я'.repeat(300)]) {
      expect(normalizeCode(bad as unknown)).toBeNull();
    }
  });
});
