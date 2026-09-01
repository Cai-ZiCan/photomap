<template>
  <Transition name="drawer">
    <aside v-if="spot" class="detail">
      <button class="close" title="关闭 (Esc)" @click="emit('close')">✕</button>

      <div v-if="error" class="error">
        <p>⚠️ {{ error }}</p>
        <button class="btn" @click="emit('close')">关闭</button>
      </div>

      <template v-else>
        <div v-if="pagerList.length > 1" class="pager">
          <button class="pg-btn" title="上一条 (←)" :disabled="pagerIndex <= 0" @click="go(-1)">‹</button>
          <span class="pg-ind">{{ pagerIndex + 1 }}/{{ pagerList.length }}</span>
          <button class="pg-btn" title="下一条 (→)" :disabled="pagerIndex >= pagerList.length - 1" @click="go(1)">›</button>
        </div>

        <Transition :name="direction === 'prev' ? 'slide-prev' : 'slide-next'" mode="out-in">
          <div
            :key="spot.id"
            class="page"
            @pointerdown="onPointerDown"
            @pointerup="onPointerUp"
            @pointercancel="tracking = false"
          >
            <div v-if="spot.photos.length" class="gallery">
              <div class="main-frame">
                <img class="main" :src="photos[idx].path" :alt="spot.name" />
                <span
                  v-if="photos[idx].credit"
                  class="credit"
                  :title="'图片作者：' + photos[idx].credit"
                >📷 {{ photos[idx].credit }}</span>
              </div>
              <div v-if="spot.photos.length > 1" class="thumbs">
                <img
                  v-for="(p, i) in photos"
                  :key="p.id"
                  :src="p.thumb"
                  :class="{ active: i === idx }"
                  loading="lazy"
                  @click="idx = i"
                />
              </div>
            </div>
            <div v-else class="gallery placeholder" :style="{ background: gradient }">
              <span>{{ spot.themes[0]?.icon || '📷' }}</span>
            </div>

            <div class="body">
              <h2>{{ spot.name }}</h2>
              <div class="tags">
                <span v-for="t in spot.themes" :key="t.slug" class="tag" :style="{ background: t.color }">
                  {{ t.icon }}{{ t.name }}
                </span>
              </div>

              <div class="months-row">
                <label>最佳月份</label>
                <MonthStrip :months="spot.months" :color="spot.themes[0]?.color || 'var(--primary)'" />
                <span v-if="!spot.months.length" class="muted">全年可拍</span>
              </div>

              <p v-if="spot.description" class="desc">{{ spot.description }}</p>
              <p v-if="spot.description && textCredit" class="text-credit">
                <span class="tc-dash">——</span>
                <span class="tc-label">文案</span>
                <a v-if="textCredit.href" :href="textCredit.href" target="_blank" rel="noopener">{{ textCredit.label }}</a>
                <span v-else>{{ textCredit.label }}</span>
              </p>

              <div v-if="spot.address" class="kv"><label>地址</label><span>{{ spot.address }}</span></div>
              <div v-if="spot.tips" class="kv"><label>贴士</label><span>{{ spot.tips }}</span></div>

              <div class="actions">
                <a class="btn primary" :href="amapUrl" target="_blank" rel="noopener">🧭 高德导航</a>
                <a class="btn" :href="baiduUrl" target="_blank" rel="noopener">百度地图</a>
                <button class="btn" @click="copyCoord">复制坐标</button>
              </div>

              <div class="source">
                <label>来源</label>
                <span v-if="spot.source === 'creator'">
                  制作者收录{{ spot.source_note ? ` · ${spot.source_note}` : '' }}
                </span>
                <span v-else-if="spot.source === 'user'">
                  网友投稿{{ spot.submitter_name ? ` · ${spot.submitter_name}` : '' }}（经审核）
                </span>
                <span v-else>
                  网络采集<template v-if="spot.source_url"> · <a :href="spot.source_url" target="_blank" rel="noopener">查看原文</a></template>{{ spot.source_note ? ` · ${spot.source_note}` : '' }}
                </span>
              </div>
            </div>
          </div>
        </Transition>
      </template>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../api';
