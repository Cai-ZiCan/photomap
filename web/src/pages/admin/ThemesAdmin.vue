<template>
  <div>
    <h1>专题管理</h1>
    <p class="lead">专题决定点位的地图配色与前台过滤标签；删除专题不影响点位本身，仅解除关联。</p>

    <form class="card form" @submit.prevent="submit">
      <b>{{ editing ? `编辑专题：${form.name}` : '新建专题' }}</b>
      <div class="grid">
        <label><span>名称 *</span><input v-model="form.name" maxlength="20" required placeholder="如：晚霞" /></label>
        <label><span>slug（小写字母/数字/连字符）</span><input v-model="form.slug" maxlength="24" :disabled="editing" placeholder="留空自动生成" /></label>
        <label><span>颜色</span><input type="color" v-model="form.color" /></label>
        <label><span>图标（emoji）</span><input v-model="form.icon" maxlength="8" placeholder="🌅" /></label>
        <label><span>排序（小在前）</span><input type="number" v-model.number="form.sort" /></label>
        <label><span>描述</span><input v-model="form.description" maxlength="200" /></label>
      </div>
      <p v-if="error" class="err">⚠️ {{ error }}</p>
      <div class="row">
        <button class="btn primary" type="submit">{{ editing ? '保存修改' : '新建' }}</button>
        <button v-if="editing" class="btn" type="button" @click="cancelEdit">取消</button>
      </div>
    </form>

    <table class="table">
      <thead>
        <tr><th>专题</th><th>slug</th><th>描述</th><th>排序</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="t in themes" :key="t.id">
          <td>
            <span class="t-dot" :style="{ background: t.color }"></span>
            {{ t.icon }} <b>{{ t.name }}</b>
          </td>
          <td class="muted">{{ t.slug }}</td>
          <td class="muted">{{ t.description || '—' }}</td>
          <td>{{ t.sort }}</td>
          <td class="ops">
            <button class="btn mini" @click="edit(t)">编辑</button>
            <button class="btn mini danger" @click="remove(t)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '../../api';
import { loadAll, state } from '../../store';
import type { Theme } from '../../types';

const themes = ref<Theme[]>([]);
const editing = ref<Theme | null>(null);
const error = ref('');
const form = reactive({ name: '', slug: '', color: '#e67e22', icon: '', description: '', sort: 99 });

onMounted(load);
async function load() {
  themes.value = await api.admin.themes();
  state.themes = themes.value; // 同步前台 store
}

function edit(t: Theme) {
  editing.value = t;
  Object.assign(form, { name: t.name, slug: t.slug, color: t.color, icon: t.icon, description: t.description, sort: t.sort });
}
function cancelEdit() {
  editing.value = null;
  Object.assign(form, { name: '', slug: '', color: '#e67e22', icon: '', description: '', sort: 99 });
  error.value = '';
}

async function submit() {
  error.value = '';
  try {
    if (editing.value) await api.admin.updateTheme(editing.value.id, { ...form });
    else await api.admin.createTheme({ ...form });
    cancelEdit();
    await load();
    await loadAll();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败';
  }
}

async function remove(t: Theme) {
  if (!window.confirm(`删除专题「${t.name}」？相关点位将解除关联（不删除点位）。`)) return;
  await api.admin.deleteTheme(t.id);
  await load();
}
</script>

<style scoped>
h1 {
  font-size: 20px;
  margin: 0 0 6px;
}
.lead {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 16px;
}
.card.form {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
}
.grid label span {
  color: var(--muted);
}
.grid input {
  width: 100%;
}
input[type='color'] {
  height: 36px;
  padding: 2px;
}
.row {
  display: flex;
  gap: 8px;
}
.t-dot {
  display: inline-block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  vertical-align: -2px;
  margin-right: 4px;
}
.muted {
  color: var(--muted);
  font-size: 12.5px;
}
.ops {
  display: flex;
  gap: 6px;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}
@media (max-width: 760px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
