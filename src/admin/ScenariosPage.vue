<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '../api/client';
import { convertForeignPack } from '../data/packConverter';
import { buildScenarioFromPack, checkRecognition, type ScenarioPack } from '../data/scenarioPack';
import { dateTime, downloadFromServer, downloadText, gradeColor, type ScenarioSummary } from './format';

const router = useRouter();
const items = ref<ScenarioSummary[]>([]);
const error = ref('');
const toast = useToast();

async function load() {
  error.value = '';
  try {
    items.value = (await adminApi.get<{ items: ScenarioSummary[] }>('/admin/scenarios')).items;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки.';
  }
}
onMounted(load);

const fail = (e: unknown) => toast.add({ title: 'Не получилось', description: e instanceof Error ? e.message : String(e), color: 'error', icon: 'i-lucide-circle-alert' });
const ok = (title: string) => toast.add({ title, color: 'success', icon: 'i-lucide-circle-check' });

async function makeCurrent(item: ScenarioSummary) {
  try {
    await adminApi.patch(`/admin/scenarios/${item.id}`, { isCurrent: true });
    ok(`Студенты теперь проходят «${item.settings.title ?? item.title}»`);
    await load();
  } catch (e) {
    fail(e);
  }
}

// --- Настройки ---
const editing = ref<ScenarioSummary | null>(null);
const form = ref({ title: '', publicBrief: '', estimatedMinutes: '', note: '', customerName: '', customerAvatar: '' });
const avatarInput = ref<HTMLInputElement | null>(null);

/** Квадратная обрезка по центру и сжатие до 256 px (WebP или JPEG): так аватарка занимает 20–40 КБ. */
async function pickAvatar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    // WebP легче JPEG при том же качестве; если браузер его не умеет кодировать, вернётся PNG — тогда берём JPEG.
    const webp = canvas.toDataURL('image/webp', 0.85);
    form.value.customerAvatar = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    fail(new Error('Не удалось прочитать картинку. Выберите файл JPEG, PNG или WebP.'));
  }
}
const editOpen = computed({ get: () => editing.value !== null, set: (open) => !open && (editing.value = null) });

function openSettings(item: ScenarioSummary) {
  editing.value = item;
  form.value = {
    title: item.settings.title ?? '',
    publicBrief: item.settings.publicBrief ?? '',
    estimatedMinutes: item.settings.estimatedMinutes ? String(item.settings.estimatedMinutes) : '',
    note: item.settings.note ?? '',
    customerName: item.settings.customerName ?? '',
    customerAvatar: item.settings.customerAvatar ?? '',
  };
}

async function saveSettings() {
  if (!editing.value) return;
  try {
    await adminApi.patch(`/admin/scenarios/${editing.value.id}`, { settings: form.value });
    ok('Настройки сохранены');
    editing.value = null;
    await load();
  } catch (e) {
    fail(e);
  }
}

// --- Загрузка файла сценария ---
type Check = { pack: ScenarioPack; errors: string[]; warnings: string[]; notes: string[]; recognition: { total: number; misses: string[] } | null; exists: boolean };

/** Сколько ошибок показывать сразу: у файла в чужом формате их сотни, важны первые. */
const SHOWN_ERRORS = 12;
const check = ref<Check | null>(null);
const checkOpen = computed({ get: () => check.value !== null, set: (open) => !open && (check.value = null) });
const fileInput = ref<HTMLInputElement | null>(null);
const replace = ref(false);
const uploading = ref(false);

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return fail(new Error('Файл больше 5 МБ.'));
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return fail(new Error('Файл не читается как JSON. Чаще всего пропущена запятая или лишняя запятая в конце списка.'));
  }
  try {
    // Файл мог быть подготовлен не по нашему промту (schemaVersion, answers…): преобразуем его, а не отклоняем.
    const converted = convertForeignPack(parsed);
    const pack = (converted?.pack ?? parsed) as ScenarioPack;
    const { scenario, report } = buildScenarioFromPack(pack);
    const recognition = scenario && !report.errors.length ? checkRecognition(scenario, pack) : null;
    replace.value = false;
    check.value = {
      pack, errors: report.errors, warnings: report.warnings, notes: converted?.notes ?? [], recognition,
      exists: items.value.some((item) => item.id === pack.scenario?.id),
    };
  } catch (e) {
    // Сборка не должна падать молча: любая неожиданность показывается преподавателю.
    fail(new Error(`Не удалось проверить файл: ${e instanceof Error ? e.message : String(e)}`));
  }
}

async function upload() {
  if (!check.value) return;
  uploading.value = true;
  try {
    await adminApi.post(`/admin/scenarios${replace.value ? '?replace=1' : ''}`, check.value.pack);
    ok('Сценарий загружен');
    check.value = null;
    await load();
  } catch (e) {
    fail(e);
  } finally {
    uploading.value = false;
  }
}

