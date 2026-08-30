<template>
  <div>
    <h1>链接导入 · AI 辅助提取</h1>

    <div v-if="!cfg?.ai.enabled" class="notice">
      <b>⚠️ AI 功能未启用</b>
      <p>
        在 <code>server/.env</code> 中配置后重启服务即可（其余功能不受影响）：
      </p>
      <pre>AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AI_API_KEY=你的密钥
AI_TEXT_MODEL=glm-4-flash
AI_VISION_MODEL=glm-4v-plus</pre>
      <p class="muted">支持任何 OpenAI 兼容接口；密钥也可在对应平台免费申请。</p>
    </div>

    <template v-else>
      <div class="tabs">
        <button class="tab" :class="{ active: mode === 'url' }" @click="mode = 'url'">🔗 网页链接</button>
        <button class="tab" :class="{ active: mode === 'text' }" @click="mode = 'text'">📝 粘贴文本</button>
      </div>

      <div class="card">
        <label v-if="mode === 'url'" class="field">
          <span>网页链接（微信公众号文章、博客、旅游攻略等）</span>
          <input v-model="url" placeholder="https://mp.weixin.qq.com/s/…" />
        </label>
        <label v-else class="field">
          <span>文本内容（聊天记录里的点位描述、游记片段等）</span>
          <textarea v-model="text" rows="6" placeholder="粘贴与点位相关的文字……"></textarea>
        </label>
        <button class="btn primary" :disabled="extracting" @click="extract">
          {{ extracting ? '抓取并提取中…（最长约 1 分钟）' : '🤖 抓取并 AI 提取' }}
        </button>
        <p v-if="error" class="err">⚠️ {{ error }}</p>
      </div>

      <div v-if="result" class="card result">
        <h2>提取结果 <span class="muted" v-if="result.title">｜来源标题：{{ result.title }}</span></h2>

        <div class="grid2">
          <label class="field"><span>名称</span><input v-model="draft.name" /></label>
          <label class="field"><span>行政区</span><input v-model="draft.region" placeholder="如：浙江省杭州市西湖区" /></label>
        </div>
        <label class="field"><span>介绍</span><textarea v-model="draft.description" rows="4"></textarea></label>
        <label class="field"><span>地址</span><input v-model="draft.address" /></label>
        <label class="field"><span>贴士</span><textarea v-model="draft.tips" rows="2"></textarea></label>
        <div class="grid2">
          <label class="field"><span>建议专题（逗号分隔，会自动匹配已有专题）</span><input v-model="themesText" /></label>
          <label class="field"><span>最佳月份（逗号分隔 1-12）</span><input v-model="monthsText" /></label>
        </div>

        <div v-if="result.images.length" class="field">
          <span>选择要下载的图片（点选为封面，最多 9 张）</span>
          <div class="imgs">
            <label v-for="(img, i) in result.images" :key="img" class="imgpick">
              <img :src="img" loading="lazy" @error="hideImg" />
              <div class="imgops">
                <input type="checkbox" :value="img" v-model="pickedImages" />
                <input type="radio" name="cover" :checked="coverImage === img" @change="coverImage = img" title="设为封面" />
              </div>
            </label>
          </div>
          <p class="muted">勾选 = 下载；单选 = 封面。下载失败的图会自动跳过并提示。</p>
        </div>

        <div class="field">
          <span>位置 *（AI 通常给不出坐标，请在下方地图点选大致位置）</span>
          <LocationPicker v-model="location" />
        </div>

        <div class="row">
          <button class="btn primary big" :disabled="importing" @click="doImport">
            {{ importing ? '下载图片并保存中…' : '💾 保存为待审核草稿' }}
          </button>
          <button class="btn big" @click="resetAll">放弃</button>
        </div>
        <p v-if="importError" class="err">⚠️ {{ importError }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api';
import type { AdminConfig, AiExtractResult, AiDraft } from '../../types';
import LocationPicker from '../../components/LocationPicker.vue';

const router = useRouter();
const cfg = ref<AdminConfig | null>(null);
const mode = ref<'url' | 'text'>('url');
const url = ref('');
const text = ref('');
const extracting = ref(false);
const importing = ref(false);
const error = ref('');
const importError = ref('');
const result = ref<AiExtractResult | null>(null);
const draft = reactive<AiDraft>({ name: '', description: '', address: '', region: '', themes: [], months: [], tips: '' });
const pickedImages = ref<string[]>([]);
const coverImage = ref('');
const location = ref<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

const themesText = computed({
  get: () => draft.themes.join('，'),
  set: (v: string) => (draft.themes = v.split(/[，,、]/).map((s) => s.trim()).filter(Boolean)),
});
const monthsText = computed({
  get: () => draft.months.join(','),
  set: (v: string) =>
    (draft.months = v
      .split(/[，,、\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => n >= 1 && n <= 12)),
});

onMounted(async () => {
  cfg.value = await api.admin.config();
});

function hideImg(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}

function resetAll() {
  result.value = null;
  url.value = '';
  text.value = '';
  pickedImages.value = [];
  coverImage.value = '';
  location.value = { lat: null, lng: null };
  Object.assign(draft, { name: '', description: '', address: '', region: '', themes: [], months: [], tips: '' });
}

async function extract() {
  error.value = '';
  result.value = null;
  try {
    extracting.value = true;
    const r = await api.admin.aiExtract(mode.value === 'url' ? { url: url.value } : { text: text.value });
    result.value = r;
    Object.assign(draft, r.draft);
    pickedImages.value = r.images.slice(0, Math.min(6, r.images.length));
    coverImage.value = r.images[0] ?? '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '提取失败';
  } finally {
    extracting.value = false;
  }
}

async function doImport() {
  importError.value = '';
  if (!draft.name.trim()) return (importError.value = '名称不能为空');
  if (location.value.lat == null || location.value.lng == null)
    return (importError.value = '请在地图上点选大致位置');
  const images = coverImage.value
    ? [coverImage.value, ...pickedImages.value.filter((u) => u !== coverImage.value)]
    : pickedImages.value;
  try {
    importing.value = true;
    const r = await api.admin.import({
      ...draft,
      lat: location.value.lat,
      lng: location.value.lng,
      source_url: draft.source_url ?? (mode.value === 'url' ? url.value : ''),
      images,
    });
    router.push({ name: 'admin-review', query: { imported: r.id } });
  } catch (e) {
    importError.value = e instanceof Error ? e.message : '导入失败';
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
h1 {
  font-size: 20px;
  margin: 0 0 14px;
}
h2 {
  font-size: 15px;
  margin: 0 0 12px;
}
.notice {
  background: #fdf3e0;
  border: 1px solid #f0d9a8;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.notice b {
  color: #b97c14;
}
.notice p {
  margin: 8px 0;
  font-size: 13px;
}
.notice pre {
  background: #1d2530;
  color: #d8e2ee;
  padding: 12px 16px;
  border-radius: 9px;
  font-size: 12.5px;
  overflow-x: auto;
}
.muted {
  color: var(--muted);
  font-size: 12.5px;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.tab {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 9px;
  padding: 8px 16px;
  font-size: 13.5px;
  cursor: pointer;
}
.tab.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 16px;
}
.card input,
.card textarea {
  width: 100%;
  box-sizing: border-box;
}
.field {
  display: block;
  margin-bottom: 13px;
}
.field > span {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 5px;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.imgpick {
  position: relative;
  width: 108px;
}
.imgpick img {
  width: 108px;
  height: 76px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #eef1f4;
}
.imgops {
  display: flex;
  gap: 8px;
  margin-top: 3px;
  font-size: 12px;
}
.row {
  display: flex;
  gap: 10px;
}
.err {
  color: var(--danger);
  font-size: 13px;
}
@media (max-width: 700px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
</style>
