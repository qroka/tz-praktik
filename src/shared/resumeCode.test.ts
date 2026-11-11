import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, CODE_WORDS, LEGACY_CODE_LENGTH, codeEntropyBits, generateCode, normalizeCode } from './resumeCode';

describe('Личный код из русских слов', () => {
  it('в словаре не меньше 1900 слов, они не совпадают даже без «ё» и пригодны для диктовки', () => {
    expect(CODE_WORDS.length).toBeGreaterThanOrEqual(1900);
    const plain = CODE_WORDS.map((w) => w.replace(/ё/g, 'е'));
    expect(new Set(plain).size).toBe(plain.length);
    for (const word of CODE_WORDS) expect(word, word).toMatch(/^[а-яё]{3,12}$/);
  });

  it('три слова дают не меньше 32 бит случайности', () => {
    expect(CODE_LENGTH).toBe(3);
    expect(codeEntropyBits()).toBeGreaterThanOrEqual(32);
  });

  it('все слова прежнего словаря сохранены: выданные коды должны продолжать работать', () => {
    const issued = ['лиса', 'мост', 'река', 'замок', 'рябина', 'белка', 'актёр', 'шнур', 'мрамор', 'дуб', 'фрукт', 'табурет', 'костёр', 'порог', 'барсук', 'метро', 'волна', 'ветер', 'тропа'];
    for (const word of issued) expect(CODE_WORDS, word).toContain(word);
  });

  it('новый код — три слова, и он сам себя распознаёт', () => {
    for (let i = 0; i < 300; i++) {
      const code = generateCode((n) => randomInt(n));
      expect(code.split('-')).toHaveLength(CODE_LENGTH);
      expect(normalizeCode(code)).toBe(code);
    }
  });

  it('коды из четырёх слов, выданные раньше, принимаются', () => {
    expect(LEGACY_CODE_LENGTH).toBe(4);
    expect(normalizeCode('рябина-белка-актёр-шнур')).toBe('рябина-белка-актёр-шнур');
    expect(normalizeCode('Рябина белка актер шнур')).toBe('рябина-белка-актёр-шнур');
  });

  it('принимает любой регистр, разделители и «е» вместо «ё»', () => {
    expect(normalizeCode('Лиса мост, РЕКА')).toBe('лиса-мост-река');
    expect(normalizeCode('ЛИСА–МОСТ–ЕЛКА')).toBe('лиса-мост-ёлка');
    expect(normalizeCode('  лиса . мост ; река ')).toBe('лиса-мост-река');
  });

  it('отклоняет чужие слова, неверное число слов и не строки', () => {
    for (const bad of ['', 'лиса', 'лиса-мост', 'лиса-мост-река-замок-сад', 'лиса-мост-абракадабра', 'a-b-c', null, 42, 'я'.repeat(300)]) {
      expect(normalizeCode(bad as unknown), String(bad)).toBeNull();
    }
  });
});
