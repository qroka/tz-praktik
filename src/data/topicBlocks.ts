// Тематические ответы без новых сведений.
// 1. Паспортные блоки: на «какие характеристики у насоса?» заказчик называет 2–3 связанных паспортных значения
//    из существующих фактов, текстом их собственных ответов. Пороги, реакции и решения сюда не входят.
// 2. Неизвестное: честный ответ по предмету, когда в сценарии нет подтверждённого факта (бак, резервный насос…).
// 3. Термины: короткое пояснение без значений и без раскрытия фактов.
import type { GlossaryEntry, SpecGroup, UnknownTopic } from '../types';

export const specGroups: SpecGroup[] = [
  {
    id: 'pump',
    title: 'насос',
    intentId: 'about_pump',
    subjects: ['pump', 'motor'],
    topics: ['pump', 'vfd'],
    items: [
      { factId: 'pump_type', intentId: 'pump_type', cues: ['kind'] },
      { factId: 'pump_power', intentId: 'pump_power', cues: ['powerkw'] },
      { factId: 'pump_nominal', intentId: 'pump_nominal', cues: ['nominal'] },
      { factId: 'pump_head', intentId: 'pump_head', cues: ['head'] },
      { factId: 'pump_supply', intentId: 'pump_supply', cues: ['power'] },
    ],
  },
  {
    id: 'hx',
    title: 'теплообменник',
    intentId: 'about_hx',
    subjects: ['hx'],
    topics: ['hx'],
    items: [
      { factId: 'hx_type', intentId: 'hx_type', cues: ['kind'] },
      { factId: 'hx_power', intentId: 'hx_power', cues: ['powerkw'] },
      { factId: 'hx_max_press', intentId: 'hx_max_press', cues: ['press'] },
      { factId: 'hx_max_temp', intentId: 'hx_max_temp', cues: ['temp'] },
      { factId: 'hx_dn_water', intentId: 'hx_dn', cues: ['dn'] },
      { factId: 'hx_dn_heat', intentId: 'hx_dn', cues: ['dn'] },
    ],
  },
  {
    id: 'hc',
    title: 'теплоноситель',
    intentId: 'about_hc',
    subjects: ['hc'],
    topics: ['hc', 'hc_press'],
    items: [
      { factId: 'hc_supply_temp', intentId: 'hc_supply_temp', cues: ['supplyHc'] },
      { factId: 'hc_return_temp', intentId: 'hc_return_temp', cues: ['return'] },
      { factId: 'hc_pressure', intentId: 'hc_pressure', cues: [] },
      { factId: 'hc_max_press', intentId: 'hc_max_press', cues: ['limit'] },
    ],
  },
  {
    id: 'power',
    title: 'электропитание',
    intentId: 'about_power',
    subjects: ['power'],
    topics: ['power'],
    items: [
      { factId: 'power_available', intentId: 'power_available', cues: [] },
      { factId: 'power_control', intentId: 'power_control', cues: ['ctrlCircuit', 'automation'] },
    ],
  },
  {
    id: 'env',
    title: 'условия эксплуатации',
    intentId: 'about_env',
    subjects: ['ambient'],
    topics: ['environment'],
    items: [
      { factId: 'env_location', intentId: 'env_location', cues: [] },
      { factId: 'env_temp', intentId: 'env_temp', cues: ['temp'] },
      { factId: 'env_ex', intentId: 'env_ex', cues: ['ex'] },
    ],
  },
];

/**
 * Темы без подтверждённых сведений в сценарии. Совпадение — по шаблону нормализованного текста
 * (ё → е, нижний регистр, без пунктуации) и, если заданы, по группам понятий.
 */