async function downloadPack(item: ScenarioSummary) {
  try {
    const data = await adminApi.get<{ pack: unknown }>(`/admin/scenarios/${item.id}`);
    downloadText(`${item.id}.json`, JSON.stringify(data.pack, null, 2));
  } catch (e) {
    fail(e);
  }
}

// --- Удаление ---
const removing = ref<ScenarioSummary | null>(null);
const removeOpen = computed({ get: () => removing.value !== null, set: (open) => !open && (removing.value = null) });
async function remove() {
  const item = removing.value;
  if (!item) return;
  try {
    await adminApi.del(`/admin/scenarios/${item.id}${item.attempts ? '?withAttempts=1' : ''}`);
    removing.value = null;
    ok('Сценарий удалён');
    await load();
  } catch (e) {
    fail(e);
  }
}
</script>

<template>
  <div class="space-y-4" data-testid="scenarios">
    <Teleport to="#admin-navbar-actions" defer>
      <div>
        <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" data-testid="scenario-file" @change="onFile" />
        <UButton icon="i-lucide-upload" aria-label="Загрузить файл сценария" @click="fileInput?.click()"><span class="hidden sm:inline">Загрузить файл сценария</span></UButton>
      </div>
    </Teleport>
    <p class="max-w-3xl text-sm text-muted">
      Студентам показывается один сценарий — текущий. Новый сценарий готовит ChatGPT по промту из docs/prompt-novyj-scenarij.md; перед загрузкой файл проверяется в браузере.
    </p>
    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

    <div class="grid gap-3">
      <UCard v-for="item in items" :key="item.id" :ui="{ body: 'space-y-3 p-4' }" :data-testid="`scenario-${item.id}`">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-semibold">{{ item.settings.title ?? item.title }}</h2>
              <UBadge v-if="item.isCurrent" label="Текущий для студентов" color="success" variant="subtle" />
              <UBadge :label="item.kind === 'builtin' ? 'Встроенный' : 'Из файла'" color="neutral" variant="outline" />
            </div>
            <p class="text-xs text-muted">
              id: {{ item.id }} · обновлён {{ dateTime(item.updatedAt) }}<template v-if="item.factsTotal"> · сведений: {{ item.factsTotal }}</template>
            </p>
            <p v-if="item.settings.note" class="text-sm">Заметка: {{ item.settings.note }}</p>
          </div>
          <div class="flex gap-6 text-sm">
            <div><p class="text-muted">Попыток</p><p class="text-xl font-semibold">{{ item.attempts }}</p></div>
            <div><p class="text-muted">Завершено</p><p class="text-xl font-semibold">{{ item.finished }}</p></div>
            <div><p class="text-muted">Средний балл</p><p class="text-xl font-semibold"><UBadge v-if="item.avgScore !== null" :label="String(item.avgScore)" :color="gradeColor(item.avgScore)" variant="subtle" size="lg" /><span v-else>—</span></p></div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton size="sm" icon="i-lucide-eye" label="Открыть сценарий" :data-testid="`open-${item.id}`" @click="router.push(`/admin/scenarios/${item.id}`)" />
          <UButton v-if="!item.isCurrent" size="sm" color="neutral" variant="outline" icon="i-lucide-badge-check" label="Сделать текущим" @click="makeCurrent(item)" />
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-settings-2" label="Настройки" @click="openSettings(item)" />
          <UButton v-if="item.kind === 'pack'" size="sm" color="neutral" variant="outline" icon="i-lucide-download" label="Скачать файл" @click="downloadPack(item)" />
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-file-text" label="Отчёт" @click="downloadFromServer(`/admin/reports/scenario/${item.id}`, `report-${item.id}.md`).catch(fail)" />
          <UButton v-if="item.kind === 'pack' && !item.isCurrent" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" label="Удалить" @click="removing = item" />
        </div>
      </UCard>
    </div>

    <UModal v-model:open="editOpen" title="Настройки сценария" description="Заголовок, описание, время занятия, имя и аватарку заказчика видят студенты. Заметку видит только преподаватель.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Название"><UInput v-model="form.title" class="w-full" placeholder="Оставьте пустым — название из сценария" /></UFormField>
          <UFormField label="Описание для студента"><UTextarea v-model="form.publicBrief" class="w-full" :rows="4" placeholder="Оставьте пустым — описание из сценария" /></UFormField>
          <UFormField label="Заказчик в чате" hint="Имя и аватарку видят студенты">
            <div class="flex flex-wrap items-center gap-3">
              <UAvatar :src="form.customerAvatar || undefined" :text="(form.customerName || 'З').slice(0, 2).toUpperCase()" alt="Аватарка заказчика" size="xl" data-testid="avatar-preview" />
              <div class="flex gap-2">
                <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-image-up" label="Выбрать картинку" @click="avatarInput?.click()" />
                <UButton v-if="form.customerAvatar" size="sm" color="neutral" variant="ghost" icon="i-lucide-trash-2" label="Убрать" @click="form.customerAvatar = ''" />
              </div>
              <input ref="avatarInput" type="file" accept="image/jpeg,image/png,image/webp,.webp" class="sr-only" tabindex="-1" data-testid="avatar-file" @change="pickAvatar" />
            </div>
          </UFormField>
          <UFormField label="Имя заказчика"><UInput v-model="form.customerName" class="w-full" placeholder="Оставьте пустым — имя из сценария" /></UFormField>
          <UFormField label="Время занятия, минут" hint="от 5 до 600"><UInput v-model="form.estimatedMinutes" type="number" min="5" max="600" class="w-40" /></UFormField>
          <UFormField label="Заметка преподавателя"><UTextarea v-model="form.note" class="w-full" :rows="2" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="editing = null" />
          <UButton label="Сохранить" data-testid="settings-save" @click="saveSettings" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="checkOpen" title="Проверка файла сценария" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div v-if="check" class="space-y-4" data-testid="scenario-check">
          <p class="text-sm">
            <b>{{ check.pack.scenario?.title ?? 'Без названия' }}</b> · сведений: {{ check.pack.facts?.length ?? 0 }}
          </p>
          <UAlert v-if="check.notes.length" color="info" variant="subtle" icon="i-lucide-wand-sparkles" title="Файл преобразован автоматически" data-testid="scenario-notes">
            <template #description><ul class="list-disc pl-5"><li v-for="n in check.notes" :key="n">{{ n }}</li></ul></template>
          </UAlert>
          <UAlert v-if="check.errors.length" color="error" variant="subtle" icon="i-lucide-circle-x" :title="`Файл нельзя загрузить: ошибок ${check.errors.length}`" data-testid="scenario-errors">
            <template #description>
              <ul class="max-h-48 list-disc overflow-y-auto pl-5"><li v-for="e in check.errors.slice(0, SHOWN_ERRORS)" :key="e">{{ e }}</li></ul>
              <p v-if="check.errors.length > SHOWN_ERRORS" class="mt-1 text-xs">…и ещё {{ check.errors.length - SHOWN_ERRORS }}. Скорее всего, файл составлен не по формату из docs/prompt-novyj-scenarij.md: попросите ChatGPT выдать его в этом формате.</p>
            </template>
          </UAlert>
          <UAlert v-else color="success" variant="subtle" icon="i-lucide-circle-check" title="Ошибок нет" />
          <UAlert v-if="check.recognition" :color="check.recognition.misses.length ? 'warning' : 'success'" variant="subtle" icon="i-lucide-search-check" :title="`Вопросы распознаются: ${check.recognition.total - check.recognition.misses.length} из ${check.recognition.total}`">
            <template v-if="check.recognition.misses.length" #description>
              <p class="mb-1">Эти вопросы сайт не связал со своим сведением. Отправьте список ChatGPT с просьбой поправить keywords и формулировки.</p>
              <ul class="max-h-40 list-disc overflow-y-auto pl-5 text-xs"><li v-for="m in check.recognition.misses" :key="m">{{ m }}</li></ul>
            </template>
          </UAlert>
          <UAlert v-if="check.warnings.length" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`Замечания: ${check.warnings.length}`">
            <template #description><ul class="max-h-40 list-disc overflow-y-auto pl-5 text-xs"><li v-for="w in check.warnings" :key="w">{{ w }}</li></ul></template>
          </UAlert>
          <UCheckbox v-if="check.exists && !check.errors.length" v-model="replace" label="Сценарий с таким id уже есть: заменить его (попытки студентов сохранятся)" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="check = null" />
          <UButton :disabled="!check || check.errors.length > 0 || (check.exists && !replace)" :loading="uploading" label="Загрузить на сервер" data-testid="scenario-upload" @click="upload" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="removeOpen" title="Удалить сценарий?">
      <template #body>
        <p v-if="removing" class="text-sm">
          Сценарий «{{ removing.settings.title ?? removing.title }}» будет удалён.
          <b v-if="removing.attempts">Вместе с ним удалятся попытки студентов: {{ removing.attempts }}.</b> Это нельзя отменить.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="removing = null" />
          <UButton color="error" label="Удалить" @click="remove" />
        </div>
      </template>
    </UModal>
  </div>
</template>
