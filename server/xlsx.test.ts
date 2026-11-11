// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { unzip } from './testUtils.ts';
import { buildXlsx } from './xlsx.ts';

describe('Генератор xlsx', () => {
  const file = buildXlsx([
    {
      name: 'Попытки: [тест]',
      header: ['№', 'Студент', 'Начало', 'Балл'],
      rows: [
        [1, 'Мария', new Date('2026-11-02T10:00:00.000Z'), 80],
        [2, '=HYPERLINK("http://x")', null, null],
        [3, 'Строка <b>&</b>\nс переносом', new Date('invalid'), Number.NaN],
        [4, 'Ёлка\u0000\u0007', undefined, 0],
      ],
    },
  ]);
  const parts = unzip(file);

  it('это zip с обязательными частями пакета', () => {
    expect(file.subarray(0, 2).toString()).toBe('PK');
    expect(Object.keys(parts).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  });
  it('имя листа очищено от запрещённых символов', () => {
    expect(parts['xl/workbook.xml']).toContain('name="Попытки   тест"');
  });
  it('заголовок, числа и кириллица записаны', () => {
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<t>Студент</t>');
    expect(sheet).toContain('Мария');
    expect(sheet).toContain('<c r="D2"><v>80</v></c>');
    expect(sheet).toContain('<pane ySplit="1"');
    expect(sheet).toContain('<autoFilter ref="A1:D5"/>');
  });
  it('дата записана числом Excel в московском времени', () => {
    // 2026-11-02 13:00 МСК: 46328 суток + 13/24
    expect(parts['xl/worksheets/sheet1.xml']).toMatch(/<c r="C2" s="2"><v>46328\.541666/);
  });
  it('формула остаётся текстом, а не выполняется', () => {
    expect(parts['xl/worksheets/sheet1.xml']).toContain('<c r="B3" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;)</t></is></c>');
    expect(parts['xl/worksheets/sheet1.xml']).not.toMatch(/<f>/);
  });
  it('XML-символы экранируются, управляющие удаляются, пустые и неверные значения пропускаются', () => {
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('Строка &lt;b&gt;&amp;&lt;/b&gt;\nс переносом');
    expect(sheet).toContain('Ёлка</t>');
    expect(sheet).not.toMatch(/[\u0000-\u0008]/);
    expect(sheet).not.toContain('r="C4"');
    expect(sheet).not.toContain('r="D4"');
    expect(sheet).not.toContain('NaN');
  });
  it('требует хотя бы один лист', () => {
    expect(() => buildXlsx([])).toThrow();
  });
});
