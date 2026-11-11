<script setup lang="ts">
// Каркас стартовой страницы: шапка, блок с формой входа, описание тренажёра и кейса.
// Форма входа (или ввод имени без сервера) передаётся в слот «auth».
import { computed } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import { useSession } from '../../composables/useSession';
import { useTheme } from '../../composables/useTheme';
import { prefersReducedMotion } from '../../composables/useLayout';
import { themeAccent, type TzThemePreset } from '../../theme/themes';
import TzLogo from '../layout/TzLogo.vue';

const { scenario } = useSession();
const { isDark, toggleMode, presets, preset, selectPreset } = useTheme();

// Цветовая тема: тот же список готовых тем, что в меню профиля, значок красится цветом темы.
const chipStyle = (p: TzThemePreset) => ({ color: themeAccent(p), background: `color-mix(in oklab, ${themeAccent(p)} 20%, transparent)` });
const presetOf = (item: unknown) => presets.find((p) => p.id === (item as { presetId?: string }).presetId) ?? presets[0]!;
const keep = (event: Event) => event.preventDefault();
// Меню цветовой темы: только готовые темы. Светлая и тёмная переключаются отдельной кнопкой рядом.
const themeItems = computed<DropdownMenuItem[]>(() =>
  presets.map((p) => ({
    label: p.name,
    slot: 'preset',
    presetId: p.id,
    type: 'checkbox' as const,
    class: 'font-semibold',
    checked: preset.value.id === p.id,
    onUpdateChecked(checked: boolean) {
      if (checked) selectPreset(p.id);
    },
    onSelect: keep,
  })),
);

const NAV = [
  { id: 'how', label: 'Как это работает' },
  { id: 'preview', label: 'Как выглядит' },
  { id: 'case', label: 'Учебный кейс' },
];

// Три вида сведений, которые важно не путать в ТЗ.
const KINDS = [
  { icon: 'i-lucide-factory', title: 'Есть сейчас', text: 'что уже стоит на объекте и как он работает' },
  { icon: 'i-lucide-target', title: 'Требует заказчик', text: 'что должно быть после автоматизации' },
  { icon: 'i-lucide-pencil-ruler', title: 'Предлагаете вы', text: 'то, что заказчик оставил на решение исполнителя' },
];

