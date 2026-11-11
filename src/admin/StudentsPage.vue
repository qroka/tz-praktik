<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { adminApi } from '../api/client';
import SecretCode from '../components/student/SecretCode.vue';
import { dateTime, downloadFromServer, filterParams, gradeColor, groupItems, type GroupInfo } from './format';

type Row = {
  id: number; fullName: string; group: string; code: string; createdAt: string; lastLoginAt: string | null;
  attempts: number; finished: number; bestScore: number | null; lastAttemptAt: string | null;
};
type Issued = { id: number; fullName: string; group: string; code: string };

const toast = useToast();
const rows = ref<Row[]>([]);
const groups = ref<GroupInfo[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(false);
const error = ref('');
const filters = ref({ group: 'all', q: '', sort: 'name' });

const groupOptions = computed(() => groupItems(groups.value));
const groupNames = computed(() => groups.value.filter((g) => g.name).map((g) => g.name));
const sortItems = [
  { label: 'По ФИО', value: 'name' }, { label: 'По группе', value: 'group' }, { label: 'Недавно занимались', value: 'recent' }, { label: 'По лучшему баллу', value: 'score' },
];
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const fail = (e: unknown) => toast.add({ title: 'Не получилось', description: e instanceof Error ? e.message : String(e), color: 'error', icon: 'i-lucide-circle-alert' });
const ok = (title: string, description?: string) => toast.add({ title, description, color: 'success', icon: 'i-lucide-circle-check' });

async function load() {
  loading.value = true;
  error.value = '';
  const params = filterParams(filters.value, ['group', 'q', 'sort']);
  params.set('page', String(page.value));
  params.set('pageSize', String(pageSize));
  try {
    const data = await adminApi.get<{ items: Row[]; total: number; groups: GroupInfo[] }>(`/admin/students?${params}`);
    rows.value = data.items;
    total.value = data.total;
    groups.value = data.groups;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка загрузки.';
  } finally {
    loading.value = false;
  }
}

let timer = 0;
watch(filters, () => {
  page.value = 1;
  window.clearTimeout(timer);
  timer = window.setTimeout(load, 300);
}, { deep: true });
watch(page, load);
onMounted(load);
onBeforeUnmount(() => window.clearTimeout(timer));

async function copy(text: string, title = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text);
    ok(title);
  } catch {
    fail(new Error('Браузер не разрешил копирование.'));
  }
}

// ---------- Выданные коды (после добавления, списка, нового кода) ----------
const issued = ref<{ title: string; items: Issued[]; skipped: { line: string; reason: string }[]; group: string | null } | null>(null);
const issuedOpen = computed({ get: () => issued.value !== null, set: (open) => !open && (issued.value = null) });
const issuedText = computed(() => (issued.value?.items ?? []).map((s) => `${s.fullName}${s.group ? ` (${s.group})` : ''}: ${s.code}`).join('\n'));

// ---------- Добавить одного ----------
const addOpen = ref(false);
const addForm = ref({ fullName: '', group: '' });
const saving = ref(false);

async function addStudent() {
  saving.value = true;
  try {
    const student = await adminApi.post<Issued>('/admin/students', addForm.value);
    addOpen.value = false;
    issued.value = { title: 'Студент добавлен', items: [student], skipped: [], group: student.group };
    addForm.value = { fullName: '', group: '' };
    await load();
  } catch (e) {
    fail(e);
  } finally {
    saving.value = false;
  }
}

// ---------- Добавить списком ----------
const bulkOpen = ref(false);
const bulkForm = ref({ text: '', group: '' });

async function addBulk() {
  saving.value = true;
  try {
    const result = await adminApi.post<{ created: Issued[]; skipped: { line: string; reason: string }[] }>('/admin/students/bulk', bulkForm.value);
    bulkOpen.value = false;
    const groupsOfNew = new Set(result.created.map((s) => s.group));
    issued.value = { title: `Добавлено студентов: ${result.created.length}`, items: result.created, skipped: result.skipped, group: groupsOfNew.size === 1 ? [...groupsOfNew][0] : null };
    bulkForm.value = { text: '', group: '' };
    await load();
  } catch (e) {
    fail(e);
  } finally {
    saving.value = false;
  }
}