export const unknownTopics: UnknownTopic[] = [
  {
    id: 'low_temp',
    kind: 'undefined',
    category: 'warning',
    label: 'Сигнализация по низкой температуре воды',
    concepts: [['temp', 'heat']],
    pattern: String.raw`(^| )(низк\S*|недогрев\S*|ниже нормы|не догрева\S*|не нагрева\S*|холодн\S* вод\S* на мойк)`,
    excludeConcepts: ['inlet', 'winter', 'summer', 'hc', 'ambient', 'room', 'hx', 'flow', 'alarm', 'limit'],
    replies: ['Сигнал по низкой температуре воды мы отдельно не задавали. Если считаете нужным — предложите порог, согласуем.'],
  },
  {
    id: 'low_temp_signal',
    kind: 'undefined',
    category: 'warning',
    label: 'Сигнализация по низкой температуре воды',
    pattern: String.raw`(холодн|низк|не догрева|недогрев)\S* .*(предупрежд|предупред|сигнал)|(предупрежд|предупред|сигнал)\S* .*(холодн|низк|не догрева|недогрев)`,
    excludeConcepts: ['hc', 'ambient', 'room', 'hx', 'flow', 'alarm', 'press'],
    replies: ['Сигнал по низкой температуре воды мы отдельно не задавали. Если считаете нужным — предложите порог, согласуем.'],
  },
  {
    id: 'hc_loss',
    kind: 'undefined',
    category: 'protection',
    label: 'Реакция на пропадание теплоносителя',
    concepts: [['hc'], ['loss', 'low']],
    excludeConcepts: ['sensor', 'press', 'temp'],
    replies: ['Отдельной реакции на пропадание теплоносителя мы не задавали. Предложите, как система должна себя вести, — согласуем.'],
  },
  {
    id: 'scada',
    kind: 'undefined',
    category: 'hmi',
    label: 'Связь с верхним уровнем (SCADA)',
    concepts: [['scada']],
    replies: ['Связь с заводской системой мы пока не обсуждали. Если нужна — предложите, согласуем.'],
  },
  {
    id: 'schedule',
    kind: 'survey',
    label: 'Режим работы линии (смены)',
    category: 'object',
    pattern: String.raw`(^| )смен(ы|ам|ах|е)?( |$)|посменн|круглосуточн|график\S* работ|сколько часов (в сутки|работает)`,
    replies: ['График работы линии по сменам я вам сейчас точно не скажу — это надо уточнить на объекте.'],
  },
  {
    id: 'control_means',
    kind: 'designer',
    label: 'Чем регулировать температуру',
    category: 'actuators',
    pattern: String.raw`чем (\S+ )?(регулир|поддерж|держ)`,
    excludeConcepts: ['press'],
    replies: ['Чем именно регулировать — это ваше проектное решение, предложите. Требования к самому регулированию скажу, если спросите.'],
  },
  {
    id: 'tank',
    kind: 'survey',
    category: 'object',
    label: 'Наличие и объём бака',
    pattern: String.raw`(^| )(бак|бака|баки|баке|баков|емкост\S*|резервуар\S*|накопител\S*)( |$)`,
    replies: [
      'Про бак у меня сведений нет. Это надо смотреть на объекте.',
      'Есть ли там бак и какой — не скажу, не уточнял. Проверьте на объекте.',
    ],
  },
  {
    id: 'pump_count',
    kind: 'survey',
    category: 'actuators',
    label: 'Количество насосов и резерв',
    pattern: String.raw`сколько насос|резервн\S* насос|насос\S* (в )?резерв|второй насос|запасн\S* насос`,
    contextPattern: String.raw`(^| )(он|насос) один( |$)|резервн\S* (нет|есть)|есть (ли )?резервн`,
    contextTopics: ['pump', 'vfd'],
    replies: [
      'Сколько насосов и есть ли резервный, я точно не скажу — это надо уточнить на объекте.',
      'По количеству насосов и резерву у меня данных нет. Проверьте на месте.',
    ],
  },
  {
    id: 'hc_medium',
    kind: 'undefined',
    appendTo: ['hc', 'hc_press', 'hx'],
    category: 'object',
    label: 'Вид теплоносителя (вода или пар)',
    concepts: [['hc']],
    pattern: String.raw`(^| )(пар|пара|паром)( |$)`,
    replies: [
      'Что именно за среда, я не уточнял: теплоноситель приходит к нам извне. Отметьте это как вопрос к согласованию.',
    ],
  },
  {
    id: 'mode_rights',
    kind: 'undefined',
    category: 'modes',
    label: 'Кто переключает режимы, права доступа',
    pattern: String.raw`(^| )кто .*( переключ| прав)|(^| )кто .*включ\S* (режим|обслуживан)|(^| )прав[оа]? (на|доступа|переключ|включ)|(^| )разграничен\S*|(^| )уровн\S* доступ|(^| )парол`,
    replies: [
      'Кто и как переключает режимы, мы пока не определяли. Предложите порядок — согласуем.',
      'Права доступа не обсуждали. Ваше предложение рассмотрим.',
    ],
  },
  {
    id: 'estop_button',
    kind: 'undefined',
    category: 'protection',
    label: 'Кнопка аварийного останова',
    pattern: String.raw`кнопк|грибок|аварийн\S* стоп|экстренн\S* (останов|стоп)`,
    replies: [
      'Отдельно про кнопку аварийного останова мы не договаривались. Если считаете нужной — предложите. Что должно происходить при аварийном останове, могу сказать.',
    ],
  },
  {
    id: 'power_backup',
    kind: 'survey',
    appendTo: ['power'],
    category: 'power',
    label: 'Вводы питания, резерв, ИБП',
    pattern: String.raw`(^| )ибп( |$)|бесперебойн|резервн\S* (питан|ввод)|второ\S* ввод|сколько ввод|какой ввод|от чего питается`,
    replies: [
      'Сколько вводов и есть ли резерв по питанию — это у электриков надо уточнить, у меня таких данных нет.',
    ],
  },
  {
    id: 'humidity',
    kind: 'survey',
    appendTo: ['environment'],
    category: 'environment',
    label: 'Влажность в помещении',
    pattern: String.raw`влажн|влажно|сырост`,
    replies: ['Влажность в цифрах никто не мерил. Проверьте на объекте.'],
  },
  {
    id: 'signal_type',
    kind: 'designer',
    category: 'actuators',
    label: 'Тип сигналов и связи',
    pattern: String.raw`каким сигнал|какой сигнал|какие сигнал|тип сигнал|(^| )4 20( |$)|(^| )0 10( |$)|(^| )ма( |$)|миллиампер|токов\S* сигнал|аналогов\S* сигнал|протокол\S* связ|modbus|модбас|profibus|профибас`,
    replies: [
      'Тип сигналов и связь выбирайте сами под оборудование, потом согласуем.',
      'Сигналы — это ваш выбор как проектировщика. Предложите, мы посмотрим.',
    ],
  },
  {
    id: 'panel_type',
    kind: 'designer',
    category: 'hmi',
    label: 'Тип и место панели оператора',
    appendTo: ['hmi'],
    pattern: String.raw`как\S* (нужна |нужен )?(панел|пульт|экран( |$))|тип панел|где .*(панел|пульт)|(панел|пульт)\S* .*(на шкаф|в диспетчерск|в операторск)|диагонал|сенсорн\S* (панел|экран)|размер\S* (экрана|панели)|панель или компьютер`,
    replies: ['Какую панель ставить и где, решайте вы. Предложите вариант — согласуем.'],
  },
  {
    id: 'problems',
    kind: 'undefined',
    category: 'purpose',
    label: 'Потери от ручного регулирования',
    pattern: String.raw`(^| )брак|(^| )перерасход|какие проблем|что не устраива|чем плохо`,
    replies: [
      'Цифр по браку и перерасходу я не собирал. Главное — сейчас всё держится на операторе, а хотим стабильно и без него.',
    ],
  },
  {
    id: 'replace',
    kind: 'survey',
    category: 'object',
    label: 'Что заменить из существующего',
    pattern: String.raw`замен|что (из этого|из существующего|из старого) .*(менять|поменять|оставить)|что оставить`,
    replies: [
      'Что из существующего менять, а что оставить, решим после обследования: перечень оборудования ещё нужно уточнить на объекте. Ваши предложения выслушаю.',
    ],
  },
  {
    id: 'existing_devices',
    kind: 'survey',
    category: 'actuators',
    label: 'Что сейчас стоит из арматуры и приводов',
    pattern: String.raw`(что|какое|какие) (сейчас |уже )?(стоит|стоят|установлен\S*) (на|у) насос|((есть|стоит|стоят|установлен\S*|имеется|уже)( ли)? .*(клапан|задвижк|частотн|(^| )пч( |$)|пускател|регулятор))|((клапан|задвижк|частотн|(^| )пч( |$)|пускател|регулятор)\S* .*(есть|стоит|установлен\S*|уже|сейчас))`,
    requiresNotFuture: true,
    replies: [
      'Что именно сейчас стоит из арматуры и приводов, я не уточнял. Это надо смотреть на объекте.',
      'По существующей арматуре и приводам точного перечня у меня нет — проверьте на месте.',
    ],
  },
  {
    id: 'pump_failure',
    kind: 'undefined',
    category: 'protection',
    label: 'Реакция на отказ насоса или ПЧ',
    pattern: String.raw`(насос|двигател|частотн|преобразовател)\S* .*(слома|откаж|отказ|неисправ|сгор)|(отказ|авари|поломк|неисправн|перегрев)\S* (\S+ )?(насоса|двигател\S*|частотн\S*|преобразовател\S*|пч)`,
    excludeConcepts: ['hmi', 'log', 'message'],
    replies: [
      'Отдельной реакции на отказ насоса или частотника мы не прописывали. Предложите, как система должна себя вести, — согласуем.',
    ],
  },
  {
    id: 'power_restore',
    kind: 'undefined',
    appendTo: ['valve'],
    category: 'protection',
    label: 'Поведение после восстановления питания',
    pattern: String.raw`после (восстановлени|появлени|подачи|возврата)\S* питан|питани\S* .*(восстанов|вернет|вернется|появит|дадут)|(восстановлени\S*|появлени\S*) (\S+ )?питани|после отключени\S* (света|питания) .*(запуст|включ)|(пропал\S*|отключил\S*),? (а )?потом (появил|дали|вернул|включил)`,
    replies: ['Как система должна вести себя после восстановления питания, мы не определяли. Предложите вариант.'],
  },
  {
    id: 'low_press_out',
    kind: 'undefined',
    category: 'protection',
    label: 'Защита по низкому давлению после насоса',
    concepts: [['press', 'pumpSide'], ['afterPump', 'afterAny'], ['low']],
    excludeConcepts: ['sensor', 'flowmeter'],
    replies: [
      'Отдельного порога по низкому давлению после насоса мы не задавали. Предложите, что считать низким и как реагировать, — согласуем.',
    ],
  },
];

