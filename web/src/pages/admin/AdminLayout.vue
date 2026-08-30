<template>
  <div class="admin">
    <aside class="side">
      <RouterLink class="brand" to="/">
        <span>📷</span><b>{{ state.site.name }}</b><i>管理端</i>
      </RouterLink>
      <nav v-if="authed">
        <RouterLink to="/admin">📊 总览</RouterLink>
        <RouterLink to="/admin/spots">📍 点位管理</RouterLink>
        <RouterLink to="/admin/review" class="with-badge">
          🕒 审核队列
          <span v-if="pendingCount > 0" class="badge pending">{{ pendingCount }}</span>
        </RouterLink>
        <RouterLink to="/admin/themes">🎨 专题管理</RouterLink>
        <RouterLink to="/admin/import">🔗 链接导入</RouterLink>
        <RouterLink to="/admin/settings">⚙️ 设置与导出</RouterLink>
      </nav>
      <div class="foot" v-if="authed">
        <a href="/" target="_blank" rel="noopener">🌐 查看前台</a>
        <button class="link" @click="logout">退出登录</button>
      </div>
    </aside>
    <main class="main">
      <RouterView v-if="checked && (authed || route.name === 'admin-login')" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api';
import { state } from '../../store';

const route = useRoute();
const router = useRouter();
const authed = ref(false);
const checked = ref(false);
const pendingCount = ref(0);

async function refresh() {
  try {
    const s = await api.admin.state();
    authed.value = s.authenticated;
    if (!s.initialized) {
      // 未初始化 → 登录页承担“设置管理员密码”职责
      if (route.name !== 'admin-login') router.replace({ name: 'admin-login' });
      return;
    }
    if (!s.authenticated && route.name !== 'admin-login') {
      router.replace({ name: 'admin-login' });
    }
    if (s.authenticated) {
      api.admin.overview().then((o) => (pendingCount.value = o.pending)).catch(() => {});
    }
  } finally {
    checked.value = true;
  }
}

async function logout() {
  await api.admin.logout().catch(() => {});
  authed.value = false;
  router.replace({ name: 'admin-login' });
}

onMounted(refresh);
watch(() => route.name, refresh);

defineExpose({ refresh });
</script>

<style scoped>
.admin {
  display: flex;
  min-height: 100vh;
}
.side {
  width: 210px;
  flex: none;
  background: #1d2530;
  color: #cfd6de;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: #fff;
  text-decoration: none;
  padding: 4px 10px 16px;
}
.brand span {
  align-self: center;
}
.brand i {
  font-style: normal;
  font-size: 11px;
  color: #8b96a3;
}
nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
nav a {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #cfd6de;
  text-decoration: none;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13.5px;
}
nav a:hover {
  background: rgba(255, 255, 255, 0.07);
}
nav a.router-link-exact-active {
  background: var(--primary);
  color: #fff;
}
.foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
}
.foot a {
  color: #9fb4d8;
  font-size: 12.5px;
  text-decoration: none;
}
.link {
  border: none;
  background: none;
  color: #8b96a3;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
  padding: 0;
}
.link:hover {
  color: #fff;
}
.main {
  flex: 1;
  min-width: 0;
  padding: 24px 28px 60px;
}
@media (max-width: 800px) {
  .admin {
    flex-direction: column;
  }
  .side {
    width: 100%;
    height: auto;
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .main {
    padding: 16px 14px 40px;
  }
}
</style>
