<template>
  <div class="map-shell">
    <div ref="mapEl" class="map"></div>

    <!-- 悬停提示：代表图 + 点位名 -->
    <div ref="tipEl" class="map-tip" v-show="tipVisible && tip">
      <img v-if="tip?.thumb" :src="tip.thumb" alt="" draggable="false" />
      <div class="map-tip-text">
        <b>{{ tip?.title }}</b>
        <span>{{ tip?.sub }}</span>
      </div>
    </div>

    <!-- 右上角工具：底图切换 + 全览 -->
    <div class="map-toolbar">
      <button
        v-for="b in basemapOptions"
        :key="b.id"
        class="tb-btn"
        :class="{ active: state.basemapId === b.id }"
        :title="b.name"
        @click="setBasemap(b.id)"
      >{{ b.short }}</button>
      <button class="tb-btn home" title="全览所有点位" @click="goHome">⌂</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { Vector as VectorSource } from 'ol/source.js';
import { Vector as VectorLayer } from 'ol/layer.js';
import type TileLayer from 'ol/layer/Tile.js';
import Cluster from 'ol/source/Cluster.js';
import Overlay from 'ol/Overlay.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from 'ol/style.js';
import type { FeatureLike } from 'ol/Feature.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { FullScreen, ScaleLine, defaults as defaultControls } from 'ol/control.js';
import { createEmpty, extend as extendExtent, isEmpty } from 'ol/extent.js';
import { state } from '../store';
import { availableBasemaps, getBasemap } from '../lib/basemaps';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../lib/coord';
import type { SpotListItem, SpotSibling } from '../types';

const props = defineProps<{ spots: SpotListItem[]; selectedId: number | null }>();
const emit = defineEmits<{ select: [id: number] }>();

const mapEl = ref<HTMLDivElement>();
const tipEl = ref<HTMLDivElement>();
const tipVisible = ref(false);
const basemapOptions = computed(() => availableBasemaps());

/** 聚合半径（像素），与 Cluster 的 distance 保持一致 */
const CLUSTER_DIST = 44;

interface TipModel {
  title: string;
  sub: string;
  thumb: string | null;
}

const tip = ref<TipModel | null>(null);

let map: OlMap | null = null;
let vectorSource: VectorSource;
let vectorLayer: VectorLayer<Cluster>;
let overlay: Overlay;
const baseLayers = new Map<string, TileLayer[]>();

/* ---------- 样式 ---------- */

