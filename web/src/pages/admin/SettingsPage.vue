<template>
  <div v-if="cfg">
    <h1>设置与数据</h1>

    <section class="card">
      <h2>站点信息</h2>
      <p class="kv">名称：<b>{{ cfg.site.name }}</b></p>
      <p class="kv">描述：{{ cfg.site.description || '—' }}</p>
      <p class="muted">修改站点名称/描述请编辑 <code>server/.env</code> 中的 SITE_NAME / SITE_DESC 后重启服务。</p>
    </section>

    <section class="card">
      <h2>管理员密码</h2>
      <div class="grid3">
        <label><span>原密码</span><input v-model="pw.old" type="password" /></label>
        <label><span>新密码（≥8位）</span><input v-model="pw.new1" type="password" /></label>
        <label><span>确认新密码</span><input v-model="pw.new2" type="password" /></label>
      </div>
      <p v-if="pwMsg" class="msg" :class="{ err: pwErr }">{{ pwMsg }}</p>
      <button class="btn primary" @click="changePw">修改密码</button>
    </section>

    <section class="card">
      <h2>AI 配置状态</h2>
      <p class="kv">
        状态：<span class="badge" :class="cfg.ai.enabled ? 'published' : 'archived'">{{ cfg.ai.enabled ? '已启用' : '未配置' }}</span>
      </p>
      <p class="kv">接口：<code>{{ cfg.ai.baseUrl }}</code></p>
      <p class="kv">文本模型：<code>{{ cfg.ai.textModel }}</code>　视觉模型：<code>{{ cfg.ai.visionModel }}</code></p>
      <p class="muted">配置方法见「链接导入」页顶部的说明。</p>
    </section>

    <section class="card">
      <h2>数据导出与备份</h2>
      <p class="muted">导出内容包含全部点位/专题数据（photomap.json）与所有照片文件，可作为备份或迁移到其他部署。</p>
      <a class="btn primary" href="/api/admin/export" download>⬇️ 导出 ZIP（数据 + 照片）</a>
    </section>

    <section class="card">
      <h2>示例数据</h2>
      <p class="muted">
        首次启动自动生成的演示点位（含占位图）。清空后不会再次自动生成；如需重新灌入可点击「重新生成」。
      </p>
      <div class="row">
        <button class="btn danger" @click="clearSeed">🗑 清空示例数据</button>
        <button class="btn" @click="reseed">↻ 重新生成示例</button>
      </div>
    </section>

    <section class="card">
      <h2>关于</h2>
      <p class="kv">技术栈：Vue 3 + OpenLayers + Node.js + SQLite</p>
      <p class="kv">数据目录：<code>data/</code>（数据库 + 照片，备份即复制该目录）</p>
      <p class="kv">文档：<code>docs/</code>（原则 / 架构 / 部署）</p>
    </section>
  </div>
  <p v-else class="muted">加载中…</p>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '../../api';
import type { AdminConfig } from '../../types';

const cfg = ref<AdminConfig | null>(null);
const pw = reactive({ old: '', new1: '', new2: '' });
const pwMsg = ref('');
const pwErr = ref(false);

onMounted(async () => {
  cfg.value = await api.admin.config();
});

async function changePw() {
  pwMsg.value = '';
  pwErr.value = false;
  if (pw.new1 !== pw.new2) {
    pwErr.value = true;
    pwMsg.value = '两次输入的新密码不一致';
    return;
  }
  try {
    await api.admin.changePassword(pw.old, pw.new1);
    pwMsg.value = '✅ 密码已修改';
    pw.old = pw.new1 = pw.new2 = '';
  } catch (e) {
    pwErr.value = true;
    pwMsg.value = e instanceof Error ? e.message : '修改失败';
  }
}

async function clearSeed() {
  if (!window.confirm('确定清空全部示例点位？其照片将一并删除。')) return;
  const r = await api.admin.clearSeed();
  window.alert(`已删除 ${r.removed} 个示例点位`);
}

async function reseed() {
  if (!window.confirm('将清空现有示例并重新生成，确定？')) return;
  try {
    await api.admin.reseed();
    window.alert('已重新生成示例数据');
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '重新生成失败');
  }
}
</script>

<style scoped>
h1 {
  font-size: 20px;
  margin: 0 0 16px;
}
h2 {
  font-size: 15px;
  margin: 0 0 10px;
}
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 14px;
}
.kv {
  margin: 6px 0;
  font-size: 13.5px;
}
.muted {
  color: var(--muted);
  font-size: 12.5px;
}
code {
  background: #f0f2f5;
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 12px;
}
.grid3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 10px;
}
.grid3 label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
}
.grid3 label span {
  color: var(--muted);
}
.grid3 input {
  width: 100%;
}
.row {
  display: flex;
  gap: 10px;
}
.msg {
  font-size: 13px;
  color: var(--ok);
}
.msg.err {
  color: var(--danger);
}
@media (max-width: 760px) {
  .grid3 {
    grid-template-columns: 1fr;
  }
}
</style>
