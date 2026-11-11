import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import ui from '@nuxt/ui/vue-plugin';
import { initScenario } from './data/activeScenario';
import './assets/css/main.css';

// Экраны студента переключаются состоянием попытки, поэтому для них маршрут один.
// Панель администратора — отдельный раздел #/admin. hash-история работает на статическом хостинге без fallback.
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/admin/:section?', component: { render: () => null } },
    { path: '/:pathMatch(.*)*', component: { render: () => null } },
  ],
});

// Сценарий выбирает преподаватель на сервере; приложение подключается после того, как он известен.
// Если сервера нет, через пару секунд сайт открывается со встроенным сценарием.
await initScenario();
const { default: App } = await import('./App.vue');
createApp(App).use(router).use(ui).mount('#app');
