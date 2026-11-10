// Клиент для студента: node scripts/ux-audit/say.mjs <session> "<вопрос>"
// Особые команды: node say.mjs <session> --start "<имя>" | --screen | --intro
// Печатает только то, что видно в интерфейсе.
const [session, first, ...rest] = process.argv.slice(2);
const BASE = `http://127.0.0.1:${process.env.DRIVER_PORT ?? 5310}`;

async function call(path, payload) {
  const res = payload
    ? await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    : await fetch(`${BASE}${path}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

if (first === '--intro') console.log((await call('/intro')).screen);
else if (first === '--start') {
  const out = await call('/start', { session, name: rest.join(' ') || 'Студент' });
  console.log(`Заказчик: ${out.greeting}`);
} else if (first === '--screen') console.log((await call(`/screen?session=${encodeURIComponent(session)}`)).screen);
else {
  const text = [first, ...rest].join(' ');
  console.log(`Заказчик: ${(await call('/ask', { session, text })).reply}`);
}
