<template>
  <div class="page">
    <header class="topbar">
      <RouterLink class="brand" to="/" @click="closePanel">
        <span class="logo">📷</span>
        <b>{{ state.site.name }}</b>
        <span class="sub" v-if="state.site.description && !isMobile">{{ state.site.description }}</span>
      </RouterLink>
      <div class="actions">
        <RouterLink class="btn primary" to="/submit">＋ 我要投稿</RouterLink>
        <RouterLink class="btn ghost" to="/admin" title="管理端">⚙️ 管理</RouterLink>
      </div>
    </header>

    <div class="mapwrap">
      <MapView :spots="filteredSpots" :selected-id="state.selectedId" @select="onSelect" />
      <FilterBar />

      <div v-if="!state.loaded && !state.loadError" class="loading">地图数据加载中…</div>
      <div v-if="state.loadError" class="loading error">
        ⚠️ {{ state.loadError }}
        <button class="btn" @click="loadAll">重试</button>
      </div>

      <DetailPanel v-if="state.selectedId" :id="state.selectedId" @close="closePanel" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';
import MapView from '../components/MapView.vue';
import FilterBar from '../components/FilterBar.vue';
import DetailPanel from '../components/DetailPanel.vue';
import { filteredSpots, loadAll, state } from '../store';

const route = useRoute();
const router = useRouter();
const isMobile = computed(() => window.innerWidth < 900);

onMounted(loadAll);

// 路由 → 选中态（深链 /spot/:id）
watch(
  () => route.params.id,
  (id) => {
    state.selectedId = id ? Number(id) : null;
  },
  { immediate: true }
);

// 选中态 → 路由（点击点位推入历史，返回键可关闭）
watch(
  () => state.selectedId,
  (id) => {
    const current = route.params.id ? Number(route.params.id) : null;
    if (current === id) return;
    router.push({ path: id ? `/spot/${id}` : '/', query: route.query });
  }
);

// 过滤条件 → URL 查询串（可分享）
watch(
  () => state.filters,
  (f) => {
    const query: Record<string, string> = {};
    if (f.themes.length) query.themes = f.themes.join(',');
    if (f.months.length) query.months = f.months.join(',');
    if (f.q.trim()) query.q = f.q.trim();
    if (route.path === '/' || route.path.startsWith('/spot/')) {
      router.replace({ query });
    }
  },
  { deep: true }
);

// URL 查询串 → 过滤条件（进入/分享时还原；后续变化保持同步）
function applyQueryToFilters(q: LocationQuery) {
  state.filters.themes = String(q.themes ?? '').split(',').filter(Boolean);
  state.filters.months = String(q.months ?? '')
    .split(',')
    .map(Number)
    .filter((n) => n >= 1 && n <= 12);
  state.filters.q = String(q.q ?? '');
}
watch(() => route.query, applyQueryToFilters);
applyQueryToFilters(route.query);

function onSelect(id: number) {
  state.selectedId = id;
}
function closePanel() {
  state.selectedId = null;
}
</script>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.topbar {
  flex: none;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  z-index: 10;
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  text-decoration: none;
  color: var(--text);
  min-width: 0;
}
.brand .logo {
  font-size: 18px;
  align-self: center;
}
.brand b {
  font-size: 16.5px;
}
.brand .sub {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  gap: 8px;
  flex: none;
}
.mapwrap {
  flex: 1;
  position: relative;
}
.loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9;
  background: var(--panel);
  border: 1px solid var(--border);
  padding: 14px 22px;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  display: flex;
  gap: 12px;
  align-items: center;
}
.loading.error {
  color: var(--danger);
}
@media (max-width: 768px) {
  .topbar {
    padding: 0 10px;
  }
  .brand .sub {
    display: none;
  }
}
</style>