import { state } from '../store';
import { wgs84ToBd09, wgs84ToGcj02 } from '../lib/coord';
import type { SpotDetail } from '../types';
import MonthStrip from './MonthStrip.vue';

const props = defineProps<{ id: number }>();
const emit = defineEmits<{ close: []; navigate: [id: number] }>();

const spot = ref<SpotDetail | null>(null);
const error = ref('');
const idx = ref(0);
const direction = ref<'next' | 'prev'>('next');

const photos = computed(() => spot.value?.photos ?? []);

// 同点位的不同分享记录（同名/手动并入的已发布点位），供侧滑翻页
const siblings = computed(() => spot.value?.siblings ?? []);
// 同位置（坐标相同/极近）的其它记录：来自 MapView 选择浮层，未被合并进同组也允许在面板内翻页
const coLocated = computed(() => state.coLocatedById[spot.value?.id ?? -1] ?? []);
// 翻页器列表：同位置记录（按选择浮层顺序）优先；否则已合并的同组（>1 时才有意义）
const pagerList = computed(() => {
  if (coLocated.value.length > 1) return coLocated.value;
  return siblings.value.length > 1 ? siblings.value : [];
});
const pagerIndex = computed(() => pagerList.value.findIndex((s) => s.id === props.id));

function go(dir: -1 | 1) {
  const list = pagerList.value;
  const cur = pagerIndex.value;
  if (!list.length || cur < 0) return;
  const next = cur + dir;
  if (next < 0 || next >= list.length) return;
  direction.value = dir > 0 ? 'next' : 'prev';
  emit('navigate', list[next].id);
}

// 文案作者标注：网友投稿 → @昵称；网络采集 → 原文作者，其次来源说明/原文链接；制作者原创不标
const textCredit = computed(() => {
  const s = spot.value;
  if (!s) return null;
  // 库里可能存了带 @ 的昵称，展示统一只加一个前缀
  const author = s.submitter_name.replace(/^@/, '').trim();
  if (s.source === 'user' && author) {
    return { label: `@${author}`, href: null };
  }
  if (s.source === 'crawler') {
    if (author) return { label: `@${author}`, href: s.source_url || null };
    let label = s.source_note || '';
    if (!label && s.source_url) {
      try { label = `整理自 ${new URL(s.source_url).hostname}`; } catch { label = '整理自网络'; }
    }
    if (!label) return null;
    return { label, href: s.source_url || null };
  }
  return null;
});
const gradient = computed(() => {
  const c = spot.value?.themes[0]?.color || '#2b7de9';
  return `linear-gradient(135deg, ${c}55, ${c})`;
});

watch(
  () => props.id,
  async (id) => {
    error.value = '';
    idx.value = 0;
    if (spot.value?.id === id) return;
    try {
      // 翻页时保留旧内容由过渡动画接管，避免侧栏整体闪烁
      spot.value = await api.spot(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败';
    }
  },
  { immediate: true }
);

/* ---- 侧滑翻页（水平滑动 >60px 切换同点位记录，不影响纵向滚动） ---- */
let startX = 0;
let startY = 0;
const tracking = ref(false);

function onPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
  startX = e.clientX;
  startY = e.clientY;
  tracking.value = true;
}
function onPointerUp(e: PointerEvent) {
  if (!tracking.value) return;
  tracking.value = false;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    go(dx < 0 ? 1 : -1);
  }
}

const amapUrl = computed(() => {
  if (!spot.value) return '#';
  const [lng, lat] = wgs84ToGcj02(spot.value.lng, spot.value.lat);
  return `https://uri.amap.com/marker?position=${lng.toFixed(6)},${lat.toFixed(6)}&name=${encodeURIComponent(spot.value.name)}&src=photomap&coordinate=gaode&callnative=1`;
});
const baiduUrl = computed(() => {
  if (!spot.value) return '#';
  const [lng, lat] = wgs84ToBd09(spot.value.lng, spot.value.lat);
  return `https://api.map.baidu.com/marker?location=${lat.toFixed(6)},${lng.toFixed(6)}&title=${encodeURIComponent(spot.value.name)}&content=${encodeURIComponent(spot.value.address || spot.value.name)}&output=html&src=photomap`;
});

