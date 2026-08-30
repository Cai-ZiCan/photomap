<template>
  <div class="map-shell">
    <div ref="mapEl" class="map"></div>

    <!-- 悬停提示：代表图 + 点位名 -->
    <div ref="tipEl" class="map-tip" v-show="tipVisible && tipSpot">
      <img v-if="tipSpot?.coverThumb" :src="tipSpot.coverThumb" alt="" draggable="false" />
      <div class="map-tip-text">
        <b>{{ tipSpot?.name }}</b>
        <span v-if="tipSpot?.themes?.length">{{ tipSpot.themes.map((t) => `${t.icon}${t.name}`).join('　') }}</span>
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
import type { SpotListItem } from '../types';

const props = defineProps<{ spots: SpotListItem[]; selectedId: number | null }>();
const emit = defineEmits<{ select: [id: number] }>();

const mapEl = ref<HTMLDivElement>();
const tipEl = ref<HTMLDivElement>();
const tipVisible = ref(false);
const tipSpot = ref<SpotListItem | null>(null);
const basemapOptions = computed(() => availableBasemaps());

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

function styleFn(feature: FeatureLike): Style | Style[] {
  const feats = (feature.get('features') as Feature[] | undefined) ?? [];
  if (feats.length === 0) return new Style();
  if (feats.length > 1) {
    const color = dominantColor(feats);
    return new Style({
      image: new CircleStyle({
        radius: 15,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#ffffff', width: 2.5 }),
      }),
      text: new Text({
        text: String(feats.length),
        font: 'bold 13px system-ui, sans-serif',
        fill: new Fill({ color: '#ffffff' }),
        offsetY: 1,
      }),
    });
  }
  const spot = feats[0].get('spot') as SpotListItem;
  const color = spot.themes?.[0]?.color || '#2b7de9';
  const selected = spot.id === props.selectedId;
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
  tipSpot.value = null;
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
  if (feats.length !== 1) {
    hideTip();
    return;
  }
  const spot = feats[0].get('spot') as SpotListItem;
  tipSpot.value = spot;
  overlay.setPosition(feats[0].getGeometry()!.getCoordinates());
  tipVisible.value = true;
}

function onClick(e: MapBrowserEvent<PointerEvent | MouseEvent | WheelEvent>) {
  if (!map) return;
  const hit = map.forEachFeatureAtPixel(e.pixel, (f) => f);
  if (!hit || !hit.get('features')) return;
  const feats = hit.get('features') as Feature[];
  if (feats.length > 1) {
    const ext = createEmpty();
    for (const f of feats) extendExtent(ext, f.getGeometry()!.getExtent());
    if (!isEmpty(ext)) {
      // 展开视野避开左侧过滤栏与右侧详情栏
      const padTop = 80;
      const padRight = props.selectedId ? 440 : 60;
      const padBottom = 60;
      const padLeft = 360;
      map.getView().fit(ext, { padding: [padTop, padRight, padBottom, padLeft], maxZoom: 14, duration: 250 });
    }
    return;
  }
  const spot = feats[0].get('spot') as SpotListItem;
  emit('select', spot.id);
}

/* ---------- 生命周期 ---------- */

onMounted(() => {
  vectorSource = new VectorSource();
  const clusterSource = new Cluster({ distance: 44, source: vectorSource });
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
