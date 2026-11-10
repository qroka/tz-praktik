// Этап 1 конвейера: подготовка сообщения.
// Вежливость в начале («Здравствуйте.», «Хорошо.», «Спасибо.») и вводная «Нам надо сделать ТЗ.»
// отделяются от содержательной части, чтобы не перехватить сам вопрос.

export type PreparedMessage = {
  /** Содержательная часть сообщения (или всё сообщение, если отделять нечего). */
  body: string;
  /** В начале было приветствие: заказчик поздоровается в ответ. */
  greeted: boolean;
  /** Отделённый вежливый или вводный префикс (для диагностики). */
  prefix: string | null;
};

const POLITE = String.raw`(?:здравствуйте|здравствуй|добрый\s+(?:день|вечер)|доброе\s+утро|привет(?:ствую)?|хорошо|ладно|понятно|ясно|понял[а]?|спасибо(?:\s+большое)?|благодарю|отлично|ок(?:ей)?|окей|давайте)`;
const GREET = /^(?:здравствуй|добрый|доброе|привет)/i;
// Вводная фраза студента о своей задаче — не просьба написать ТЗ за него.
const PREFACE = String.raw`(?:(?:нам|мне)\s+(?:нужно|надо|необходимо|предстоит)|я\s+(?:буду|должен|должна))\s+(?:сделать|составить|подготовить|написать|разработать)\s+(?:тз|техническое\s+задание)[^.!?]*`;

const PREFIX_RE = new RegExp(String.raw`^\s*((?:${POLITE}|${PREFACE})(?:\s*[,.!:;—-]+\s*|\s+))`, 'i');

/** Минимум осмысленного остатка: одно содержательное слово длиной от 3 букв. */
function meaningful(rest: string): boolean {
  return /[а-яёa-z]{3,}/i.test(rest);
}

export function prepareMessage(text: string): PreparedMessage {
  let body = text.trim();
  const prefixes: string[] = [];
  let greeted = false;
  // Префиксов может быть несколько: «Здравствуйте. Нам нужно сделать ТЗ. Расскажите…»
  for (let guard = 0; guard < 3; guard++) {
    const match = PREFIX_RE.exec(body);
    if (!match) break;
    const rest = body.slice(match[0].length);
    if (!meaningful(rest)) break;
    // Отделяем, только если дальше вопрос или содержательная фраза: «Спасибо за ответы» — это одна реплика.
    const words = rest.trim().split(/\s+/).length;
    if (!/\?/.test(rest) && words < 3 && !/^(какой|какая|какое|какие|сколько|как|что|где|есть|а)\s/i.test(rest.trim())) break;
    // «Хорошо, ясно» без вопроса после — это просто реплика, её разбирает обычный путь.
    const head = match[1].trim();
    prefixes.push(head);
    if (GREET.test(head)) greeted = true;
    body = rest.trim();
  }
  return { body: body || text.trim(), greeted, prefix: prefixes.length ? prefixes.join(' ') : null };
}
