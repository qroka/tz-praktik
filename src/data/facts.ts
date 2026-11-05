// Скрытая модель объекта: то, что знает заказчик и что студент должен выяснить.
import type { Confidence, DisclosureLevel, FactClaim, RequirementType, ScenarioFact } from '../types';

type Options = {
  level?: DisclosureLevel;
  prerequisites?: string[];
  confidence?: Confidence;
  type?: RequirementType;
  numbers?: number[];
  claim?: FactClaim;
  askLabel?: string;
  isReaction?: boolean;
};

function fact(id: string, category: string, section: number, label: string, value: string, aliases: string[], options: Options = {}): ScenarioFact {
  return {
    id,
    category,
    value,
    aliases,
    disclosureLevel: options.level ?? 'specific',
    prerequisites: options.prerequisites,
    customerConfidence: options.confidence ?? 'certain',
    requirementType: options.type ?? 'mandatory',
    label,
    askLabel: options.askLabel,
    section,
    numbers: options.numbers,
    claim: options.claim,
    isReaction: options.isReaction,
  };
}

/** Сведения, которых заказчик не знает: решение должен предложить проектировщик. */
function unknown(id: string, category: string, section: number, label: string, value: string, aliases: string[]): ScenarioFact {
  return fact(id, category, section, label, value, aliases, { confidence: 'unknown', type: 'proposal' });
}

const TEMP = ['temp', 'heat'];

