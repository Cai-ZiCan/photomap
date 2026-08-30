<template>
  <div>
    <div class="head">
      <h1>点位管理</h1>
      <RouterLink class="btn primary" to="/admin/spots/new">＋ 新建点位</RouterLink>
    </div>

    <div class="toolbar">
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.value"
          class="tab"
          :class="{ active: status === t.value }"
          @click="status = t.value"
        >{{ t.label }}<span v-if="counts[t.value] !== undefined" class="n">{{ counts[t.value] }}</span></button>
      </div>
      <input v-model="kw" class="search" placeholder="搜索名称 / 地址…" />
    </div>

    <table class="table">
      <thead>
        <tr>
          <th style="width:60px">封面</th>
          <th>名称</th>
          <th>专题</th>
          <th>状态</th>
          <th>来源</th>
          <th>更新时间</th>
          <th style="width:230px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in filtered" :key="s.id">
          <td><img v-if="s.coverThumb" class="cover" :src="s.coverThumb" /><span v-else class="cover none"></span></td>
          <td>
            <b>{{ s.name }}</b>
            <div class="mini-info">{{ s.region || s.address || `${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}` }}</div>
          </td>
          <td>
            <span v-for="t in s.themes" :key="t.slug" class="theme-dot" :style="{ background: t.color }">{{ t.name }}</span>
            <span v-if="!s.themes.length" class="muted">—</span>
          </td>
          <td><span class="badge" :class="s.status">{{ statusLabel(s.status) }}</span></td>
          <td><span class="badge" :class="s.source">{{ sourceLabel(s.source) }}</span></td>
          <td class="muted">{{ s.updated_at }}</td>
          <td class="ops">
            <RouterLink class="btn mini" :to="`/admin/spots/${s.id}`">编辑</RouterLink>
            <button v-if="s.status !== 'published'" class="btn mini ok" @click="setStatus(s, 'published')">发布</button>
            <button v-if="s.status === 'published'" class="btn mini" @click="setStatus(s, 'archived')">下架</button>
            <button v-if="s.status === 'pending'" class="btn mini danger" @click="setStatus(s, 'rejected')">拒绝</button>
            <button class="btn mini danger" @click="remove(s)">删除</button>
          </td>
        </tr>
        <tr v-if="!filtered.length">
          <td colspan="7" class="empty">没有符合条件的点位</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../../api';
import type { SpotDetail } from '../../types';

const tabs = [
  { value: '', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'pending', label: '待审核' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'archived', label: '已下架' },
] as const;

const spots = ref<SpotDetail[]>([]);
const status = ref<string>('');
const kw = ref('');

const counts = computed(() => {
  const c: Record<string, number> = { '': spots.value.length };
  for (const s of spots.value) c[s.status] = (c[s.status] || 0) + 1;
  return c;
});
const filtered = computed(() => {
  let list = spots.value;
  if (status.value) list = list.filter((s) => s.status === status.value);
  const k = kw.value.trim().toLowerCase();
  if (k) list = list.filter((s) => [s.name, s.address, s.region].join(' ').toLowerCase().includes(k));
  return list;
});

async function load() {
  spots.value = await api.admin.spots();
}
onMounted(load);
watch(status, () => {});

function statusLabel(s: string) {
  return { published: '已发布', pending: '待审核', rejected: '已拒绝', archived: '已下架' }[s] ?? s;
}
function sourceLabel(s: string) {
  return s === 'creator' ? '制作者' : s === 'user' ? '网友投稿' : '网络采集';
}

async function setStatus(s: SpotDetail, next: string) {
  let note: string | undefined;
  if (next === 'rejected') {
    note = window.prompt('拒绝原因（会显示在管理端，选填）：') ?? undefined;
  }
  await api.admin.setStatus(s.id, next, note);
  await load();
}
async function remove(s: SpotDetail) {
  if (!window.confirm(`确定删除「${s.name}」？照片将一并删除，不可恢复。`)) return;
  await api.admin.remove(s.id);
  await load();
}
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
h1 {
  font-size: 20px;
  margin: 0;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.tab {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
}
.tab.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.tab .n {
  opacity: 0.75;
  margin-left: 4px;
  font-size: 12px;
}
.search {
  width: 220px;
}
.mini-info {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 2px;
}
.theme-dot {
  display: inline-block;
  color: #fff;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  margin-right: 4px;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
.ops {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.empty {
  text-align: center;
  color: var(--muted);
  padding: 30px 0 !important;
}
.cover.none {
  display: block;
}
</style>
