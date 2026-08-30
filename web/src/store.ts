import { computed, reactive } from 'vue';
import { api } from './api';
import type { SpotListItem, Theme } from './types';

export interface Filters {
  themes: string[];
  months: number[];
  q: string;
}

export const state = reactive({
  site: { name: '摄影地图', description: '' },
  themes: [] as Theme[],
  spots: [] as SpotListItem[],
  loaded: false,
  loadError: '',
  basemapId: 'gaode',
  filters: { themes: [], months: [], q: '' } as Filters,
  selectedId: null as number | null,
});

function matchQ(spot: SpotListItem, q: string) {
  if (!q) return true;
  const hay = [spot.name, spot.address, spot.region, ...spot.themes.map((t) => t.name)]
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

export const filteredSpots = computed(() =>
  state.spots.filter((s) => {
    if (state.filters.themes.length && !s.themes.some((t) => state.filters.themes.includes(t.slug))) return false;
    if (state.filters.months.length && !s.months.some((m) => state.filters.months.includes(m))) return false;
    return matchQ(s, state.filters.q.trim());
  })
);

export const hasActiveFilters = computed(
  () => state.filters.themes.length > 0 || state.filters.months.length > 0 || state.filters.q.trim() !== ''
);

export function clearFilters() {
  state.filters.themes = [];
  state.filters.months = [];
  state.filters.q = '';
}

export async function loadAll() {
  state.loadError = '';
  try {
    const [site, themes, spots] = await Promise.all([
      api.site(),
      api.themes(),
      api.spots().then((d) => d.features.map((f) => f.properties)),
    ]);
    state.site = site;
    state.themes = themes;
    state.spots = spots;
    state.loaded = true;
  } catch (e) {
    state.loadError = e instanceof Error ? e.message : String(e);
  }
}
