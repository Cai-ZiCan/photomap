<template>
  <div class="locpicker">
    <div ref="mapEl" class="locmap"></div>
    <div class="locrow">
      <label>纬度 lat
        <input type="number" step="0.000001" :value="modelValue?.lat ?? ''" @input="onInputLat" />
      </label>
      <label>经度 lng
        <input type="number" step="0.000001" :value="modelValue?.lng ?? ''" @input="onInputLng" />
      </label>
    </div>
    <p class="hint">在地图上点击选点；坐标已自动在高德(GCJ-02)与 WGS-84 间纠偏换算。</p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { Vector as VectorSource } from 'ol/source.js';
import { Vector as VectorLayer } from 'ol/layer.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { Icon, Style } from 'ol/style.js';
import { basemapDefs } from '../lib/basemaps';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../lib/coord';

const props = defineProps<{ modelValue: { lat: number | null; lng: number | null } }>();
const emit = defineEmits<{ 'update:modelValue': [v: { lat: number | null; lng: number | null }] }>();

const mapEl = ref<HTMLDivElement>();
let map: OlMap | null = null;
let marker: Feature<Point>;
let source: VectorSource;
let updating = false;

const pinSvg =
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path d="M18 1C8.6 1 1 8.6 1 18c0 12.1 17 27 17 27s17-14.9 17-27C35 8.6 27.4 1 18 1z" fill="#2563eb" stroke="#fff" stroke-width="2"/><circle cx="18" cy="17.5" r="6" fill="#fff"/></svg>'
  )}`;

function markerStyle() {
  return new Style({
    image: new Icon({ src: pinSvg, scale: 1, anchor: [0.5, 1], anchorXUnits: 'fraction', anchorYUnits: 'fraction' }),
  });
}

function setMarker(lngWgs: number, latWgs: number) {
  const [glng, glat] = wgs84ToGcj02(lngWgs, latWgs);
  marker.setGeometry(new Point(fromLonLat([glng, glat])));
}

function emitValue(lat: number | null, lng: number | null) {
  updating = true;
  emit('update:modelValue', { lat, lng });
  updating = false;
}

function onMapClick(e: { coordinate: number[] }) {
  const [lon, lat] = toLonLat(e.coordinate);
  const [wlng, wlat] = gcj02ToWgs84(lon, lat);
  const rounded = { lat: Number(wlat.toFixed(6)), lng: Number(wlng.toFixed(6)) };
  emitValue(rounded.lat, rounded.lng);
  setMarker(rounded.lng, rounded.lat);
}

function onInputLat(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value);
  emitValue(Number.isFinite(v) ? v : null, props.modelValue?.lng ?? null);
}
function onInputLng(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value);
  emitValue(props.modelValue?.lat ?? null, Number.isFinite(v) ? v : null);
}

watch(
  () => props.modelValue,
  (v) => {
    if (updating || !v || v.lat === null || v.lng === null) return;
    setMarker(v.lng, v.lat);
  },
  { deep: true }
);

onMounted(() => {
  source = new VectorSource();
  marker = new Feature(new Point(fromLonLat([105, 36])));
  marker.setStyle(markerStyle());
  source.addFeature(marker);

  map = new OlMap({
    target: mapEl.value!,
    layers: [...basemapDefs[0].create(), new VectorLayer({ source, zIndex: 10 })],
    view: new View({ center: fromLonLat([105, 36]), zoom: 4 }),
  });
  map.on('click', onMapClick);

  const v = props.modelValue;
  if (v?.lat != null && v?.lng != null) {
    setMarker(v.lng, v.lat);
    map.getView().setCenter(fromLonLat(wgs84ToGcj02(v.lng, v.lat)));
    map.getView().setZoom(11);
  }
});

onBeforeUnmount(() => {
  map?.setTarget(undefined);
  map = null;
});
</script>

<style scoped>
.locmap {
  height: 300px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.locrow {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.locrow label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--muted);
}
.locrow input {
  width: 130px;
}
.hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
