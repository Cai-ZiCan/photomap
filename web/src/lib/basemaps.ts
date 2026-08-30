import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';

export interface BaseMapDef {
  id: string;
  name: string;
  short: string;
  /** 瓦片是否处于 GCJ-02 偏移空间（高德系列为 true） */
  gcj: boolean;
  /** 仅当配置了对应 key 时可用 */
  requiresKey?: 'tianditu';
  create: () => TileLayer[];
}

const TIANDITU_KEY = (import.meta.env.VITE_TIANDITU_KEY as string | undefined) || '';

/** 瓦片加载失败自动重试（免 key 社区瓦片源偶发抖动的兜底） */
function retryLoader(retries = 2) {
  return (tile: unknown, src: string) => {
    const t = tile as { getImage?: () => HTMLImageElement };
    const img = t.getImage?.();
    if (!img) return;
    let attempt = 0;
    const setSrc = () => {
      img.src = src;
    };
    img.onerror = () => {
      if (attempt < retries) {
        attempt += 1;
        setTimeout(setSrc, 300 * attempt);
      }
    };
    setSrc();
  };
}

function gaodeVector(): TileLayer[] {
  const urls = [1, 2, 3, 4].map(
    (n) => `https://webrd0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`
  );
  return [
    new TileLayer({
      source: new XYZ({ urls, tileLoadFunction: retryLoader(), maxZoom: 18, attributions: '© 高德地图' }),
    }),
  ];
}

function gaodeSatellite(): TileLayer[] {
  const base = [1, 2, 3, 4].map((n) => `https://webst0${n}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}`);
  const roads = [1, 2, 3, 4].map((n) => `https://webst0${n}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}`);
  return [
    new TileLayer({ source: new XYZ({ urls: base, tileLoadFunction: retryLoader(), maxZoom: 18, attributions: '© 高德地图' }) }),
    new TileLayer({ source: new XYZ({ urls: roads, tileLoadFunction: retryLoader(), maxZoom: 18 }) }),
  ];
}

function osm(): TileLayer[] {
  return [
    new TileLayer({
      source: new XYZ({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        tileLoadFunction: retryLoader(),
        maxZoom: 19,
        attributions: '© OpenStreetMap contributors',
      }),
    }),
  ];
}

function tianditu(): TileLayer[] {
  const mk = (type: string) =>
    new TileLayer({
      source: new XYZ({
        url: `https://t0.tianditu.gov.cn/DataServer?T=${type}&x={x}&y={y}&l={z}&tk=${TIANDITU_KEY}`,
        tileLoadFunction: retryLoader(),
        maxZoom: 18,
        attributions: '© 天地图',
      }),
    });
  return [mk('vec_w'), mk('cva_w')];
}

export const basemapDefs: BaseMapDef[] = [
  { id: 'gaode', name: '高德地图（标准）', short: '标准', gcj: true, create: gaodeVector },
  { id: 'gaode-sat', name: '高德卫星影像', short: '卫星', gcj: true, create: gaodeSatellite },
  { id: 'tianditu', name: '天地图', short: '天地图', gcj: false, requiresKey: 'tianditu', create: tianditu },
  { id: 'osm', name: 'OpenStreetMap', short: 'OSM', gcj: false, create: osm },
];

export function availableBasemaps(): BaseMapDef[] {
  return basemapDefs.filter((d) => d.requiresKey !== 'tianditu' || !!TIANDITU_KEY);
}

export function getBasemap(id: string): BaseMapDef {
  return availableBasemaps().find((d) => d.id === id) ?? availableBasemaps()[0];
}
