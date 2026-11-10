/**
 * Готовые темы: палитры, радиус, токены поверхностей. Основа — общий слой интерфейса администрации (@admsr/ui).
 * Тема «По умолчанию» — emerald + slate, как в утверждённом тёмном референсе.
 */

export type TzShades = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>

/** Какие оттенки палитры брать для служебных переменных: { light: 50, dark: 950 } */
export type TzTokenShades = Record<string, { light?: number; dark?: number }>

export interface TzThemePreset {
  id: string
  name: string
  icon: string
  description: string
  colors: { primary: string; neutral: string; secondary?: string; success?: string; info?: string; warning?: string }
  /** Своих палитр нет у Tailwind: задаются оттенками oklch */
  palettes?: Record<string, TzShades>
  /** Радиус скругления, rem */
  radius: number
  /** Основной цвет — чёрный (в тёмной теме белый) */
  blackAsPrimary?: boolean
  tokens?: { light?: Record<string, string>; dark?: Record<string, string> }
  tokenShades?: TzTokenShades
}

/** Общий набор для светлых тем с мягкими поверхностями */
const softShades = (): TzTokenShades => ({
  '--ui-bg': { light: 50 },
  '--ui-bg-muted': { light: 100 },
  '--ui-text-inverted': { light: 50 },
  '--ui-text-highlighted': { dark: 50 },
  '--ui-bg-inverted': { dark: 50 },
  '--ui-border-inverted': { dark: 50 },
})

const v = (n: number, c: string) => [n, c] as const
const shades = (...pairs: (readonly [number, string])[]) => Object.fromEntries(pairs) as TzShades

