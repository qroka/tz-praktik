import type { Intent } from '../types';

/** Предметы, при которых вопрос о «составе» или «работе» относится к устройству, а не ко всему узлу. */
const DEVICE_SUBJECTS = ['pump', 'motor', 'vfd', 'hx', 'hc', 'valve', 'power', 'plc', 'cabinet', 'sensor', 'flowmeter', 'air'];

/**
 * Какая именно сторона темы спрошена. Намерение одно («как работает сейчас»), а вопросы разные:
 * «что регулируется», «автоматизировано ли», «что делает оператор» — и отвечать на них надо по-разному.
 */
function detectAspect(text: string, flags: { current: boolean; future: boolean }): string | null {
  if (!flags.current && /что измен|что поменя/.test(text)) return 'change';
  if (!flags.current && /предусмотр|в нов\S* систем|нов\S* систем\S* (должн|долж)|что должн\S* (делать|уметь) систем/.test(text)) return 'newSystem';
  if (!flags.current && /подобр|закупа|купить/.test(text) && /оборудован|прибор|устройств/.test(text)) return 'select';
  if (flags.current) {
    if (/исполнительн/.test(text)) return 'actuators';
    if (/прибор|датчик|контрольно/.test(text)) return 'instruments';
    if (/режим/.test(text)) return 'modesNow';
    if (/контролир|измеря|отслежива/.test(text)) return 'monitoredNow';
    if (/автоматизирован/.test(text)) return 'automated';
    if (/автоматическ|автоматик|сам\S* работает/.test(text) && !/ручн/.test(text)) return 'autoNow';
    if (/парамет|регулиру|регулирует|регулируется|руками|вручную/.test(text)) return 'paramsManual';
    if (/оператор/.test(text)) return 'operatorDoes';
  }
  return null;
}

