import { createRouter, createWebHistory } from 'vue-router';
import MapPage from './pages/MapPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'map', component: MapPage },
    { path: '/spot/:id', name: 'spot', component: MapPage },
    { path: '/submit', name: 'submit', component: () => import('./pages/SubmitPage.vue') },
    {
      path: '/admin',
      component: () => import('./pages/admin/AdminLayout.vue'),
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('./pages/admin/Dashboard.vue') },
        { path: 'login', name: 'admin-login', component: () => import('./pages/admin/LoginPage.vue') },
        { path: 'spots', name: 'admin-spots', component: () => import('./pages/admin/SpotsList.vue') },
        { path: 'spots/new', name: 'admin-spot-new', component: () => import('./pages/admin/SpotEdit.vue') },
        { path: 'spots/:id', name: 'admin-spot-edit', component: () => import('./pages/admin/SpotEdit.vue') },
        { path: 'review', name: 'admin-review', component: () => import('./pages/admin/ReviewQueue.vue') },
        { path: 'themes', name: 'admin-themes', component: () => import('./pages/admin/ThemesAdmin.vue') },
        { path: 'import', name: 'admin-import', component: () => import('./pages/admin/ImportPage.vue') },
        { path: 'settings', name: 'admin-settings', component: () => import('./pages/admin/SettingsPage.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