export const facts: ScenarioFact[] = [
  // Назначение и цели
  fact('purpose_goal', 'purpose', 3, 'Цель системы', 'Обеспечить подачу воды на мойку с заданной температурой и давлением.', ['мойк+температ+давлен', 'подач+вод+температ', 'поддержан+температ+давлен'], { level: 'general' }),
  fact('purpose_manual', 'purpose', 3, 'Текущее положение', 'Сейчас оператор регулирует параметры вручную; систему автоматизируют, чтобы это исключить.', ['вручную', 'ручн+регулир', 'автоматизац+оператор', 'исключ+ручн'], { level: 'general' }),
  fact('sys_name', 'purpose', 1, 'Наименование системы', 'Система автоматического управления узлом приготовления горячей воды моечной линии.', ['систем+управлен+горяч', 'сау+узл', 'узел+приготовлен+горяч', 'узл+приготовлен+горяч'], { level: 'general' }),
  unknown('unk_basis', 'purpose', 2, 'Основание для разработки', 'Реквизиты документа заказчик не называет — основание формулирует исполнитель и согласует с заказчиком.', ['основан', 'заявк', 'договор']),

  // Объект автоматизации
  fact('obj_flow', 'object', 4, 'Состав узла', 'Вода проходит через пластинчатый теплообменник, нагревается теплоносителем и насосом подаётся на мойку.', ['теплообмен+насос', 'теплоносит+вод+мойк', 'вод+теплообмен+мойк'], { level: 'general' }),
  fact('temp_inlet_winter', 'object', 4, 'Температура входной воды зимой', 'Около 10 °C.', ['зим', 'входн+вод', 'холодн+вод', 'вход+вод'], {
    numbers: [10], confidence: 'approximate',
    claim: { unit: 'c', values: [10], concepts: [['temp'], ['winter']], display: 'около 10 °C' },
  }),
  fact('temp_inlet_summer', 'object', 4, 'Температура входной воды летом', '20–25 °C.', ['лет', 'входн+вод', 'вход+вод'], {
    numbers: [20, 25], confidence: 'approximate',
    claim: { unit: 'c', values: [20, 25], range: true, concepts: [['temp'], ['summer']], display: '20–25 °C' },
  }),
  fact('hx_type', 'object', 4, 'Тип теплообменника', 'Пластинчатый.', ['пластинчат'], { level: 'general' }),
  fact('hx_power', 'object', 4, 'Мощность теплообменника', 'До 300 кВт по паспорту.', ['теплообмен', 'мощност'], {
    numbers: [300],
    claim: { unit: 'kw', values: [300], concepts: [['hx'], ['powerkw']], display: 'до 300 кВт' },
  }),
  fact('hx_max_press', 'object', 4, 'Максимальное давление теплообменника', '1 МПа.', ['теплообмен+давлен'], {
    numbers: [1],
    claim: { unit: 'mpa', values: [1], concepts: [['hx'], ['press'], ['limit']], display: '1 МПа' },
  }),
  fact('hx_max_temp', 'object', 4, 'Максимальная температура теплообменника', '110 °C.', ['теплообмен+температ'], {
    numbers: [110],
    claim: { unit: 'c', values: [110], concepts: [['hx'], ['temp'], ['limit']], display: '110 °C' },
  }),
  fact('hx_dn_water', 'object', 4, 'Присоединение по воде', 'DN32.', ['dn', 'вод'], { numbers: [32], claim: { unit: 'dn', values: [32], concepts: [['hx', 'dn']], display: 'DN32' } }),
  fact('hx_dn_heat', 'object', 4, 'Присоединение по теплоносителю', 'DN40.', ['dn', 'теплоносит'], {
    numbers: [40], level: 'followup', prerequisites: ['hx_dn_water'], askLabel: 'присоединение по воде',
    claim: { unit: 'dn', values: [40], concepts: [['hc'], ['dn']], display: 'DN40' },
  }),
  fact('hc_supply_temp', 'object', 4, 'Температура подачи теплоносителя', 'Около 95 ± 5 °C.', ['теплоносит', 'подач'], {
    numbers: [95], confidence: 'approximate',
    claim: { unit: 'c', values: [90, 100], range: true, concepts: [['hc'], ['temp']], display: 'около 95 ± 5 °C' },
  }),
  fact('hc_return_temp', 'object', 4, 'Температура обратки теплоносителя', 'Около 70 °C.', ['обратк', 'обратн'], {
    numbers: [70], confidence: 'approximate',
    claim: { unit: 'c', values: [70], concepts: [['return'], ['temp']], display: 'около 70 °C' },
  }),
  fact('hc_pressure', 'object', 4, 'Рабочее давление теплоносителя', 'Около 0,6 МПа.', ['теплоносит+давлен'], {
    numbers: [0.6], confidence: 'approximate',
    claim: { unit: 'mpa', values: [0.6], concepts: [['hc'], ['press'], ['target']], display: 'около 0,6 МПа' },
  }),
  fact('hc_max_press', 'object', 4, 'Максимальное давление теплоносителя', '0,8 МПа.', ['теплоносит+давлен', 'теплоносит+максим'], {
    numbers: [0.8],
    claim: { unit: 'mpa', values: [0.8], concepts: [['hc'], ['press'], ['limit']], display: '0,8 МПа' },
  }),

  // Контролируемые параметры
  fact('flow_range', 'monitored', 5, 'Рабочий расход', '1,5–4 м³/ч.', ['расход'], {
    numbers: [1.5, 4],
    claim: { unit: 'm3h', values: [1.5, 4], range: true, concepts: [['flow'], ['target']], display: '1,5–4 м³/ч' },
  }),
  fact('flow_max', 'monitored', 5, 'Максимальный текущий расход', 'Около 4 м³/ч.', ['расход+максим', 'максимальн+расход', 'расход+не более'], {
    numbers: [4], confidence: 'approximate',
    claim: { unit: 'm3h', values: [4], concepts: [['flow'], ['limit']], display: 'около 4 м³/ч' },
  }),
  fact('flow_display', 'monitored', 5, 'Отображение расхода', 'Расход должен отображаться оператору.', ['расход+отображ', 'расход+оператор', 'отображ+расход', 'индикац+расход']),
  fact('press_in_normal', 'monitored', 5, 'Давление до насоса в норме', 'Обычно 0,15–0,25 МПа.', ['до насос', 'вход+насос', 'всас', 'перед насос'], {
    numbers: [0.15, 0.25], confidence: 'approximate',
    claim: { unit: 'mpa', values: [0.15, 0.25], range: true, concepts: [['press'], ['beforePump', 'beforeAny'], ['target']], display: '0,15–0,25 МПа' },
  }),

  // Регулируемые параметры
  fact('temp_setpoint', 'regulated', 6, 'Рабочая температура после теплообменника', '60 °C.', ['температ', 'нагрев'], {
    numbers: [60], askLabel: 'рабочую температуру',
    claim: { unit: 'c', values: [60], concepts: [TEMP, ['target', 'afterHx']], looseConcepts: [TEMP], display: '60 °C' },
  }),
  fact('temp_tolerance', 'regulated', 6, 'Допустимое отклонение температуры', '±2 °C.', ['плюсминус', 'отклон', 'точност', 'допуск'], {
    level: 'followup', prerequisites: ['temp_setpoint'], numbers: [2],
    claim: { unit: 'c', values: [2], concepts: [['temp'], ['tolerance']], display: '±2 °C' },
  }),
  fact('press_out_setpoint', 'regulated', 6, 'Требуемое давление после насоса', '0,30 МПа.', ['после насос', 'выход+насос', 'нагнетан', 'давлен+насос'], {
    numbers: [0.3], askLabel: 'требуемое давление после насоса',
    claim: { unit: 'mpa', values: [0.3], concepts: [['press'], ['afterPump', 'afterAny'], ['target']], display: '0,30 МПа' },
  }),
  fact('press_out_range', 'regulated', 6, 'Нормальный диапазон давления после насоса', '0,27–0,33 МПа.', ['давлен', 'диапазон', 'насос'], {
    level: 'followup', prerequisites: ['press_out_setpoint'], numbers: [0.27, 0.33],
    claim: { unit: 'mpa', values: [0.27, 0.33], range: true, concepts: [['press'], ['afterPump', 'afterAny'], ['tolerance']], display: '0,27–0,33 МПа' },
  }),
  fact('vfd_range', 'regulated', 6, 'Диапазон частоты преобразователя', '20–50 Гц.', ['частот'], {
    level: 'followup', prerequisites: ['pump_vfd'], numbers: [20, 50],
    claim: { unit: 'hz', values: [20, 50], range: true, concepts: [['vfd']], display: '20–50 Гц' },
  }),
  fact('valve_smooth', 'regulated', 6, 'Характер регулирования клапаном', 'Регулирование теплоносителя должно быть плавным.', ['плавн'], { level: 'general' }),

  // Режимы работы
  fact('mode_auto', 'modes', 7, 'Автоматический режим', 'Нужен автоматический режим.', ['автоматическ+режим', 'режим+автоматическ'], { level: 'general' }),
  fact('mode_manual', 'modes', 7, 'Ручной режим', 'Нужен ручной режим.', ['ручн+режим', 'режим+ручн'], { level: 'general' }),
  fact('mode_service', 'modes', 7, 'Режим обслуживания', 'Нужен режим обслуживания.', ['обслуживан+режим', 'режим+обслуживан', 'сервисн+режим'], { level: 'general' }),
  fact('mode_protections', 'modes', 7, 'Защиты во всех режимах', 'Аварийные защиты действуют во всех режимах.', ['защит+всех', 'защит+любом', 'защит+независимо']),
  fact('mode_service_check', 'modes', 7, 'Проверка механизмов', 'В режиме обслуживания можно отдельно проверять механизмы.', ['обслуживан+механизм', 'отдельн+механизм', 'механизм+проверк', 'механизм+провер']),
  fact('mode_service_limit', 'modes', 7, 'Ограничение режима обслуживания', 'Режим обслуживания не должен запускать весь технологический процесс.', ['обслуживан+процесс', 'не+запуск+процесс', 'не+запуск+весь']),

  // Предупредительная сигнализация
  fact('temp_warning', 'warning', 8, 'Предупреждение по температуре', '70 °C.', ['предупр', 'предупредит'], {
    numbers: [70],
    claim: { unit: 'c', values: [70], concepts: [TEMP, ['warning']], display: '70 °C' },
  }),
  fact('press_out_warning', 'warning', 8, 'Предупреждение по давлению после насоса', '0,40 МПа.', ['предупр', 'предупредит'], {
    numbers: [0.4],
    claim: { unit: 'mpa', values: [0.4], concepts: [['press'], ['warning']], display: '0,40 МПа' },
  }),

  // Аварийные защиты
  fact('temp_alarm', 'protection', 8, 'Аварийная температура', '75 °C.', ['авари', 'отключ', 'прекращ', 'останов', 'защит'], {
    numbers: [75],
    claim: { unit: 'c', values: [75], concepts: [TEMP, ['alarm']], display: '75 °C' },
  }),
  fact('temp_alarm_action', 'protection', 8, 'Реакция на аварию по температуре', 'При аварии по температуре нагрев прекращается.', ['нагрев+прекращ', 'прекращ+нагрев', 'клапан+закр+температ', 'отключ+нагрев', 'останов+нагрев'], { isReaction: true }),
  fact('flow_low', 'protection', 8, 'Порог отсутствия циркуляции', 'Расход ниже 0,8 м³/ч.', ['расход', 'циркуляц'], {
    numbers: [0.8], askLabel: 'порог по расходу',
    claim: { unit: 'm3h', values: [0.8], concepts: [['flow'], ['low']], display: '0,8 м³/ч' },
  }),
  fact('flow_low_delay', 'protection', 8, 'Выдержка времени по расходу', 'Более 5 секунд.', ['секунд', 'сек', 'выдержк', 'расход'], {
    level: 'followup', prerequisites: ['flow_low'], numbers: [5],
    claim: { unit: 's', values: [5], concepts: [['flow', 'delay']], display: '5 секунд' },
  }),
  fact('flow_low_action', 'protection', 8, 'Реакция на отсутствие циркуляции', 'При отсутствии циркуляции нагрев запрещается.', ['циркуляц+нагрев', 'нагрев+запрещ', 'запрещ+нагрев', 'расход+нагрев+запрещ'], { isReaction: true }),
  fact('press_out_alarm', 'protection', 8, 'Аварийное давление после насоса', '0,45 МПа.', ['авари', 'останов', 'отключ', 'защит'], {
    numbers: [0.45],
    claim: { unit: 'mpa', values: [0.45], concepts: [['press'], ['alarm']], display: '0,45 МПа' },
  }),
  fact('press_out_action', 'protection', 8, 'Реакция на аварийное давление', 'При 0,45 МПа насос останавливается.', ['насос+останов', 'останов+насос', 'отключ+насос'], { isReaction: true, numbers: [0.45] }),
  fact('press_in_start', 'protection', 8, 'Запрет пуска по давлению до насоса', 'Ниже 0,08 МПа запуск насоса запрещён.', ['запуск+запрещ', 'запрет+пуск', 'запрет+запуск', 'пуск+запрещ'], {
    numbers: [0.08], isReaction: true,
    claim: { unit: 'mpa', values: [0.08], concepts: [['press'], ['beforePump', 'beforeAny'], ['low', 'start', 'alarm']], display: '0,08 МПа' },
  }),
  fact('press_in_run', 'protection', 8, 'Останов работающего насоса по входному давлению', 'Если у работающего насоса давление на входе ниже 0,08 МПа, он останавливается.', ['работающ+насос+останов', 'насос+останов+вход', 'вход+останов', 'останавлива+вход'], { numbers: [0.08], isReaction: true }),
  fact('estop_pump', 'protection', 12, 'Аварийный останов: насос', 'При аварийном останове насос останавливается.', ['аварийн+останов+насос', 'авари+насос+останов'], { isReaction: true }),
  fact('estop_valve', 'protection', 12, 'Аварийный останов: клапан', 'При аварийном останове клапан теплоносителя закрывается.', ['авари+клапан+закр', 'останов+клапан+закр', 'клапан+закр+теплоносит'], { isReaction: true }),
  fact('estop_heat', 'protection', 12, 'Аварийный останов: нагрев', 'При аварийном останове нагрев прекращается.', ['останов+нагрев+прекращ', 'авари+нагрев+прекращ', 'авари+прекращ+нагрев'], { isReaction: true }),
  fact('estop_cause', 'protection', 12, 'Аварийный останов: причина', 'Причина останова показывается оператору.', ['причин+оператор', 'причин+отображ', 'отображ+причин', 'причин+показ'], { isReaction: true }),
  fact('restart_forbidden', 'protection', 12, 'Запрет автоматического перезапуска', 'После серьёзной аварии автоматический повторный запуск запрещён.', ['повторн+запуск+запрещ', 'автоматическ+запуск+запрещ', 'автоматическ+перезапуск', 'запрет+повторн', 'запрещ+повторн', 'самозапуск'], { isReaction: true }),
  fact('restart_procedure', 'protection', 12, 'Порядок повторного запуска', 'Оператор видит причину, устраняет её и подтверждает сброс.', ['причин+устран', 'подтвержд+сброс', 'квитир', 'сброс+оператор', 'оператор+сброс'], { isReaction: true }),
  fact('sensor_temp_loss', 'protection', 12, 'Потеря сигнала датчика температуры', 'Закрыть клапан и выдать аварию.', ['датчик+температ+клапан', 'сигнал+температ+клапан', 'датчик+температ+авари'], { isReaction: true }),
  fact('sensor_press_loss', 'protection', 12, 'Потеря сигнала датчика давления после насоса', 'Остановить насос.', ['датчик+давлен+насос', 'сигнал+давлен+насос'], { isReaction: true }),
  fact('sensor_flow_loss', 'protection', 12, 'Потеря сигнала расходомера', 'Запретить нагрев.', ['расходомер+нагрев', 'сигнал+расход+нагрев', 'датчик+расход+нагрев'], { isReaction: true }),

  // Исполнительные устройства
  fact('pump_type', 'actuators', 9, 'Тип насоса', 'Центробежный.', ['центробежн'], { level: 'general' }),
  fact('pump_power', 'actuators', 9, 'Мощность двигателя насоса', '2,2 кВт.', ['двигат', 'насос', 'мощност'], {
    numbers: [2.2],
    claim: { unit: 'kw', values: [2.2], concepts: [['pump', 'motor'], ['powerkw']], display: '2,2 кВт' },
  }),
  fact('pump_supply', 'actuators', 9, 'Питание двигателя насоса', '400 В, 50 Гц.', ['двигат', 'насос', 'питан'], {
    numbers: [400],
    claim: { unit: 'v', values: [400], concepts: [['pump', 'motor']], display: '400 В' },
  }),
  fact('pump_nominal', 'actuators', 9, 'Номинальная подача насоса', 'Около 5 м³/ч.', ['подач', 'производительн', 'номинальн'], {
    numbers: [5], confidence: 'approximate',
    claim: { unit: 'm3h', values: [5], concepts: [['pump'], ['nominal']], display: 'около 5 м³/ч' },
  }),
  fact('pump_head', 'actuators', 9, 'Напор насоса', 'Около 32 м.', ['напор'], {
    numbers: [32], confidence: 'approximate',
    claim: { unit: 'm', values: [32], concepts: [['head']], display: 'около 32 м' },
  }),
  fact('pump_vfd', 'actuators', 9, 'Управление насосом', 'Через преобразователь частоты.', ['преобразоват', 'частотн', 'чрп', 'пч'], { askLabel: 'способ управления насосом' }),
  fact('valve_power_loss', 'actuators', 9, 'Клапан при потере питания', 'При потере питания клапан закрывается.', ['клапан+питан+закр', 'питан+клапан+закр', 'нормальн+закрыт'], { isReaction: true }),
  fact('valve_air_loss', 'actuators', 9, 'Клапан при потере воздуха', 'При потере сжатого воздуха клапан закрывается.', ['клапан+воздух+закр', 'воздух+клапан+закр'], { isReaction: true }),
  fact('air_pressure', 'actuators', 9, 'Сжатый воздух КИП', '0,4–0,6 МПа.', ['воздух', 'кип', 'пневм'], {
    numbers: [0.4, 0.6],
    claim: { unit: 'mpa', values: [0.4, 0.6], range: true, concepts: [['press'], ['air']], display: '0,4–0,6 МПа' },
  }),
  fact('valve_dp', 'actuators', 9, 'Перепад давления на клапане', 'Около 0,08 МПа (расчётный).', ['перепад'], {
    numbers: [0.08], confidence: 'approximate',
    claim: { unit: 'mpa', values: [0.08], concepts: [['drop']], display: 'около 0,08 МПа' },
  }),

  // Операторский интерфейс
  fact('hmi_temp', 'hmi', 10, 'На экране: температура', 'Температура после теплообменника.', ['экран+температ', 'отображ+температ', 'оператор+температ', 'индикац+температ', 'показ+температ'], { level: 'specific' }),
  fact('hmi_press_in', 'hmi', 10, 'На экране: давление до насоса', 'Давление до насоса.', ['отображ+давлен+до', 'экран+давлен+до', 'давлен+до насос+экран', 'давлен+до+отображ']),
  fact('hmi_press_out', 'hmi', 10, 'На экране: давление после насоса', 'Давление после насоса.', ['отображ+давлен+после', 'экран+давлен+после', 'давлен+после+отображ']),
  fact('hmi_flow', 'hmi', 10, 'На экране: расход', 'Расход.', ['отображ+расход', 'экран+расход', 'расход+отображ', 'оператор+расход']),
  fact('hmi_pump_state', 'hmi', 10, 'На экране: состояние насоса', 'Состояние насоса.', ['состоян+насос']),
  fact('hmi_pump_alarm', 'hmi', 10, 'На экране: авария насоса', 'Авария насоса.', ['отображ+авари+насос', 'экран+авари+насос', 'авари+насос+отображ', 'авари+насос+экран']),
  fact('hmi_valve', 'hmi', 10, 'На экране: положение клапана', 'Положение клапана.', ['положен+клапан']),
  fact('hmi_mode', 'hmi', 10, 'На экране: режим работы', 'Режим работы.', ['отображ+режим', 'экран+режим', 'режим+отображ', 'текущ+режим']),
  fact('hmi_setpoints', 'hmi', 10, 'Изменение уставок', 'Оператор может менять уставки температуры и давления в безопасных пределах.', ['уставк+оператор', 'оператор+уставк', 'изменен+уставк']),
  fact('hmi_messages', 'hmi', 10, 'Текстовые сообщения', 'Нужны понятные текстовые сообщения.', ['текстов+сообщен', 'сообщен+оператор', 'понятн+сообщен']),
  fact('hmi_log', 'hmi', 10, 'Журнал аварий', 'Нужен журнал аварий.', ['журнал']),
  fact('hmi_log_time', 'hmi', 10, 'Дата и время аварии', 'В журнале фиксируются дата и время аварии.', ['дат+врем', 'врем+авари', 'метк+времен'], { level: 'followup', prerequisites: ['hmi_log'], askLabel: 'журнал аварий' }),
  fact('hmi_trend_temp', 'hmi', 10, 'Тренд температуры', 'Нужен тренд температуры.', ['тренд+температ', 'график+температ']),
  fact('hmi_trend_press', 'hmi', 10, 'Тренд давления', 'Нужен тренд давления.', ['тренд+давлен', 'график+давлен']),

  // Электропитание
  fact('power_available', 'power', 11, 'Доступное питание', '400/230 В, 50 Гц.', ['питан', 'напряжен', 'сет'], {
    numbers: [400, 230],
    claim: { unit: 'v', values: [400, 230], concepts: [['power']], display: '400/230 В, 50 Гц' },
  }),
  fact('power_control', 'power', 11, 'Цепи автоматики', '24 В постоянного тока.', ['автоматик', 'цеп', 'постоянн', 'управлен'], {
    numbers: [24],
    claim: { unit: 'v', values: [24], concepts: [['automation']], display: '24 В DC' },
  }),

  // Условия эксплуатации
  fact('env_location', 'environment', 11, 'Место установки', 'Внутри цеха.', ['цех', 'помещен']),
  fact('env_temp', 'environment', 11, 'Температура воздуха', 'От +5 до +40 °C.', ['воздух', 'окружающ', 'эксплуатац'], {
    numbers: [5, 40],
    claim: { unit: 'c', values: [5, 40], range: true, concepts: [['temp'], ['air', 'room', 'ambient']], display: 'от +5 до +40 °C' },
  }),
  fact('env_ex', 'environment', 11, 'Взрывоопасность', 'Взрывоопасной зоны нет.', ['взрыв']),
  fact('env_ip', 'environment', 11, 'Степень защиты приборов', 'Полевые приборы не ниже IP65.', ['ip', 'степен+защит'], {
    numbers: [65],
    claim: { unit: 'ip', values: [65], concepts: [['ip']], display: 'IP65' },
  }),
  fact('env_distance', 'environment', 11, 'Расстояние до шкафа', 'До 30 м.', ['шкаф', 'рассто', 'кабел', 'длин'], {
    numbers: [30],
    claim: { unit: 'm', values: [30], concepts: [['distance']], display: 'до 30 м' },
  }),
  fact('env_cabinet', 'environment', 11, 'Место шкафа', 'Шкаф можно установить около существующего электрощита.', ['шкаф+щит', 'шкаф+электрощит'], { type: 'preference' }),

  // Надёжность и безопасность
  fact('eq_industrial', 'reliability', 12, 'Класс оборудования', 'Оборудование должно быть промышленным.', ['промышленн']),
  fact('eq_service', 'reliability', 12, 'Доступность оборудования', 'Оборудование должно быть доступно для приобретения и обслуживания.', ['приобретен', 'обслуживан+оборудован', 'доступн+оборудован', 'оборудован+доступн'], { type: 'preference' }),
  fact('eq_plc', 'reliability', 11, 'Контроллер', 'Промышленный ПЛК.', ['плк', 'контроллер']),
  fact('eq_reserve', 'reliability', 11, 'Резерв входов и выходов', 'Небольшой резерв входов и выходов.', ['резерв'], { type: 'preference' }),
  fact('eq_models_later', 'reliability', 12, 'Выбор моделей', 'Конкретные модели выбираются после согласования ТЗ.', ['модел+соглас', 'соглас+модел', 'модел+после', 'марк+после', 'марк+соглас']),

  // Сведения, которых заказчик не знает
  unknown('unk_plc_model', 'reliability', 11, 'Модель ПЛК', 'Заказчик не знает; вариант предлагает проектировщик.', ['контроллер', 'плк']),
  unknown('unk_sensor_vendor', 'monitored', 5, 'Производитель датчиков', 'Заказчик не знает; выбирает проектировщик.', ['датчик']),
  unknown('unk_vfd_model', 'actuators', 9, 'Модель преобразователя частоты', 'Заказчик не знает; выбирает проектировщик.', ['преобразоват', 'частотн']),
  unknown('unk_valve_type', 'actuators', 9, 'Тип регулирующего клапана', 'Заказчик не знает; важно плавное регулирование и закрытие при потере питания.', ['клапан']),
  unknown('unk_reserve_count', 'reliability', 11, 'Количество резервных каналов', 'Заказчик не определял; предлагает проектировщик.', ['резерв']),
  unknown('unk_setpoint_range', 'hmi', 10, 'Диапазон изменения уставок', 'Заказчик не определял; проектировщик предлагает безопасный диапазон.', ['уставк+диапазон', 'уставк+предел']),
  unknown('unk_archive_period', 'hmi', 10, 'Период архивирования', 'Заказчик не определял; предлагает проектировщик.', ['архив', 'период']),
  unknown('unk_trend_retention', 'hmi', 10, 'Время хранения трендов', 'Заказчик не определял; предлагает проектировщик.', ['хранен']),
  unknown('unk_reliability_cat', 'reliability', 12, 'Категория надёжности', 'Заказчик точно не знает; уточняется при проектировании.', ['категор']),
  unknown('unk_cabinet_layout', 'power', 11, 'Компоновка шкафа', 'Заказчик не знает; решает проектировщик.', ['компоновк', 'шкаф']),
  unknown('unk_cable_brand', 'power', 11, 'Марки кабелей', 'Заказчик не знает; выбираются при проектировании.', ['кабел']),
  unknown('unk_wiring', 'power', 11, 'Схема подключения', 'Заказчик не знает; разрабатывает проектировщик.', ['схем']),
  unknown('unk_doc_list', 'docs', 13, 'Перечень проектной документации', 'Окончательного перечня у заказчика нет; исполнитель предлагает и согласует.', ['документац', 'документ', 'перечень', 'инструкц', 'схем']),
];