export const THEME_PRESETS: TzThemePreset[] = [
  {
    id: 'default',
    name: 'По умолчанию',
    icon: 'i-lucide-palette',
    description: 'Бирюзово-зелёный на сине-сером, как в референсе.',
    colors: { primary: 'emerald', neutral: 'slate' },
    radius: 0.25,
  },
  {
    id: 'mono',
    name: 'Моно',
    icon: 'i-lucide-contrast',
    description: 'Чёрный на чисто сером, крупное скругление, спокойные поверхности.',
    colors: { primary: 'neutral', neutral: 'neutral' },
    blackAsPrimary: true,
    radius: 0.5,
    // Тёмный режим светлее, чем на ui.nuxt.com: там фон 950 почти чёрный, здесь на ступень выше
    tokenShades: {
      '--ui-bg': { dark: 900 },
      '--ui-bg-muted': { light: 100, dark: 800 },
      '--ui-bg-elevated': { light: 100, dark: 800 },
      '--ui-bg-accented': { light: 200, dark: 700 },
      '--ui-text': { light: 900, dark: 100 },
      '--ui-text-highlighted': { light: 950, dark: 50 },
    },
  },
  {
    id: 'cobalt',
    name: 'Кобальт',
    icon: 'i-lucide-gem',
    description: 'Синий на холодных серых, острые углы, плоские поверхности с рамками.',
    colors: { primary: 'cobalt', secondary: 'cobalt-gray', neutral: 'cobalt-gray', info: 'cyan', warning: 'amber' },
    palettes: {
      cobalt: shades(
        v(50, 'oklch(95.3% 0.022 260.723)'), v(100, 'oklch(90.8% 0.045 258.763)'), v(200, 'oklch(81.6% 0.091 257.776)'),
        v(300, 'oklch(72.9% 0.14 258.068)'), v(400, 'oklch(64.7% 0.186 258.256)'), v(500, 'oklch(57.8% 0.228 260.025)'),
        v(600, 'oklch(49.2% 0.19 259.799)'), v(700, 'oklch(40.2% 0.152 259.656)'), v(800, 'oklch(30.7% 0.109 258.934)'),
        v(900, 'oklch(20.4% 0.063 257.52)'), v(950, 'oklch(14.7% 0.037 249.929)'),
      ),
      'cobalt-gray': shades(
        v(50, 'oklch(99.1% 0 0)'), v(100, 'oklch(98.2% 0.002 247.839)'), v(200, 'oklch(94.2% 0.005 247.879)'),
        v(300, 'oklch(91.1% 0.007 247.901)'), v(400, 'oklch(86.7% 0.011 247.949)'), v(500, 'oklch(76.9% 0.015 248.017)'),
        v(600, 'oklch(55.8% 0.016 244.893)'), v(700, 'oklch(42.8% 0.015 248.172)'), v(800, 'oklch(34.5% 0.013 248.212)'),
        v(900, 'oklch(26.2% 0.009 248.19)'), v(950, 'oklch(20.7% 0.008 248.192)'),
      ),
    },
    radius: 0.125,
    tokens: {
      light: {
        '--ui-secondary': 'var(--ui-color-secondary-600)',
        '--ui-bg-muted': 'var(--ui-color-neutral-200)',
        '--ui-text': 'var(--ui-color-neutral-800)',
        '--ui-border': 'var(--ui-color-neutral-400)',
        '--ui-border-muted': 'var(--ui-color-neutral-300)',
        '--ui-bg': 'var(--ui-color-neutral-100)',
        '--ui-text-toned': 'var(--ui-color-neutral-700)',
        '--ui-text-muted': 'var(--ui-color-neutral-600)',
        '--ui-text-dimmed': 'var(--ui-color-neutral-600)',
        '--ui-bg-elevated': 'var(--ui-color-neutral-200)',
        '--ui-bg-accented': 'var(--ui-color-neutral-300)',
      },
      dark: {
        '--ui-primary': 'var(--ui-color-primary-500)',
        '--ui-secondary': 'var(--ui-color-secondary-500)',
        '--ui-success': 'var(--ui-color-success-500)',
        '--ui-info': 'var(--ui-color-info-500)',
        '--ui-warning': 'var(--ui-color-warning-500)',
        '--ui-error': 'var(--ui-color-error-500)',
        '--ui-bg-muted': 'var(--ui-color-neutral-700)',
        '--ui-text': 'var(--ui-color-neutral-300)',
      },
    },
  },
  {
    id: 'sky',
    name: 'Небо',
    icon: 'i-lucide-cloud-sun',
    description: 'Небесно-голубой на дымчатом нейтральном, пастельные заливки.',
    colors: { primary: 'sky', neutral: 'mist' },
    radius: 0.75,
    tokenShades: softShades(),
  },
  {
    id: 'mint',
    name: 'Мята',
    icon: 'i-lucide-leaf',
    description: 'Бирюзовый на оливковом нейтральном, мягкие поверхности.',
    colors: { primary: 'teal', neutral: 'olive' },
    radius: 0.75,
    tokenShades: softShades(),
  },
  {
    id: 'iris',
    name: 'Ирис',
    icon: 'i-lucide-flower',
    description: 'Фиолетовые контуры на мальвовом нейтральном, вторичный цвет фуксия.',
    colors: { primary: 'violet', secondary: 'fuchsia', neutral: 'mauve' },
    radius: 0.5,
    tokenShades: softShades(),
  },
  {
    id: 'crimson',
    name: 'Багрянец',
    icon: 'i-lucide-clapperboard',
    description: 'Красный на чисто сером, квадратные углы, почти чёрный в тёмной теме.',
    colors: { primary: 'red', neutral: 'neutral' },
    radius: 0,
    tokenShades: {
      ...softShades(),
      '--ui-primary': { light: 600, dark: 500 },
      '--ui-bg': { light: 50, dark: 950 },
      '--ui-bg-muted': { light: 100, dark: 900 },
      '--ui-bg-elevated': { dark: 900 },
      '--ui-bg-accented': { dark: 800 },
    },
  },
  {
    id: 'coral',
    name: 'Коралл',
    icon: 'i-lucide-shell',
    description: 'Розовый на тёплом камне, бирюзовый для успеха.',
    colors: { primary: 'rose', success: 'teal', neutral: 'stone' },
    radius: 0.5,
    tokenShades: softShades(),
  },
  {
    id: 'sunset',
    name: 'Закат',
    icon: 'i-lucide-sunset',
    description: 'Оранжевый на тёплом серо-коричневом, жёлтый вторичный.',
    colors: { primary: 'orange', secondary: 'yellow', neutral: 'taupe' },
    radius: 0.625,
    tokenShades: { ...softShades(), '--ui-primary': { light: 600 } },
  },
  {
    id: 'carbon',
    name: 'Карбон',
    icon: 'i-lucide-zap',
    description: 'Янтарный на тёплом угольном нейтральном, тёмные рамки.',
    colors: { primary: 'amber', secondary: 'yellow', neutral: 'carbon' },
    palettes: {
      carbon: shades(
        v(50, 'oklch(98.5% 0.017 447.457)'), v(100, 'oklch(95.9% 0.036 438.639)'), v(200, 'oklch(92.6% 0.054 428.8)'),
        v(300, 'oklch(87% 0.053 417.734)'), v(400, 'oklch(70.5% 0.032 405.184)'), v(500, 'oklch(55.3% 0.014 390.836)'),
        v(600, 'oklch(44.7% 0.001 374.343)'), v(700, 'oklch(35.9% 0 0)'), v(800, 'oklch(28% 0 0)'),
        v(900, 'oklch(20.8% 0 0)'), v(950, 'oklch(14.1% 0.005 285.805)'),
      ),
    },
    radius: 0.5,
    tokenShades: {
      '--ui-bg': { light: 50, dark: 800 },
      '--ui-bg-muted': { light: 300, dark: 700 },
      '--ui-bg-elevated': { light: 300, dark: 700 },
      '--ui-bg-accented': { light: 400, dark: 600 },
      '--ui-bg-inverted': { light: 900, dark: 50 },
      '--ui-text-inverted': { light: 50 },
      '--ui-text-dimmed': { light: 500, dark: 400 },
      '--ui-text-muted': { light: 800, dark: 300 },
      '--ui-text-toned': { light: 900 },
      '--ui-text': { light: 900 },
      '--ui-text-highlighted': { light: 950, dark: 100 },
      '--ui-border': { light: 950, dark: 600 },
      '--ui-border-muted': { light: 400 },
      '--ui-border-accented': { light: 950, dark: 500 },
      '--ui-border-inverted': { light: 500, dark: 50 },
    },
  },
  {
    id: 'bubblegum',
    name: 'Жвачка',
    icon: 'i-lucide-candy',
    description: 'Пастельный розовый, серые с мальвовым оттенком.',
    colors: { primary: 'pink', secondary: 'violet', neutral: 'saturated-mauve' },
    palettes: {
      'saturated-mauve': shades(
        v(50, 'oklch(96.1% 0.021 325.68)'), v(100, 'oklch(92.4% 0.039 325.829)'), v(200, 'oklch(88% 0.057 325.83)'),
        v(300, 'oklch(81.2% 0.073 325.398)'), v(400, 'oklch(66.1% 0.084 323.292)'), v(500, 'oklch(52.4% 0.079 322.443)'),
        v(600, 'oklch(42.7% 0.064 322.128)'), v(700, 'oklch(34.6% 0.048 322.004)'), v(800, 'oklch(27.4% 0.034 321.983)'),
        v(900, 'oklch(20.7% 0.02 322.028)'), v(950, 'oklch(14.5% 0.008 322.12)'),
      ),
    },
    radius: 0.375,
    tokens: {
      light: {
        '--ui-bg': 'var(--ui-color-neutral-50)',
        '--ui-text-inverted': 'var(--ui-color-neutral-50)',
        '--ui-bg-muted': 'var(--ui-color-neutral-100)',
      },
      dark: {
        '--ui-bg-inverted': 'var(--ui-color-neutral-50)',
        '--ui-text-highlighted': 'var(--ui-color-neutral-50)',
        '--ui-border-inverted': 'var(--ui-color-neutral-50)',
      },
    },
  },
  {
    id: 'parchment',
    name: 'Пергамент',
    icon: 'i-lucide-scroll-text',
    description: 'Тёплый пергамент и глиняный основной цвет.',
    colors: { primary: 'clay', neutral: 'parchment' },
    palettes: {
      clay: shades(
        v(50, 'oklch(97.4% 0.009 48.308)'), v(100, 'oklch(94.2% 0.019 52.207)'), v(200, 'oklch(88.5% 0.036 51.142)'),
        v(300, 'oklch(82.1% 0.058 50.392)'), v(400, 'oklch(74.1% 0.094 47.255)'), v(500, 'oklch(67.2% 0.131 38.798)'),
        v(600, 'oklch(58.9% 0.138 37.63)'), v(700, 'oklch(51.4% 0.123 37.45)'), v(800, 'oklch(44.4% 0.103 36.916)'),
        v(900, 'oklch(38.8% 0.086 36.46)'), v(950, 'oklch(25.9% 0.054 38.197)'),
      ),
      parchment: shades(
        v(50, 'oklch(98% 0.006 100)'), v(100, 'oklch(96.5% 0.011 99)'), v(200, 'oklch(93.6% 0.014 97.348)'),
        v(300, 'oklch(85.8% 0.018 100)'), v(400, 'oklch(72.1% 0.015 102.54)'), v(500, 'oklch(57.8% 0.008 88.877)'),
        v(600, 'oklch(43.2% 0.006 91.526)'), v(700, 'oklch(38.2% 0.003 84.572)'), v(800, 'oklch(29.3% 0.003 106.588)'),
        v(900, 'oklch(21.7% 0.002 106.561)'), v(950, 'oklch(14.6% 0 0)'),
      ),
    },
    radius: 0.375,
    tokens: {
      light: {
        '--ui-bg': 'var(--ui-color-neutral-100)',
        '--ui-bg-muted': 'var(--ui-color-neutral-200)',
        '--ui-bg-elevated': 'var(--ui-color-neutral-200)',
        '--ui-bg-accented': 'var(--ui-color-neutral-300)',
        '--ui-border': 'var(--ui-color-neutral-300)',
        '--ui-border-muted': 'var(--ui-color-neutral-300)',
        '--ui-border-accented': 'var(--ui-color-neutral-400)',
      },
      dark: {
        '--ui-primary': 'var(--ui-color-primary-500)',
        '--ui-bg-accented': 'var(--ui-color-neutral-800)',
      },
    },
  },
]