// ---------- Правка ----------
const editing = ref<Row | null>(null);
const editForm = ref({ fullName: '', group: '' });
const editOpen = computed({ get: () => editing.value !== null, set: (open) => !open && (editing.value = null) });

function startEdit(row: Row) {
  editing.value = row;
  editForm.value = { fullName: row.fullName, group: row.group };
}

async function saveEdit() {
  if (!editing.value) return;
  saving.value = true;
  try {
    await adminApi.patch(`/admin/students/${editing.value.id}`, editForm.value);
    editing.value = null;
    ok('Изменения сохранены');
    await load();
  } catch (e) {
    fail(e);
  } finally {
    saving.value = false;
  }
}

// ---------- Новый код ----------
const reissuing = ref<Row | null>(null);
const reissueOpen = computed({ get: () => reissuing.value !== null, set: (open) => !open && (reissuing.value = null) });

async function reissue() {
  const row = reissuing.value;
  if (!row) return;
  saving.value = true;
  try {
    const { code } = await adminApi.post<{ code: string }>(`/admin/students/${row.id}/reissue-code`);
    reissuing.value = null;
    issued.value = { title: 'Новый код выдан', items: [{ id: row.id, fullName: row.fullName, group: row.group, code }], skipped: [], group: null };
    await load();
  } catch (e) {
    fail(e);
  } finally {
    saving.value = false;
  }
}

// ---------- Удаление ----------
const removing = ref<Row | null>(null);
const removeOpen = computed({ get: () => removing.value !== null, set: (open) => !open && (removing.value = null) });

async function remove() {
  const row = removing.value;
  if (!row) return;
  try {
    await adminApi.del(`/admin/students/${row.id}${row.attempts ? '?withAttempts=1' : ''}`);
    removing.value = null;
    ok('Студент удалён');
    await load();
  } catch (e) {
    fail(e);
  }
}

const codesPath = (group?: string | null) => `/admin/students/codes.xlsx?${filterParams({ group: group ?? filters.value.group }, ['group'])}`;
</script>

