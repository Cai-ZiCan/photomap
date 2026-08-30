<template>
  <div class="page">
    <header class="topbar">
      <RouterLink class="brand" to="/">
        <span class="logo">📷</span><b>{{ state.site.name }}</b>
      </RouterLink>
      <RouterLink class="btn ghost" to="/">← 返回地图</RouterLink>
    </header>

    <main class="wrap">
      <div v-if="submitted" class="card done">
        <div class="big">✅</div>
        <h2>投稿已提交</h2>
        <p>感谢你的分享！管理员审核通过后，点位就会出现在地图上。</p>
        <div class="row">
          <RouterLink class="btn primary" to="/">返回地图</RouterLink>
          <button class="btn" @click="reset">再投一个</button>
        </div>
      </div>

      <form v-else class="card" @submit.prevent="submit">
        <h1>推荐摄影点位</h1>
        <p class="lead">分享你发现的赏花、秋叶、星空……好机位。提交后经管理员审核即会发布。</p>

        <label class="field">
          <span>点位名称 *</span>
          <input v-model="form.name" maxlength="80" placeholder="如：居庸关长城·开往春天的列车观景点" required />
        </label>

        <div class="field">
          <span>位置 *</span>
          <LocationPicker v-model="location" />
        </div>

        <label class="field">
          <span>地址</span>
          <input v-model="form.address" maxlength="200" placeholder="详细地址（选填）" />
        </label>

        <label class="field">
          <span>介绍</span>
          <textarea v-model="form.description" maxlength="4000" rows="4" placeholder="这里能拍什么？最佳机位、光线、注意事项……"></textarea>
        </label>

        <div class="field">
          <span>专题（可多选）</span>
          <div class="chips">
            <button
              v-for="t in state.themes"
              :key="t.slug"
              type="button"
              class="chip"
              :class="{ active: form.themes.includes(t.slug) }"
              :style="form.themes.includes(t.slug) ? { background: t.color, borderColor: t.color } : {}"
              @click="toggleTheme(t.slug)"
            >{{ t.icon }}{{ t.name }}</button>
          </div>
        </div>

        <div class="field">
          <span>最佳观赏月份</span>
          <div class="chips">
            <button
              v-for="m in 12"
              :key="m"
              type="button"
              class="chip month"
              :class="{ active: form.months.includes(m) }"
              @click="toggleMonth(m)"
            >{{ m }}月</button>
          </div>
        </div>

        <div class="grid2">
          <label class="field">
            <span>你的昵称</span>
            <input v-model="form.submitter_name" maxlength="40" placeholder="将展示在点位来源中" />
          </label>
          <label class="field">
            <span>联系邮箱（选填）</span>
            <input v-model="form.submitter_contact" type="email" maxlength="120" placeholder="仅支持邮箱（仅管理员可见）" />
          </label>
        </div>

        <div class="field">
          <span>照片（最多 {{ maxFiles }} 张，单张 ≤ {{ maxMb }}MB）</span>
          <input ref="fileEl" type="file" accept="image/*" multiple @change="onFiles" />
          <div v-if="previews.length" class="previews">
            <div v-for="(p, i) in previews" :key="i" class="pv">
              <img :src="p.url" />
              <button type="button" class="pv-x" @click="removeFile(i)">✕</button>
            </div>
          </div>
        </div>

        <!-- 蜜罐字段：人类不可见 -->
        <input v-model="form.website" class="hp" name="website" tabindex="-1" autocomplete="off" />

        <p v-if="errorMsg" class="err">⚠️ {{ errorMsg }}</p>

        <button class="btn primary big" type="submit" :disabled="submitting">
          {{ submitting ? '提交中…' : '提交投稿' }}
        </button>
      </form>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import { loadAll, state } from '../store';
import LocationPicker from '../components/LocationPicker.vue';

const maxMb = 10;
const maxFiles = 9;

const form = reactive({
  name: '',
  address: '',
  description: '',
  themes: [] as string[],
  months: [] as number[],
  submitter_name: '',
  submitter_contact: '',
  website: '',
});
const location = ref<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
const files = ref<File[]>([]);
const previews = ref<{ url: string; file: File }[]>([]);
const fileEl = ref<HTMLInputElement>();
const submitting = ref(false);
const submitted = ref(false);
const errorMsg = ref('');