export const glossary: GlossaryEntry[] = [
  {
    id: 'hc',
    pattern: String.raw`теплоносител`,
    text: 'Теплоноситель — это горячая среда, которая приходит к нам извне и через теплообменник греет воду. У него свои температура и давление, их можно спросить отдельно.',
  },
  {
    id: 'return',
    pattern: String.raw`обратк|обратн\S* (линия|трубопровод)`,
    text: 'Обратка — это теплоноситель, который уже отдал тепло в теплообменнике и уходит обратно.',
  },
  {
    id: 'setpoint',
    pattern: String.raw`уставк`,
    text: 'Уставка — значение, которое система должна поддерживать или при котором срабатывает сигнал. Например, нужная температура воды — это тоже уставка.',
  },
  {
    id: 'vfd',
    pattern: String.raw`частотн|преобразовател\S* частот|(^| )пч( |$)|(^| )чрп( |$)`,
    text: 'Преобразователь частоты меняет скорость вращения двигателя. Насос тогда работает не на полную мощность, а сколько нужно.',
  },
  {
    id: 'ack',
    pattern: String.raw`квитир`,
    text: 'Квитировать аварию — значит подтвердить, что оператор её увидел и принял к сведению.',
  },
  {
    id: 'dn',
    pattern: String.raw`(^| )dn( |$)|условн\S* проход|(^| )ду( |$)`,
    text: 'DN — условный диаметр присоединения трубы, по нему подбирают арматуру и патрубки.',
  },
  {
    id: 'ip',
    pattern: String.raw`(^| )ip( |$)|степен\S* защит`,
    text: 'IP — степень защиты корпуса прибора от пыли и воды. Чем выше цифры, тем лучше защита.',
  },
  {
    id: 'hx',
    pattern: String.raw`теплообменник`,
    text: 'Теплообменник — аппарат, в котором тепло от одной среды передаётся другой, не смешивая их.',
  },
];

