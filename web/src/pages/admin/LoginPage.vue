<template>
  <div class="login-wrap">
    <form class="card" @submit.prevent="submit">
      <h1>{{ needSetup ? '设置管理员密码' : '管理端登录' }}</h1>
      <p class="lead" v-if="needSetup">首次使用：请设置管理员密码（至少 8 位），仅保存在本机服务器上。</p>
      <p class="lead" v-else>请输入管理员密码。</p>

      <input
        v-model="password"
        type="password"
        :placeholder="needSetup ? '设置密码（≥8位）' : '密码'"
        required
        minlength="8"
      />
      <p v-if="error" class="err">⚠️ {{ error }}</p>
      <button class="btn primary big" type="submit" :disabled="busy">
        {{ busy ? '提交中…' : needSetup ? '设置并进入' : '登录' }}
      </button>
      <p class="tip">前台 <a href="/" target="_blank" rel="noopener">返回地图 →</a></p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api';

const router = useRouter();
const needSetup = ref(false);
const password = ref('');
const error = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    const s = await api.admin.state();
    needSetup.value = !s.initialized;
    if (s.authenticated) router.replace({ name: 'admin-dashboard' });
  } catch (e) {
    error.value = e instanceof Error ? e.message : '无法连接服务器';
  }
});

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    if (needSetup.value) await api.admin.setup(password.value);
    else await api.admin.login(password.value);
    router.replace({ name: 'admin-dashboard' });
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--bg);
}
.card {
  width: min(380px, 92vw);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 30px 28px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h1 {
  margin: 0;
  font-size: 19px;
}
.lead {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
input {
  padding: 10px 12px;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}
.tip {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
  text-align: center;
}
</style>