/** Цвет темы для значка в меню: оттенок 500 основного цвета (у своих палитр — из палитры) */
export function themeAccent(p: TzThemePreset): string {
  if (p.blackAsPrimary) return '#a3a3a3'
  return p.palettes?.[p.colors.primary]?.[500] ?? `var(--color-${p.colors.primary}-500)`
}

/** Цвета Nuxt UI, которые тема не задаёт */
export const BASE_COLORS = { secondary: 'blue', success: 'green', info: 'blue', warning: 'yellow', error: 'red' }

const SEMANTIC = ['primary', 'secondary', 'success', 'info', 'warning', 'error']

/** CSS-переменные выбранной темы: палитры, радиус, токены поверхностей. Селекторы утяжелены, чтобы перекрыть стили Nuxt UI */
export function themeCss(preset: TzThemePreset): string {
  const light: Record<string, string> = {}
  const dark: Record<string, string> = {}

  for (const [mode, target] of [['light', light], ['dark', dark]] as const) {
    for (const [name, shade] of Object.entries(preset.tokenShades ?? {})) {
      const n = shade[mode]
      if (n === undefined) continue
      const m = name.match(/^--ui-(\w+)$/)?.[1]
      const sem = m && SEMANTIC.includes(m) ? m : 'neutral'
      target[name] = `var(--ui-color-${sem}-${n})`
    }
  }
  Object.assign(light, preset.tokens?.light)
  Object.assign(dark, preset.tokens?.dark)

  if (preset.blackAsPrimary) {
    light['--ui-primary'] = 'black'
    dark['--ui-primary'] = 'white'
  }

  const decl = (o: Record<string, string>) => Object.entries(o).map(([k, val]) => `${k}:${val}`).join(';')
  const palettes = Object.entries(preset.palettes ?? {})
    .map(([name, s]) => Object.entries(s).map(([n, c]) => `--color-${name}-${n}:${c}`).join(';'))
    .join(';')

  return [
    `:root:root{--ui-radius:${preset.radius}rem${palettes ? `;${palettes}` : ''}}`,
    Object.keys(light).length ? `:root:root:not(.dark){${decl(light)}}` : '',
    Object.keys(dark).length ? `:root:root.dark{${decl(dark)}}` : '',
  ].join('\n')
}