const STEPS = [
  { icon: 'i-lucide-messages-square', title: 'Расспросите заказчика', text: 'Задавайте вопросы по одному: про процесс, оборудование, режимы и аварии. Заказчик отвечает только на то, о чём спросили.' },
  { icon: 'i-lucide-clipboard-list', title: 'Зафиксируйте требования', text: 'Реестр требований — ваши подтверждённые сведения. Потом вы перенесёте их в ТЗ. То, что нужно уточнить, отмечайте отдельно.' },
  { icon: 'i-lucide-file-text', title: 'Составьте ТЗ', text: 'Заполните 13 разделов своими словами, опираясь на реестр. Раздел можно собрать из записей одной кнопкой.' },
  { icon: 'i-lucide-badge-check', title: 'Получите оценку', text: 'Система покажет, что вы выяснили, что упустили и где в ТЗ есть противоречия, и выставит балл.' },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function toAuth() {
  scrollTo('auth');
  window.setTimeout(() => document.querySelector<HTMLElement>('#auth input')?.focus({ preventScroll: true }), 450);
}
</script>

<template>
  <div class="min-h-dvh bg-default text-default">
    <header class="sticky top-0 z-20 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="#" class="flex items-center gap-2.5 rounded-md focus-visible:outline-2" aria-label="ТЗ Практикум" @click.prevent="scrollTo('top')">
          <TzLogo class="size-8 text-primary" />
          <span class="text-lg font-bold tracking-tight">ТЗ Практикум</span>
        </a>
        <nav class="ms-6 hidden items-center gap-1 md:flex" aria-label="Разделы страницы">
          <UButton v-for="item in NAV" :key="item.id" color="neutral" variant="ghost" :label="item.label" @click="scrollTo(item.id)" />
        </nav>
        <div class="ms-auto flex items-center gap-2">
          <UDropdownMenu :items="themeItems" :content="{ align: 'end' }" :ui="{ content: 'w-48 z-50' }">
            <UTooltip :text="`Цветовая тема: ${preset.name}`" :ui="{ content: 'z-50' }">
              <UButton color="neutral" variant="ghost" square aria-label="Выбрать цветовую тему" class="data-[state=open]:bg-elevated" data-testid="landing-theme">
                <UIcon :name="preset.icon" class="size-5 shrink-0" :style="{ color: themeAccent(preset) }" />
              </UButton>
            </UTooltip>
            <template #preset-leading="{ item }">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full" :style="chipStyle(presetOf(item))">
                <UIcon :name="presetOf(item).icon" class="size-2.5" />
              </span>
            </template>
          </UDropdownMenu>
          <UTooltip :text="isDark ? 'Светлая тема' : 'Тёмная тема'" :ui="{ content: 'z-50' }">
            <UButton color="neutral" variant="ghost" square :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" :aria-label="isDark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="toggleMode" />
          </UTooltip>
          <UButton color="primary" variant="soft" icon="i-lucide-log-in" label="Войти" class="lg:hidden" @click="toAuth" />
        </div>
      </div>
    </header>

    <main id="top">
      <!-- Первый экран: суть тренажёра и форма входа -->
      <section class="mx-auto grid w-full max-w-6xl gap-10 px-4 py-8 sm:px-6 sm:py-14 lg:grid-cols-[1fr_26rem] lg:items-center lg:gap-14 lg:py-20">
        <div class="space-y-6">
          <UBadge class="max-w-full" color="primary" variant="subtle" icon="i-lucide-graduation-cap" label="Учебный тренажёр для инженеров по автоматизации" />
          <h1 class="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
            Научитесь составлять <span class="text-primary">техническое задание</span>, расспрашивая заказчика
          </h1>
          <p class="max-w-xl text-base text-toned sm:text-lg">
            Вы инженер, а заказчик знает об объекте всё, но отвечает только на заданный вопрос. Выясните детали, отделите требования от пожеланий и
            напишите ТЗ.
          </p>
          <ul class="hidden space-y-2.5 sm:block">
            <li v-for="point in ['Виртуальный заказчик ведёт живой диалог на русском', 'Реестр требований и редактор ТЗ из 13 разделов', 'Оценка с разбором: что выяснено, что упущено']" :key="point" class="flex items-start gap-2.5">
              <UIcon name="i-lucide-circle-check" class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{{ point }}</span>
            </li>
          </ul>
          <dl class="hidden max-w-lg grid-cols-3 gap-3 pt-2 sm:grid">
            <div class="rounded-lg border border-default bg-elevated/40 p-3"><dt class="text-xs text-muted">Направлений</dt><dd class="text-2xl font-semibold tabular-nums">{{ scenario.categories.length }}</dd></div>
            <div class="rounded-lg border border-default bg-elevated/40 p-3"><dt class="text-xs text-muted">Разделов ТЗ</dt><dd class="text-2xl font-semibold tabular-nums">{{ scenario.tzSections.length }}</dd></div>
            <div class="rounded-lg border border-default bg-elevated/40 p-3"><dt class="text-xs text-muted">Занятие, мин</dt><dd class="text-2xl font-semibold tabular-nums">≈{{ scenario.estimatedMinutes }}</dd></div>
          </dl>
        </div>

        <div id="auth" class="scroll-mt-24">
          <slot name="auth" />
        </div>
      </section>

      <!-- Как это работает -->
      <section id="how" class="scroll-mt-16 border-y border-default bg-elevated/30">
        <div class="mx-auto w-full max-w-6xl space-y-8 px-4 py-14 sm:px-6">
          <div class="max-w-2xl space-y-2">
            <h2 class="text-3xl font-bold tracking-tight">Как проходит занятие</h2>
            <p class="text-toned">Четыре шага от первого вопроса до оценки. Работа сохраняется автоматически, к ней можно вернуться позже.</p>
          </div>
          <ol class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <li v-for="(step, index) in STEPS" :key="step.title" class="flex flex-col gap-3 rounded-lg border border-default bg-default p-5">
              <div class="flex items-center justify-between">
                <span class="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><UIcon :name="step.icon" class="size-5" /></span>
                <span class="text-sm font-semibold text-dimmed tabular-nums">0{{ index + 1 }}</span>
              </div>
              <h3 class="font-semibold">{{ step.title }}</h3>
              <p class="text-sm text-muted">{{ step.text }}</p>
            </li>
          </ol>
        </div>
      </section>

      <!-- Как выглядит работа: статичный макет интерфейса -->
      <section id="preview" class="scroll-mt-16">
        <div class="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div class="space-y-4">
            <h2 class="text-3xl font-bold tracking-tight">Диалог, реестр и ТЗ в одном окне</h2>
            <p class="text-toned">
              Слева — переписка с заказчиком. Каждый ответ можно сохранить в реестр одним нажатием, а затем перенести в нужный раздел ТЗ.
              Прогресс показывает, какие направления уже выяснены, а подсказки не раскрывают ответов заранее.
            </p>
            <ul class="space-y-2 text-sm text-muted">
              <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />Честное «не знаю»: заказчик признаёт, чего не определено</li>
              <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />Встречные вопросы, если ваш вопрос слишком общий</li>
              <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />Светлая и тёмная темы, работает на телефоне</li>
            </ul>
          </div>
          <div class="rounded-lg border border-default bg-elevated/40 p-3 sm:p-4" aria-hidden="true">
            <div class="flex items-center gap-2 border-b border-default pb-3">
              <UAvatar :src="scenario.customer.avatar" :text="scenario.customer.initials" size="sm" />
              <div class="min-w-0 leading-tight">
                <p class="truncate text-sm font-semibold">{{ scenario.customer.name }}</p>
                <p class="truncate text-xs text-muted">{{ scenario.customer.role }}</p>
              </div>
              <UBadge class="ms-auto" color="primary" variant="subtle" size="sm" label="В процессе" />
            </div>
            <div class="space-y-3 py-4">
              <div class="flex gap-2">
                <UAvatar :src="scenario.customer.avatar" :text="scenario.customer.initials" size="xs" />
                <p class="max-w-[85%] rounded-lg border border-default bg-elevated px-3 py-2 text-sm">Здравствуйте! Задавайте вопросы по порядку, я отвечу по существу.</p>
              </div>
              <p class="ms-auto w-fit max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">Какое давление нужно поддерживать после насоса?</p>
              <div class="flex gap-2">
                <UAvatar :src="scenario.customer.avatar" :text="scenario.customer.initials" size="xs" />
                <div class="max-w-[85%] space-y-2">
                  <p class="rounded-lg border border-default bg-elevated px-3 py-2 text-sm">После насоса нам нужно около 0,3 МПа.</p>
                  <span class="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary"><UIcon name="i-lucide-bookmark-plus" class="size-3.5" />Сохранить как требование</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 border-t border-default pt-3">
              <span class="flex-1 rounded-md border border-default bg-default px-3 py-2 text-sm text-muted">Задайте следующий вопрос заказчику…</span>
              <span class="grid size-9 place-items-center rounded-lg bg-primary text-inverted"><UIcon name="i-lucide-arrow-up" class="size-4" /></span>
            </div>
          </div>
        </div>
      </section>

      <!-- Учебный кейс -->
      <section id="case" class="scroll-mt-16 border-t border-default bg-elevated/30">
        <div class="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1fr]">
          <div class="space-y-3">
            <p class="text-sm font-semibold tracking-wide text-primary uppercase">Учебный кейс</p>
            <h2 class="text-3xl font-bold tracking-tight">{{ scenario.title }}</h2>
            <p class="text-toned">{{ scenario.subtitle }}</p>
            <p class="text-sm text-muted">{{ scenario.publicBrief }}</p>
            <div class="flex flex-wrap gap-2 pt-1">
              <UBadge color="neutral" variant="subtle" icon="i-lucide-hard-hat" label="Вы: инженер по автоматизации" />
              <UBadge color="neutral" variant="subtle" icon="i-lucide-user-round" :label="`Заказчик: ${scenario.customer.role}`" />
              <UBadge color="neutral" variant="subtle" icon="i-lucide-clock" :label="`Занятие ≈${scenario.estimatedMinutes} минут`" data-testid="time-badge" />
            </div>
            <p class="text-xs text-muted" data-testid="time-plan">
              Рекомендуемое распределение: около 50–60 минут — расспросить заказчика, 30–40 минут — составить ТЗ. Это ориентир, а не норматив.
            </p>
          </div>
          <div class="space-y-5 rounded-lg border border-default bg-default p-5">
            <div class="space-y-2">
              <h3 class="font-semibold">С чего начать</h3>
              <p class="text-sm text-muted" data-testid="example-question">
                Например: «Здравствуйте! Расскажите, пожалуйста, из чего состоит объект и что вы хотите автоматизировать?» Дальше спрашивайте по одной теме за раз.
              </p>
              <ul class="grid gap-2 pt-1" aria-label="Виды сведений">
                <li v-for="kind in KINDS" :key="kind.title" class="flex gap-2 text-sm">
                  <UIcon :name="kind.icon" class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span><span class="font-medium">{{ kind.title }}</span> — <span class="text-muted">{{ kind.text }}</span></span>
                </li>
              </ul>
              <p class="text-xs text-muted">Если заказчик не знает ответа, отметьте вопрос в реестре как «требует уточнения» — это тоже результат.</p>
            </div>
            <USeparator />
            <h3 class="font-semibold">О чём придётся спросить</h3>
            <ul class="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2" data-testid="directions-list">
              <li v-for="category in scenario.categories" :key="category.id" class="flex items-start gap-2 text-muted">
                <UIcon name="i-lucide-dot" class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{{ category.title }}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Призыв ещё раз внизу страницы -->
      <section class="border-t border-default">
        <div class="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 class="text-2xl font-bold tracking-tight">Готовы начать?</h2>
            <p class="text-muted">Войдите или зарегистрируйтесь: это займёт меньше минуты.</p>
          </div>
          <UButton size="xl" icon="i-lucide-arrow-up" trailing label="К форме входа" @click="toAuth" />
        </div>
      </section>
    </main>

    <footer class="border-t border-default">
      <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
        <span class="flex items-center gap-2"><TzLogo class="size-5 text-primary" />ТЗ Практикум · учебный тренажёр</span>
      </div>
    </footer>
  </div>
</template>