/** Смысловая рамка вопроса: то, что не различить одним совпадением слов. Фактов здесь нет. */
export function detectQuestionFrame(normalized: string, concepts: Set<string>) {
  const text = ` ${normalized} `;
  const has = (...names: string[]) => names.some((name) => concepts.has(name));
  const future = / (нуж\S*|надо|треб\S*|предусмотр\S*|планир\S*|долж\S*|буд\S*) |после (автоматизации|внедрения)| в нов\S* систем/.test(text);
  const current = !future && / (сейчас|щас|сечас|счас|существующ\S*|уже|пока|имеется|имеются|стоит|стоят|установлен\S*) |на данный момент|в наличии/.test(text);
  const device = has(...DEVICE_SUBJECTS);
  const location = has('room');
  const inventory =
    (has('equipment') && !location && !future && !has('brand', 'industrial', 'ip', 'serviceable', 'distance') && (current || / (есть|имеется|имеются) |^ какие приборы $|^ исполнительные устройства $/.test(text))) ||
    (current && has('installed') && !device && !location && !has('temp', 'press', 'flow', 'modes', 'money') && / (что|какие|какое|какой|какая) /.test(text)) ||
    /^ что есть $/.test(text);
  const responsibility = has('equipment') && / кто /.test(text) && /выб|подобр|определ/.test(text);
  const operation = has('modes', 'manual', 'auto', 'manageword', 'operatorAction', 'monitor', 'params') || /работает|работают/.test(text);
  const currentPump = current && has('pump', 'motor', 'vfd') && has('manageword', 'vfd', 'auto', 'manual', 'start');
  const operationNow = (current || !future && has('manual') && !has('modes')) && !has('pump', 'motor', 'hx', 'equipment', 'power', 'room', 'installed') && (operation || has('object'));
  const mixedModes = !future && !current && has('auto') && has('manual') && !has('alarm');
  // Состав и устройство узла целиком: «из чего состоит», «опишите состав и путь воды», «чем греется вода».
  const composition =
    !device &&
    !has('modes', 'alarm', 'hmi', 'docs') &&
    (/из чего|(^| )состав(е|а|у)? |(^| )состоит|устро[ие]|технологическ\S* схем|схем\S* (узла|установк)|пут[ьи] вод|как идет вода|что входит|что за (узел|установк|объект|систем)|как работает (установк|узел|систем|объект)/.test(text) ||
      /чем (\S+ )?(греют|греется|нагрева\S*|подогрева\S*)|как (\S+ )?(греется|нагревается)|(^| )котел/.test(text));
  // «Что нужно сделать?», «что вы хотите получить?», «что изменить в системе?» без предмета — это цель автоматизации.
  const wantsGoal =
    / (что|чего) /.test(text) &&
    / (нуж\S*|необходим\S*|треб\S*|надо|хотите|хотели|ожидаете|ждете|ждёте) /.test(text) &&
    / (сделать|изменить|поменять|автоматизировать|получить|улучшить|от системы|от нас) /.test(text) &&
    !has('temp', 'press', 'flow', 'alarm', 'pump', 'hx', 'valve', 'hmi', 'manual', 'auto', 'modes', 'equipment') &&
    text.trim().split(/\s+/).length <= 8;
  const detected = detectAspect(text, { current, future });
  // «Что предусмотреть в новой системе?» — общий вопрос; «какие режимы предусмотреть?» — уже про режимы.
  // «Как сейчас устроен узел?» — вопрос о схеме объекта; «как у вас сейчас всё устроено?» — о порядке работы.
  const namesObject = / (узел|узла|узле|установк\S*|объект\S*|систем\S*) /.test(text);
  const currentOperation = operationNow && !(composition && namesObject && /из чего|состав|устро|что входит|пут[ьи] вод/.test(text));
  const aspect = detected === 'newSystem' && has('modes', 'temp', 'press', 'flow', 'alarm', 'hmi', 'pump', 'hx', 'valve', 'power', 'equipment', 'docs') ? null : detected;
  // Будущие контролируемые параметры — это состав экрана оператора, а не цель и не текущее состояние.
  const monitorFuture = !current && /параметр\S* .*контролир|контролир\S* .*параметр|какие параметры (нужно|надо|будем) (измерять|контролировать)/.test(text);
  const goal = !current && ((/после (внедрения|автоматизации)/.test(text) && /что измен|цель|результат/.test(text)) || wantsGoal || aspect === 'newSystem');
  // «А если пропало электропитание?» — у заказчика есть сведение только про клапан.
  const powerLoss = has('power') && has('loss') && !has('pump', 'motor', 'valve', 'sensor', 'cabinet');
  // «Защита от сухого хода» — это останов насоса по низкому давлению на входе.
  const dryRun = /сух\S* ход|(нет|без) воды на (всасе|входе)/.test(text);
  // «Не греть / не открывать клапан, если насос стоит» — это запрет нагрева без циркуляции.
  const noFlowInterlock = /насос\S* (не работает|стоит|остановлен|выключен)|без насоса|не работает насос/.test(text) && (has('valve', 'heat', 'hc') || /блокир/.test(text));
  // «Чем поддерживать давление?» — у заказчика есть требование: через частотник.
  const pressControl = has('press') && /чем (\S+ )?(поддерж|регулир|держ)/.test(text);
  // Одно «А после насоса?» без давления в вопросе ничего не спрашивает, пока контекст не подскажет признак.
  const bareSide = /^ (а |и )?(до|после|перед|за) насоса $/.test(text);
  const time: 'current' | 'future' | 'unspecified' = current ? 'current' : future ? 'future' : 'unspecified';
  return { aspect, bareSide, current, future, time, inventory, responsibility, currentPump, currentOperation, mixedModes, goal, composition, monitorFuture, powerLoss, dryRun, noFlowInterlock, pressControl };
}

export type QuestionFrame = ReturnType<typeof detectQuestionFrame>;

/**
 * Рамки вопроса написаны под встроенный кейс (насос, теплообменник): они сразу отвечают его намерениями
 * и отсекают остальные. Для загруженных сценариев предметные рамки отключаются: остаются время и аспект вопроса.
 */
export function withoutDomainFrames(frame: QuestionFrame): QuestionFrame {
  return {
    ...frame,
    currentPump: false,
    responsibility: false,
    mixedModes: false,
    currentOperation: false,
    inventory: false,
    composition: false,
    monitorFuture: false,
    goal: false,
    powerLoss: false,
    dryRun: false,
    noFlowInterlock: false,
    pressControl: false,
    bareSide: false,
  };
}

/** Действие вопроса для диагностики: что студент хочет узнать. */
export function frameAction(frame: QuestionFrame, concepts: Set<string>): string {
  if (frame.inventory || frame.composition) return 'inventory';
  if (frame.currentOperation || frame.currentPump) return 'operating_state';
  if (concepts.has('general')) return 'specifications';
  if (concepts.has('manageword') || concepts.has('vfd')) return 'control';
  if (frame.goal || frame.future) return 'requirements';
  return 'question';
}

/** Applied equally to rules and teacher examples, including exact matches. */
export function frameAllows(intent: Intent, frame: QuestionFrame, concepts: Set<string>): boolean {
  if (frame.currentPump || frame.responsibility || frame.mixedModes) return false;
  if (frame.currentOperation) return intent.id === 'purpose_current';
  if (frame.inventory || frame.composition) return intent.id === 'object_desc';
  if (frame.monitorFuture) return intent.id === 'hmi_main';
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