const pinCache = new Map<string, string>();
function pinDataUrl(color: string): string {
  const cached = pinCache.get(color);
  if (cached) return cached;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="54" viewBox="0 0 42 54">` +
    `<path d="M21 1C10 1 1.5 9.5 1.5 20.5 1.5 34 21 53 21 53s19.5-19 19.5-32.5C40.5 9.5 32 1 21 1z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>` +
    `<circle cx="21" cy="20" r="7.5" fill="#ffffff"/></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  pinCache.set(color, url);
  return url;
}

/** 当前选中项是否落在该要素（或它代表的同点位分组）里 */
function isSelected(spot: SpotListItem): boolean {
  if (props.selectedId == null) return false;
  if (spot.id === props.selectedId) return true;
  return (spot.siblings ?? []).some((s) => s.id === props.selectedId);
}

/**
 * 图标渲染的两种形态，判据是「放大后能不能拆开」：
 *
 * 1. 只是低缩放层级下显得近的**多个不同点位**（放大后能拆开）
 *    → 保留传统的**带数字聚合圆**，数字 = 点位数。
 * 2. 合并 / 同名 / 同坐标，放大到最大也拆不开的（就是「同一个定位」）
 *    → 渲染成和**单条机位一模一样**的图标，不出现任何数字。
 */
function styleFn(feature: FeatureLike): Style | Style[] {
  const feats = (feature.get('features') as Feature[] | undefined) ?? [];
  if (feats.length === 0) return new Style();
  const many = feats.length > 1;
  if (many && canSplitByZoom(feats)) return clusterStyle(feats);
  return pinStyle(many ? pickDisplaySpot(feats) : (feats[0].get('spot') as SpotListItem));
}

/** 低层级下多个点位凑近了：带数字的聚合圆 */
function clusterStyle(feats: Feature[]): Style {
  const selected = feats.some((f) => {
    const s = f.get('spot') as SpotListItem | undefined;
    return !!s && isSelected(s);
  });
  return new Style({
    image: new CircleStyle({
      radius: selected ? 18 : 15,
      fill: new Fill({ color: dominantColor(feats) }),
      stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
    }),
    text: new Text({
      text: String(feats.length),
      font: `bold ${selected ? 15 : 13}px system-ui, sans-serif`,
      fill: new Fill({ color: '#ffffff' }),
      offsetY: 1,
    }),
    zIndex: selected ? 20 : undefined,
  });
}

/** 聚合圆配色：取成员里出现最多的专题色 */
function dominantColor(feats: Feature[]): string {
  const counts = new Map<string, number>();
  for (const f of feats) {
    const c = (f.get('spot') as SpotListItem)?.themes?.[0]?.color || '#2b7de9';
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let best = '#2b7de9';
  let n = 0;
  for (const [c, k] of counts) if (k > n) { best = c; n = k; }
  return best;
}

/** 单个图标的样式：并入了几条记录一律不体现在图标上 */
function pinStyle(spot: SpotListItem): Style {
  const color = spot.themes?.[0]?.color || '#2b7de9';
  const selected = isSelected(spot);
  return new Style({
    image: new Icon({
      src: pinDataUrl(color),
      scale: selected ? 1.35 : 1.05,
      anchor: [0.5, 1],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
    }),
    zIndex: selected ? 20 : undefined,
  });
}

/**
 * 同位置多条记录共用一个图标时，展示哪条：
 * 有封面的优先，其次 id 最小 —— 与服务端选组代表的规则保持一致。
 */
function pickDisplaySpot(feats: Feature[]): SpotListItem {
  const spots = feats
    .map((f) => f.get('spot') as SpotListItem | undefined)
    .filter((s): s is SpotListItem => !!s);
  if (!spots.length) return feats[0].get('spot') as SpotListItem;
  return spots.find((s) => s.cover) ?? spots.slice().sort((a, b) => a.id - b.id)[0];
}

/* ---------- 记录展开与聚合拆分判定 ---------- */

/**
 * 把同位置的若干要素展开成「记录」列表（含每个分组内部的成员），
 * 写入 store 后供详情栏翻页器跨记录切换。
 */
function expandRecords(feats: Feature[]): SpotSibling[] {
  const out: SpotSibling[] = [];
  const seen = new Set<number>();
  for (const f of feats) {
    const spot = f.get('spot') as SpotListItem | undefined;
    if (!spot) continue;
    const members = spot.siblings?.length
      ? spot.siblings
      : [{ id: spot.id, name: spot.name, coverThumb: spot.coverThumb }];
    for (const m of members) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ id: m.id, name: m.name, coverThumb: m.coverThumb ?? spot.coverThumb ?? null });
    }
  }
  return out;
}

/**
 * 这些要素在最大缩放级别下是否还能靠像素距离拆开。
 * 拆不开 = 同一位置的多条记录 —— 地图上按一个普通图标显示，点击直接进详情翻页；
 * 拆得开 = 真正的多个点位挤在一起 —— 聚合圆 + 数字，点击放大。
 */
function canSplitByZoom(feats: Feature[]): boolean {
  if (!map || feats.length < 2) return false;
  const view = map.getView();
  const res = view.getResolutionForZoom(view.getMaxZoom());
  if (!res) return false;
  const ext = createEmpty();
  for (const f of feats) extendExtent(ext, f.getGeometry()!.getExtent());
  const px = Math.max((ext[2] - ext[0]) / res, (ext[3] - ext[1]) / res);
  return px > CLUSTER_DIST * 1.2;
}

/* ---------- 坐标与要素 ---------- */

function toDisplay(lng: number, lat: number): [number, number] {
  const def = getBasemap(state.basemapId);
  return def.gcj ? wgs84ToGcj02(lng, lat) : [lng, lat];
}

function rebuild() {
  if (!vectorSource) return;
  const features = props.spots.map((s) => {
    const [lng, lat] = toDisplay(s.lng, s.lat);
    const f = new Feature({ geometry: new Point(fromLonLat([lng, lat])), spot: s });
    f.setId(s.id);
    return f;
  });
  vectorSource.clear();
  vectorSource.addFeatures(features);
  hideTip();
}

watch(() => props.spots, rebuild);
watch(
  () => props.selectedId,
  () => vectorLayer?.changed()
);

/* ---------- 底图 ---------- */

function applyBasemapVisibility(id: string) {
  for (const [bid, ls] of baseLayers) ls.forEach((l) => l.setVisible(bid === id));
}

function setBasemap(id: string) {
  if (!map || id === state.basemapId) return;
  const oldDef = getBasemap(state.basemapId);
  const newDef = getBasemap(id);
  const view = map.getView();
  const [lon, lat] = toLonLat(view.getCenter()!);
  let converted = [lon, lat];
  if (oldDef.gcj && !newDef.gcj) converted = gcj02ToWgs84(lon, lat);
  if (!oldDef.gcj && newDef.gcj) converted = wgs84ToGcj02(lon, lat);
  view.setCenter(fromLonLat(converted));
  state.basemapId = id;
  applyBasemapVisibility(id);
  rebuild();
}

function goHome() {
  if (!map) return;
  const ext = createEmpty();
  for (const f of vectorSource.getFeatures()) extendExtent(ext, f.getGeometry()!.getExtent());
  if (!isEmpty(ext)) {
    map.getView().fit(ext, { padding: [70, 70, 70, 70], maxZoom: 12, duration: 300 });
  } else {
    map.getView().animate({ center: fromLonLat([105.5, 36.5]), zoom: 4.2, duration: 300 });
  }
}

/* ---------- 交互 ---------- */

function isTouch(e: MapBrowserEvent<PointerEvent | MouseEvent | WheelEvent>) {
  return 'pointerType' in e.originalEvent && e.originalEvent.pointerType === 'touch';
}

function hideTip() {
  tipVisible.value = false;
  tip.value = null;
  overlay?.setPosition(undefined);
}

function onPointerMove(e: MapBrowserEvent<PointerEvent | MouseEvent | WheelEvent>) {
  if (!map) return;
  if (e.dragging || isTouch(e)) return;
  const hit = map.forEachFeatureAtPixel(e.pixel, (f) => f);
  const el = map.getTargetElement() as HTMLElement;
  if (!hit || !hit.get('features')) {
    el.style.cursor = '';
    hideTip();
    return;
  }
  el.style.cursor = 'pointer';
  const feats = hit.get('features') as Feature[];

  // 悬停提示同样按「能不能放大拆开」区分：
  // 只是低层级凑近的多个点位 → 保留「N 个点位」的数字提示；
  // 同一位置的多条记录 → 与单条记录完全一样，不出现任何数量数字。
  const splittable = feats.length > 1 && canSplitByZoom(feats);
  const spot = pickDisplaySpot(feats);
  tip.value = {
    title: splittable ? `${feats.length} 个点位` : spot.name,
    sub: splittable
      ? '点击放大查看'
      : spot.themes.map((t) => `${t.icon}${t.name}`).join('　'),
    thumb: spot.coverThumb ?? null,
  };
  const geom = hit.getGeometry();
  if (geom) overlay.setPosition((geom as Point).getCoordinates());
  tipVisible.value = true;
}

/** 同位置多条记录：写入选中态共享数据，供详情栏翻页器跨记录导航 */
function registerCoLocated(feats: Feature[]): SpotListItem {
  const display = pickDisplaySpot(feats);
  const list = expandRecords(feats);
  if (list.length > 1) {
    for (const it of list) state.coLocatedById[it.id] = list;
  }
  return display;
}

function onClick(e: MapBrowserEvent<PointerEvent | MouseEvent | WheelEvent>) {
  if (!map) return;
  const hit = map.forEachFeatureAtPixel(e.pixel, (f) => f);
  if (!hit || !hit.get('features')) return;
  const feats = hit.get('features') as Feature[];

  if (feats.length > 1) {
    if (canSplitByZoom(feats)) {
      // 真正的多个点位：展开视野避开左侧过滤栏与右侧详情栏
      const ext = createEmpty();
      for (const f of feats) extendExtent(ext, f.getGeometry()!.getExtent());
      if (!isEmpty(ext)) {
        const padTop = 80;
        const padRight = props.selectedId ? 440 : 60;
        const padBottom = 60;
        const padLeft = 360;
        map.getView().fit(ext, {
          padding: [padTop, padRight, padBottom, padLeft],
          maxZoom: map.getView().getMaxZoom(),
          duration: 250,
        });
      }
      return;
    }
    // 同一位置的多条记录 → 表现得和单条记录一样：直接打开详情栏翻页
    emit('select', registerCoLocated(feats).id);
    return;
  }

  emit('select', (feats[0].get('spot') as SpotListItem).id);
}

/* ---------- 生命周期 ---------- */

onMounted(() => {
  vectorSource = new VectorSource();
  const clusterSource = new Cluster({ distance: CLUSTER_DIST, source: vectorSource });
  vectorLayer = new VectorLayer<Cluster>({ source: clusterSource, style: styleFn, zIndex: 10 });

  const layers: TileLayer[] = [];
  for (const def of availableBasemaps()) {
    const ls = def.create();
    baseLayers.set(def.id, ls);
    layers.push(...ls);
  }

  map = new OlMap({
    target: mapEl.value!,
    layers: [...layers, vectorLayer],
    view: new View({ center: fromLonLat([105.5, 36.5]), zoom: 4.2, minZoom: 3, maxZoom: 18 }),
    controls: defaultControls({ attributionOptions: { collapsible: true } }).extend([
      new ScaleLine({ units: 'metric' }),
      new FullScreen(),
    ]),
  });

  overlay = new Overlay({
    element: tipEl.value!,
    positioning: 'bottom-center',
    offset: [0, -12],
    stopEvent: false,
  });
  map.addOverlay(overlay);

  map.on('pointermove', onPointerMove);
  map.on('click', onClick);

  applyBasemapVisibility(state.basemapId);
  rebuild();
});

onBeforeUnmount(() => {
  map?.setTarget(undefined);
  map = null;
});
</script>

<style scoped>
.map-shell {
  position: absolute;
  inset: 0;
}
.map {
  position: absolute;
  inset: 0;
  background: #dfe7ef;
}
.map-toolbar {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tb-btn {
  min-width: 44px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.tb-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.tb-btn.home {
  font-size: 17px;
  line-height: 1;
}
.map-tip {
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: 240px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}
.map-tip img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 7px;
  flex: none;
}
.map-tip-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.map-tip-text b {
  font-size: 13px;
  line-height: 1.3;
  color: var(--text);
}
.map-tip-text span {
  font-size: 11px;
  color: var(--muted);
}

</style>