<template>
  <div class="space-y-4" data-testid="students">
    <Teleport to="#admin-navbar-actions" defer>
      <USelect v-model="filters.group" :items="groupOptions" class="w-32 sm:w-44" aria-label="Группа" data-testid="students-group" />
      <UButton icon="i-lucide-user-plus" aria-label="Добавить студента" data-testid="students-add" @click="addOpen = true"><span class="hidden sm:inline">Добавить</span></UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-list-plus" aria-label="Добавить списком" data-testid="students-bulk" @click="bulkOpen = true"><span class="hidden lg:inline">Списком</span></UButton>
      <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" aria-label="Скачать коды (XLSX)" @click="downloadFromServer(codesPath(), 'student-codes.xlsx').catch(fail)"><span class="hidden xl:inline">Коды (XLSX)</span></UButton>
    </Teleport>

    <p class="max-w-3xl text-sm text-muted">
      Студенты регистрируются сами (ФИО и группа) или добавляются здесь. Каждому выдаётся личный код для входа в кабинет. Если студент потерял код, выдайте новый: старый перестанет работать.
    </p>

    <div class="grid gap-3 sm:grid-cols-[1fr_14rem]">
      <UInput v-model="filters.q" icon="i-lucide-search" placeholder="ФИО, группа или код" aria-label="Поиск" data-testid="students-search" />
      <USelect v-model="filters.sort" :items="sortItems" aria-label="Сортировка" />
    </div>
    <p class="text-sm text-muted" data-testid="students-total">Найдено: {{ total }}</p>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

    <div class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-left text-sm">
        <thead class="bg-elevated/50 text-muted">
          <tr>
            <th class="p-2 font-medium">ФИО</th><th class="p-2 font-medium">Группа</th><th class="p-2 font-medium">Код для входа</th><th class="p-2 font-medium">Попыток</th>
            <th class="p-2 font-medium">Лучший балл</th><th class="p-2 font-medium">Последняя попытка</th><th class="p-2 font-medium">Последний вход</th><th class="p-2" />
          </tr>
        </thead>
        <tbody :class="{ 'opacity-60': loading }">
          <tr v-if="!rows.length && !loading"><td colspan="8" class="p-6 text-center text-muted">Студентов не найдено.</td></tr>
          <tr v-for="row in rows" :key="row.id" class="border-t border-default align-top" :data-testid="`student-${row.id}`">
            <td class="p-2 font-medium">{{ row.fullName }}</td>
            <td class="p-2 whitespace-nowrap"><span v-if="row.group">{{ row.group }}</span><UBadge v-else label="без группы" color="warning" variant="subtle" size="sm" /></td>
            <td class="p-2">
              <SecretCode :code="row.code" :testid="`student-code-${row.id}`" @copy="copy(row.code, 'Код скопирован')" />
            </td>
            <td class="p-2 tabular-nums">{{ row.finished }} / {{ row.attempts }}</td>
            <td class="p-2"><UBadge v-if="row.bestScore !== null" :label="String(row.bestScore)" :color="gradeColor(row.bestScore)" variant="subtle" /><span v-else class="text-muted">—</span></td>
            <td class="p-2 whitespace-nowrap text-muted">{{ dateTime(row.lastAttemptAt) }}</td>
            <td class="p-2 whitespace-nowrap text-muted">{{ dateTime(row.lastLoginAt) }}</td>
            <td class="p-2 whitespace-nowrap text-right">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="`Изменить ${row.fullName}`" :data-testid="`student-edit-${row.id}`" @click="startEdit(row)" />
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-key-round" :aria-label="`Выдать новый код: ${row.fullName}`" :data-testid="`student-reissue-${row.id}`" @click="reissuing = row" />
              <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="`Удалить ${row.fullName}`" :data-testid="`student-delete-${row.id}`" @click="removing = row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pages > 1" class="flex items-center justify-center gap-2">
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-chevron-left" :disabled="page <= 1" aria-label="Назад" @click="page--" />
      <span class="text-sm">Страница {{ page }} из {{ pages }}</span>
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-chevron-right" :disabled="page >= pages" aria-label="Вперёд" @click="page++" />
    </div>

    <!-- Добавить одного -->
    <UModal v-model:open="addOpen" title="Добавить студента" description="Студент получит личный код для входа.">
      <template #body>
        <form class="space-y-4" @submit.prevent="addStudent">
          <UFormField label="ФИО" required><UInput v-model="addForm.fullName" class="w-full" placeholder="Петрова Ирина Сергеевна" data-testid="add-name" /></UFormField>
          <UFormField label="Группа" required><UInput v-model="addForm.group" class="w-full" list="admin-groups" placeholder="ИС-21" data-testid="add-group" /></UFormField>
          <datalist id="admin-groups"><option v-for="g in groupNames" :key="g" :value="g" /></datalist>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="addOpen = false" />
          <UButton label="Добавить" :loading="saving" :disabled="!addForm.fullName.trim() || !addForm.group.trim()" data-testid="add-submit" @click="addStudent" />
        </div>
      </template>
    </UModal>

    <!-- Добавить списком -->
    <UModal v-model:open="bulkOpen" title="Добавить студентов списком" description="По одному студенту на строку: «ФИО; группа». Если группа в строке не указана, подставится группа ниже.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Список"><UTextarea v-model="bulkForm.text" class="w-full" :rows="9" placeholder="Иванов Иван Иванович; ИС-21&#10;Петрова Анна; ИС-21&#10;Сидоров Пётр" data-testid="bulk-text" /></UFormField>
          <UFormField label="Группа для строк без группы"><UInput v-model="bulkForm.group" class="w-full" list="admin-groups" placeholder="ИС-21" data-testid="bulk-group" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="bulkOpen = false" />
          <UButton label="Добавить" :loading="saving" :disabled="!bulkForm.text.trim()" data-testid="bulk-submit" @click="addBulk" />
        </div>
      </template>
    </UModal>

    <!-- Изменить -->
    <UModal v-model:open="editOpen" title="Изменить студента" description="Новые ФИО и группа попадут и в уже сохранённые попытки.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="ФИО"><UInput v-model="editForm.fullName" class="w-full" data-testid="edit-name" /></UFormField>
          <UFormField label="Группа"><UInput v-model="editForm.group" class="w-full" list="admin-groups" data-testid="edit-group" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="editing = null" />
          <UButton label="Сохранить" :loading="saving" :disabled="!editForm.fullName.trim() || !editForm.group.trim()" data-testid="edit-submit" @click="saveEdit" />
        </div>
      </template>
    </UModal>

    <!-- Новый код -->
    <UModal v-model:open="reissueOpen" title="Выдать новый код?">
      <template #body>
        <p v-if="reissuing" class="text-sm">
          У студента <b>{{ reissuing.fullName }}</b> старый код перестанет работать, а все его входы на других устройствах закроются. Попытки сохранятся.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="reissuing = null" />
          <UButton label="Выдать новый код" :loading="saving" data-testid="reissue-confirm" @click="reissue" />
        </div>
      </template>
    </UModal>

    <!-- Удалить -->
    <UModal v-model:open="removeOpen" title="Удалить студента?">
      <template #body>
        <p v-if="removing" class="text-sm">
          Студент <b>{{ removing.fullName }}</b> будет удалён.
          <b v-if="removing.attempts">Вместе с ним удалятся его попытки: {{ removing.attempts }}.</b> Это нельзя отменить.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Отмена" @click="removing = null" />
          <UButton color="error" label="Удалить" data-testid="delete-confirm" @click="remove" />
        </div>
      </template>
    </UModal>

    <!-- Выданные коды -->
    <UModal v-model:open="issuedOpen" :title="issued?.title ?? ''" description="Передайте коды студентам: по ним они входят в личный кабинет." :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div v-if="issued" class="space-y-4" data-testid="issued">
          <table v-if="issued.items.length" class="w-full text-left text-sm">
            <thead class="text-muted"><tr><th class="py-1 pr-3 font-medium">ФИО</th><th class="pr-3 font-medium">Группа</th><th class="font-medium">Код</th></tr></thead>
            <tbody>
              <tr v-for="s in issued.items" :key="s.id" class="border-t border-default">
                <td class="py-1.5 pr-3">{{ s.fullName }}</td><td class="pr-3 text-muted">{{ s.group }}</td><td class="font-semibold" data-testid="issued-code">{{ s.code }}</td>
              </tr>
            </tbody>
          </table>
          <UAlert v-if="issued.skipped.length" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="`Пропущено строк: ${issued.skipped.length}`">
            <template #description><ul class="list-disc pl-5"><li v-for="s in issued.skipped" :key="s.line"><b>{{ s.line }}</b>: {{ s.reason }}</li></ul></template>
          </UAlert>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton v-if="issued?.items.length" color="neutral" variant="outline" icon="i-lucide-copy" label="Скопировать список" @click="copy(issuedText, 'Список скопирован')" />
          <UButton v-if="issued?.group" color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" label="Коды группы (XLSX)" @click="downloadFromServer(codesPath(issued.group), 'student-codes.xlsx').catch(fail)" />
          <UButton label="Готово" @click="issued = null" />
        </div>
      </template>
    </UModal>
  </div>
</template>
