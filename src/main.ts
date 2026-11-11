import { createApp } from 'vue';
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import ui from '@nuxt/ui/vue-plugin';
import { initScenario } from './data/activeScenario';
import './assets/css/main.css';

// Экраны студента переключаются состоянием попытки, поэтому для них маршрут один. Панель администратора — раздел /admin.
// На своём домене (VITE_BASE=/) адреса обычные: /admin, без «#». Сервер отдаёт index.html на любой такой адрес.
// На статическом хостинге без fallback (GitHub Pages) остаётся hash-история: #/admin.
const plainUrls = import.meta.env.BASE_URL === '/';
const router = createRouter({
  history: plainUrls ? createWebHistory('/') : createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/admin/:section?/:id?', component: { render: () => null } },
    { path: '/:pathMatch(.*)*', component: { render: () => null } },
  ],
});

// Старые ссылки вида /#/admin и /#/continue/код переводим на обычные адреса.
if (plainUrls && window.location.hash.startsWith('#/')) void router.replace(window.location.hash.slice(1));

// Сценарий выбирает преподаватель на сервере; приложение подключается после того, как он известен.
// Если сервера нет, через пару секунд сайт открывается со встроенным сценарием.
await initScenario();
const { default: App } = await import('./App.vue');
createApp(App).use(router).use(ui).mount('#app');
