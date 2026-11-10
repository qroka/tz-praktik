// Повтор входов: вопросы студентов из журналов прогона проходят через текущий движок.
// Это не новый студент (он бы задавал другие вопросы), а сравнение ответов на одинаковые входы.
// Запуск: REPLAY_FROM=docs/ux-audit/run2 REPLAY_TO=docs/ux-audit/replay npx vitest run --config scripts/ux-audit/vitest.audit.config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { scenario } from '../../src/data/scenario';
import { createEngineState, respond } from '../../src/engine/dialogueEngine';

const FROM = process.env.REPLAY_FROM ?? 'docs/ux-audit/run2';
const TO = process.env.REPLAY_TO ?? 'docs/ux-audit/replay';

it('повтор входов прогона на текущем движке', () => {
  mkdirSync(`${TO}/logs`, { recursive: true });
  for (const key of ['ivan', 'weak', 'strong']) {
    const file = `${FROM}/logs/${key}.jsonl`;
    if (!existsSync(file)) continue;
    const questions = readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line).question as string);
    let state = createEngineState();
    const lines = questions.map((text, index) => {
      const before = new Set(state.disclosed);
      const out = respond(state, { text, seed: 1, difficulty: 'learning' }, scenario);
      state = out.state;
      return JSON.stringify({
        n: index + 1,
        question: text,
        reply: out.reply.text,
        quality: out.reply.quality,
        intentId: out.reply.intentId,
        factIds: out.reply.factIds,
        newFacts: out.state.disclosed.filter((id) => !before.has(id)),
        uncertainty: out.reply.uncertainty?.id ?? null,
        reason: out.reply.diagnostic?.reason ?? null,
      });
    });
    writeFileSync(`${TO}/logs/${key}.jsonl`, `${lines.join('\n')}\n`);
  }
});
