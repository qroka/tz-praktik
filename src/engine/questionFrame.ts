import type { Intent } from '../types';

/**
 * Какая именно сторона темы спрошена. Намерение одно («как работает сейчас»), а вопросы разные:
 * «что регулируется», «автоматизировано ли», «что делает оператор» — и отвечать на них надо по-разному.
 */
function detectAspect(text: string, flags: { current: boolean; future: boolean; goal: boolean }): string | null {
  if (/параметр\S* .*контролир|контролир\S* .*параметр/.test(text)) return 'monitored';
  if (/что измен|что поменя/.test(text)) return 'change';
  if (/подобр|закупа|купить/.test(text) && /оборудован|прибор|устройств/.test(text)) return 'select';
  if (flags.current) {
    if (/исполнительн/.test(text)) return 'actuators';
    if (/прибор|датчик|контрольно/.test(text)) return 'instruments';
    if (/режим/.test(text)) return 'modesNow';
    if (/автоматизирован/.test(text)) return 'automated';
    if (/автоматическ|автоматик|сам\S* работает/.test(text) && !/ручн/.test(text)) return 'autoNow';
    if (/парамет|регулиру|регулирует|регулируется|руками|вручную/.test(text)) return 'paramsManual';
    if (/оператор/.test(text)) return 'operatorDoes';
  }
  return null;
}

/** Relations that word overlap alone cannot distinguish. No equipment facts live here. */
export function detectQuestionFrame(normalized: string, concepts: Set<string>) {
  const text = ` ${normalized} `;
  const has = (...names: string[]) => names.some((name) => concepts.has(name));
  const future = / (нуж\S*|надо|треб\S*|предусмотр\S*|планир\S*|долж\S*|буд\S*) |после (автоматизации|внедрения)/.test(text);
  const current = !future && / (сейчас|щас|сечас|существующ\S*|уже|пока|имеется|имеются|стоит|стоят|установлен\S*) |на данный момент|в наличии/.test(text);
  const location = has('room');
  const inventory = (has('equipment') && !location && !future && !has('brand', 'industrial', 'ip', 'serviceable', 'distance') && (current || / (есть|имеется|имеются) |^ какие приборы $|^ исполнительные устройства $/.test(text))) || /^ что есть $/.test(text);
  const responsibility = has('equipment') && / кто /.test(text) && /выб|подобр|определ/.test(text);
  const operation = has('modes', 'manual', 'auto', 'manageword', 'operatorAction') || /работает|работают/.test(text);
  const currentPump = current && has('pump', 'motor', 'vfd') && has('manageword', 'vfd', 'auto', 'manual');
  const currentOperation = (current || !future && has('manual') && !has('modes')) && !has('pump', 'motor', 'hx', 'equipment', 'power', 'room') && (operation || has('object'));
  const mixedModes = !future && !current && has('auto') && has('manual') && !has('alarm');
  const goal = (/после (внедрения|автоматизации)/.test(text) && /что измен|цель|результат/.test(text)) || /параметр\S* .*контролир/.test(text);
  // Одно «А после насоса?» без давления в вопросе ничего не спрашивает, пока контекст не подскажет признак.
  const bareSide = /^ (а |и )?(до|после|перед|за) насоса $/.test(text);
  const aspect = detectAspect(text, { current, future, goal });
  return { aspect, bareSide, current, future, inventory, responsibility, currentPump, currentOperation, mixedModes, goal };
}

export type QuestionFrame = ReturnType<typeof detectQuestionFrame>;

/** Applied equally to rules and teacher examples, including exact matches. */
export function frameAllows(intent: Intent, frame: QuestionFrame, concepts: Set<string>): boolean {
  if (frame.currentPump || frame.responsibility || frame.mixedModes) return false;
  if (frame.currentOperation) return intent.id === 'purpose_current';
  if (frame.inventory) return intent.id === 'object_desc';
  if (frame.goal) return intent.id === 'purpose_goal';
  if (frame.future && intent.id === 'purpose_current') return false;
  if (intent.id.startsWith('press_out_') && concepts.has('beforePump')) return false;
  if (intent.id.startsWith('press_in_') && concepts.has('afterPump')) return false;
  // «Какое оборудование нужно будет подобрать?» — требования, а не срок выбора моделей.
  if (intent.id === 'eq_models_later' && frame.future && !concepts.has('brand')) return false;
  if (intent.id === 'power_control' && !concepts.has('power')) return false;
  if (intent.id === 'env_location' && !concepts.has('room')) return false;
  if (intent.id === 'farewell' && frame.current) return false;
  return true;
}
