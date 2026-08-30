import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/main.css';

const app = createApp(App);
// DEBUG: 捕获 Vue 内部错误（生命周期钩子等），便于自动化测试诊断
(window as unknown as { __vueErrors: string[] }).__vueErrors = [];
app.config.errorHandler = (err, _inst, info) => {
  (window as unknown as { __vueErrors: string[] }).__vueErrors.push(
    `${info}: ${err instanceof Error ? err.stack : String(err)}`
  );
};
app.use(router).mount('#app');
