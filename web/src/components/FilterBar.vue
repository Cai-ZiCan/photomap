<template>
  <div class="filterbar">
    <div class="f-search">
      <span class="icon">🔍</span>
      <input v-model="state.filters.q" placeholder="搜索点位 / 地址 / 专题…" />
      <button v-if="state.filters.q" class="clear" @click="state.filters.q = ''" title="清空搜索">✕</button>
      <span class="count" :title="`当前筛选 ${filteredSpots.length} 个点位`">{{ filteredSpots.length }}</span>
    </div>
    <div class="f-chips">
      <button class="chip" :class="{ active: state.filters.months.length }" @click="monthsOpen = !monthsOpen">
        📅 月份<span v-if="state.filters.months.length">·{{ state.filters.months.length }}</span>
      </button>
      <button
        v-for="t in state.themes"
        :key="t.slug"
        class="chip theme"
        :class="{ active: state.filters.themes.includes(t.slug) }"
        :style="state.filters.themes.includes(t.slug) ? { background: t.color, borderColor: t.color } : {}"
        @click="toggleTheme(t.slug)"
      >
        <i>{{ t.icon }}</i>{{ t.name }}
      </button>
      <button v-if="hasActiveFilters" class="chip ghost" @click="clearFilters">清除全部</button>
    </div>

    <div v-if="monthsOpen" class="months-pop">
      <button
        v-for="m in 12"
        :key="m"
        class="month"
        :class="{ on: state.filters.months.includes(m) }"
        @click="toggleMonth(m)"
      >{{ m }}月</button>
      <div class="months-foot">
        <button class="link" @click="state.filters.months = []">不限</button>
        <button class="link strong" @click="monthsOpen = false">完成</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { clearFilters, filteredSpots, hasActiveFilters, state } from '../store';

const monthsOpen = ref(false);

function toggleTheme(slug: string) {
  const list = state.filters.themes;
  const i = list.indexOf(slug);
  if (i >= 0) list.splice(i, 1);
  else list.push(slug);
}
function toggleMonth(m: number) {
  const list = state.filters.months;
  const i = list.indexOf(m);
  if (i >= 0) list.splice(i, 1);
  else list.push(m);
}
</script>

<style scoped>
.filterbar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(560px, calc(100% - 130px));
}
.f-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  height: 38px;
}
.f-search .icon {
  font-size: 13px;
  opacity: 0.6;
}
.f-search input {
  border: none;
  outline: none;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  background: transparent;
  color: var(--text);
}
.f-search .clear {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--muted);
  padding: 2px 4px;
}
.f-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel);
  font-size: 12.5px;
  color: var(--text);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
}
.chip.theme.active {
  color: #fff;
}
.chip.ghost {
  color: var(--muted);
  border-style: dashed;
}
.chip i {
  font-style: normal;
}
.count {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--primary);
  padding: 3px 9px;
  border-radius: 999px;
  margin-left: 2px;
}
.months-pop {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
  width: 232px;
}
.month {
  padding: 6px 0;
  text-align: center;
  font-size: 12.5px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.month.on {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.months-foot {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
}
.link {
  border: none;
  background: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12.5px;
}
.link.strong {
  color: var(--primary);
  font-weight: 600;
}
@media (max-width: 768px) {
  .filterbar {
    max-width: calc(100% - 24px);
  }
  .f-chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .count {
    display: none;
  }
}
</style>