async function copyCoord() {
  if (!spot.value) return;
  const text = `${spot.value.lng.toFixed(6)}, ${spot.value.lat.toFixed(6)} (WGS-84)`;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt('复制以下坐标：', text);
  }
}

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'Escape') emit('close');
  else if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'ArrowRight') go(1);
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.detail {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(400px, 92%);
  background: var(--panel);
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.22);
  z-index: 8;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.close {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}
/* 同点位记录翻页器：左上角悬浮胶囊，翻页时位置固定不随内容滑动 */
.pager {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  padding: 4px 10px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
}
.pg-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
  color: var(--text);
  padding: 0 3px;
}
.pg-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.pg-ind {
  font-size: 12px;
  color: var(--text);
  min-width: 28px;
  text-align: center;
}
.error {
  padding: 40px 20px;
  text-align: center;
  color: var(--muted);
}
.gallery {
  position: relative;
  flex: none;
}
.gallery .main {
  width: 100%;
  height: 230px;
  object-fit: cover;
  display: block;
  background: #eef1f4;
}
.main-frame {
  position: relative;
}
.gallery.placeholder {
  height: 150px;
  display: grid;
  place-items: center;
  font-size: 44px;
}
.thumbs {
  display: flex;
  gap: 6px;
  padding: 8px 12px 0;
  overflow-x: auto;
}
.thumbs img {
  width: 52px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  flex: none;
}
.thumbs img.active {
  border-color: var(--primary);
}
/* 图片作者：主图底端 50% 不透明度矮胶囊条 */
.credit {
  position: absolute;
  left: 10px;
  bottom: 10px;
  max-width: calc(100% - 20px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  padding: 6px 10px;
  border-radius: 999px;
  backdrop-filter: blur(3px);
  pointer-events: none;
}
.body {
  padding: 14px 16px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.body h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.35;
  color: var(--text);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag {
  color: #fff;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
}
.months-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.months-row label,
.kv label,
.source label {
  font-size: 12px;
  color: var(--muted);
  flex: none;
}
.muted {
  font-size: 12px;
  color: var(--muted);
}
.desc {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text);
  white-space: pre-line; /* 保留导入笔记的原有分段 */
}
/* 文案作者：正文末尾标注行 */
.text-credit {
  margin: -6px 0 0;
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
  color: var(--muted);
}
.text-credit .tc-dash {
  color: var(--border);
  letter-spacing: -1px;
}
.text-credit .tc-label {
  flex: none;
  font-size: 11px;
  line-height: 1;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 7px;
}
.text-credit a {
  color: var(--primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-credit a:hover {
  text-decoration: underline;
}
.kv {
  display: flex;
  gap: 10px;
  font-size: 13px;
  line-height: 1.6;
}
.kv span {
  color: var(--text);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.source {
  display: flex;
  gap: 10px;
  align-items: baseline;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.source a {
  color: var(--primary);
}

.drawer-enter-active,
.drawer-leave-active {
  /* 仅位移、不渐隐：避免动画期间透出底图工具栏 */
  transition: transform 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(40px);
}

/* 同点位记录侧滑切换 */
.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.slide-next-enter-from {
  transform: translateX(46px);
  opacity: 0;
}
.slide-next-leave-to {
  transform: translateX(-46px);
  opacity: 0;
}
.slide-prev-enter-from {
  transform: translateX(-46px);
  opacity: 0;
}
.slide-prev-leave-to {
  transform: translateX(46px);
  opacity: 0;
}

@media (max-width: 768px) {
  .detail {
    top: auto;
    left: 0;
    width: 100%;
    height: 62vh;
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.25);
    border-radius: 16px 16px 0 0;
  }
  .gallery .main {
    height: 180px;
  }
  .drawer-enter-active,
  .drawer-leave-active {
    transition: transform 0.28s ease;
  }
  .drawer-enter-from,
  .drawer-leave-to {
    transform: translateY(60%);
    opacity: 1;
  }
}
</style>
