<template>
  <Transition name="drawer">
    <aside v-if="spot" class="detail">
      <button class="close" title="关闭 (Esc)" @click="emit('close')">✕</button>

      <div v-if="error" class="error">
        <p>⚠️ {{ error }}</p>
        <button class="btn" @click="emit('close')">关闭</button>
      </div>

      <template v-else>
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
      </template>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../api';
import { wgs84ToBd09, wgs84ToGcj02 } from '../lib/coord';
import type { SpotDetail } from '../types';
import MonthStrip from './MonthStrip.vue';

const props = defineProps<{ id: number }>();
const emit = defineEmits<{ close: [] }>();

const spot = ref<SpotDetail | null>(null);
const error = ref('');
const idx = ref(0);

const photos = computed(() => spot.value?.photos ?? []);

// 文案作者标注：网友投稿 → @昵称；网络采集 → 来源说明/原文链接；制作者原创不标
const textCredit = computed(() => {
  const s = spot.value;
  if (!s) return null;
  if (s.source === 'user' && s.submitter_name) {
    return { label: `@${s.submitter_name}`, href: null };
  }
  if (s.source === 'crawler') {
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
    spot.value = null;
    error.value = '';
    idx.value = 0;
    try {
      spot.value = await api.spot(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败';
    }
  },
  { immediate: true }
);

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
  if (e.key === 'Escape') emit('close');
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
