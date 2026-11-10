import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import ui from '@nuxt/ui/vue-plugin';
import App from './App.vue';
import './assets/css/main.css';

// Единственный маршрут: экраны переключаются состоянием попытки. Router нужен компонентам Nuxt UI,
// hash-история работает на статическом хостинге без серверного fallback.
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});

createApp(App).use(router).use(ui).mount('#app');