onMounted(async () => {
  if (!state.loaded) await loadAll();
});

function toggleTheme(slug: string) {
  const i = form.themes.indexOf(slug);
  if (i >= 0) form.themes.splice(i, 1);
  else form.themes.push(slug);
}
function toggleMonth(m: number) {
  const i = form.months.indexOf(m);
  if (i >= 0) form.months.splice(i, 1);
  else form.months.push(m);
}

function onFiles(e: Event) {
  const list = Array.from((e.target as HTMLInputElement).files ?? []);
  errorMsg.value = '';
  for (const f of list) {
    if (files.value.length >= maxFiles) {
      errorMsg.value = `最多上传 ${maxFiles} 张照片`;
      break;
    }
    if (f.size > maxMb * 1024 * 1024) {
      errorMsg.value = `「${f.name}」超过 ${maxMb}MB，已跳过`;
      continue;
    }
    files.value.push(f);
    previews.value.push({ url: URL.createObjectURL(f), file: f });
  }
  if (fileEl.value) fileEl.value.value = '';
}
function removeFile(i: number) {
  URL.revokeObjectURL(previews.value[i].url);
  files.value.splice(i, 1);
  previews.value.splice(i, 1);
}

function reset() {
  form.name = '';
  form.address = '';
  form.description = '';
  form.themes = [];
  form.months = [];
  form.submitter_name = '';
  form.submitter_contact = '';
  location.value = { lat: null, lng: null };
  previews.value.forEach((p) => URL.revokeObjectURL(p.url));
  files.value = [];
  previews.value = [];
  submitted.value = false;
}

async function submit() {
  errorMsg.value = '';
  if (!form.name.trim()) return (errorMsg.value = '请填写点位名称');
  if (location.value.lat == null || location.value.lng == null) return (errorMsg.value = '请在地图上点选位置');
  const contact = form.submitter_contact.trim();
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return (errorMsg.value = '联系方式仅支持邮箱，请填写有效的邮箱地址');
  }

  const fd = new FormData();
  fd.set('name', form.name);
  fd.set('lat', String(location.value.lat));
  fd.set('lng', String(location.value.lng));
  fd.set('address', form.address);
  fd.set('description', form.description);
  fd.set('themes', form.themes.join(','));
  fd.set('months', form.months.join(','));
  fd.set('submitter_name', form.submitter_name);
  fd.set('submitter_contact', form.submitter_contact);
  fd.set('website', form.website);
  for (const f of files.value) fd.append('photos', f);

  try {
    submitting.value = true;
    await api.submit(fd);
    submitted.value = true;
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '提交失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}
.topbar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--text);
}
.wrap {
  max-width: 680px;
  margin: 0 auto;
  padding: 24px 16px 60px;
}
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 26px 28px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
}
h1 {
  margin: 0 0 6px;
  font-size: 20px;
}
.lead {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 13.5px;
}
.field {
  display: block;
  margin-bottom: 16px;
}
.field > span {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text);
}
input[type='text'],
input:not([type]),
input[type='email'],
input[type='number'],
textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  font-size: 13.5px;
  font-family: inherit;
  background: #fff;
}
textarea {
  resize: vertical;
}
input:focus,
textarea:focus {
  outline: 2px solid var(--primary-weak);
  border-color: var(--primary);
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.chip {
  padding: 6px 13px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.chip.active {
  color: #fff;
}
.chip.month.active {
  background: var(--primary);
  border-color: var(--primary);
}
.previews {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}
.pv {
  position: relative;
}
.pv img {
  width: 86px;
  height: 64px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.pv-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
}
.hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.err {
  color: var(--danger);
  font-size: 13px;
  margin: 4px 0 12px;
}
.done {
  text-align: center;
  padding: 48px 28px;
}
.done .big {
  font-size: 46px;
}
.row {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 18px;
}
@media (max-width: 640px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
  .card {
    padding: 20px 16px;
  }
}
</style>
