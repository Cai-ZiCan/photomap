<template>
  <div v-if="ready">
    <div class="head">
      <h1>{{ isNew ? '新建点位' : `编辑：${form.name || '…'}` }}</h1>
      <div class="row">
        <span v-if="!isNew" class="badge" :class="form.status">{{ statusLabel(form.status) }}</span>
        <RouterLink class="btn ghost" to="/admin/spots">← 列表</RouterLink>
      </div>
    </div>

    <form class="edit" @submit.prevent="save">
      <div class="col">
        <label class="field">
          <span>名称 *</span>
          <input v-model="form.name" maxlength="80" required placeholder="点位名称" />
        </label>

        <label class="field">
          <span>介绍</span>
          <textarea v-model="form.description" rows="5" maxlength="4000" placeholder="看点、拍摄内容、机位建议……"></textarea>
        </label>

        <div class="field">
          <span>位置 *（WGS-84，地图选点自动纠偏）</span>
          <LocationPicker v-model="location" />
        </div>

        <div class="grid2">
          <label class="field"><span>地址</span><input v-model="form.address" maxlength="200" /></label>
          <label class="field"><span>行政区</span><input v-model="form.region" maxlength="60" placeholder="如：北京市昌平区" /></label>
        </div>

        <label class="field"><span>拍摄贴士</span><textarea v-model="form.tips" rows="2" maxlength="1000"></textarea></label>

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
          <label class="field"><span>来源链接</span><input v-model="form.source_url" maxlength="500" placeholder="https://…" /></label>
          <label class="field"><span>来源标注</span><input v-model="form.source_note" maxlength="200" placeholder="如：图片来源：×××" /></label>
        </div>
        <div class="grid2" v-if="!isNew">
          <label class="field"><span>状态</span>
            <select v-model="form.status">
              <option value="published">已发布</option>
              <option value="pending">待审核</option>
              <option value="rejected">已拒绝</option>
              <option value="archived">已下架</option>
            </select>
          </label>
          <label class="field"><span>投稿人（仅记录）</span><input v-model="form.submitter_name" maxlength="40" /></label>
        </div>

        <p v-if="error" class="err">⚠️ {{ error }}</p>
        <div class="row">
          <button class="btn primary big" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
          <button v-if="!isNew" class="btn danger big" type="button" @click="remove">删除点位</button>
        </div>
      </div>

      <div class="col side" v-if="!isNew">
        <h2>照片（{{ form.photos.length }}）</h2>
        <input type="file" accept="image/*" multiple @change="uploadPhotos" :disabled="uploading" />
        <p v-if="uploading" class="muted">上传处理中…</p>

        <div v-for="(p, i) in form.photos" :key="p.id" class="photo">
          <img :src="p.thumb" />
          <div class="pinfo">
            <input class="cap" :value="p.caption" placeholder="图片说明（选填）" @change="savePhoto(p, $event)" />
            <input class="cap" :value="p.credit" placeholder="图片作者（选填，前台显示署名）" @change="saveCredit(p, $event)" />
            <div class="pops">
              <button type="button" class="btn mini" @click="move(i, -1)" :disabled="i === 0">↑</button>
              <button type="button" class="btn mini" @click="move(i, 1)" :disabled="i === form.photos.length - 1">↓</button>
              <button
                type="button"
                class="btn mini"
                :class="{ ok: form.featured_photo_id === p.id }"
                @click="setFeatured(p)"
              >封面</button>
              <button type="button" class="btn mini danger" @click="deletePhoto(p)">删除</button>
            </div>
          </div>
        </div>
        <p v-if="!form.photos.length" class="muted">暂无照片，建议至少上传 1 张作为封面（地图悬停展示）。</p>

        <h2 class="group-title">同点位关联</h2>
        <p v-if="form.group_key" class="muted">
          ✅ 已并入同一点位组：前台合并为一个图标（显示被并入的目标点位），详情栏可翻页查看组内每条记录。
        </p>
        <p v-else class="muted">
          未手动并入的记录，按「名称相同」自动合并展示；空间相近但名称不同的，在下方逐条确认后手动并入 ——
          <b>点哪条就只并入哪条</b>，不会影响其他记录。
        </p>
        <div v-if="!form.group_key && nearby.length" class="near-list">
          <div v-for="n in nearby" :key="n.id" class="near-row">
            <span class="near-name" :title="n.name">{{ n.name }}</span>
            <span class="muted">{{ n.distance }}m · {{ statusLabel(n.status) }}</span>
            <button
              type="button"
              class="btn mini"
              :disabled="!canMergeInto(n)"
              :title="mergeTitle(n)"
              @click="mergeInto(n.id)"
            >并入</button>
          </div>
        </div>
        <p v-else-if="!form.group_key && nearbyLoaded && !nearby.length" class="muted">200 米内没有其他点位记录。</p>
        <div v-if="form.group_key" class="pops">
          <button type="button" class="btn mini" @click="unmerge">解除关联</button>
        </div>
      </div>
    </form>
  </div>
  <p v-else class="muted pad">加载中…</p>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api';
import { loadAll, state } from '../../store';
import type { NearbySpot, SpotDetail, SpotPhoto } from '../../types';
import LocationPicker from '../../components/LocationPicker.vue';

const route = useRoute();
const router = useRouter();

const id = computed(() => (route.params.id ? Number(route.params.id) : null));
const isNew = computed(() => id.value === null);

const ready = ref(false);
const saving = ref(false);
const uploading = ref(false);
const error = ref('');

const form = reactive({
  name: '',
  description: '',
  address: '',
  region: '',
  tips: '',
  themes: [] as string[],
  months: [] as number[],
  source_url: '',
  source_note: '',
  submitter_name: '',
  status: 'published',
  photos: [] as SpotPhoto[],
  featured_photo_id: null as number | null,
  group_key: null as string | null,
});
const location = ref<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

const nearby = ref<NearbySpot[]>([]);
const nearbyLoaded = ref(false);

onMounted(async () => {
  if (!state.loaded) await loadAll();
  if (!isNew.value) {
    const list = await api.admin.spots();
    const s = list.find((x) => x.id === id.value);
    if (!s) {
      error.value = '点位不存在';
      ready.value = true;
      return;
    }
    fillForm(s);
    loadNearby();
  }
  ready.value = true;
});

async function loadNearby() {
  try {
    nearby.value = await api.admin.nearbySpots(id.value!);
  } catch {
    nearby.value = [];
  } finally {
    nearbyLoaded.value = true;
  }
}

/** 已发布的点位不能并入未发布的：那样公开地图上看不出任何变化 */
function canMergeInto(n: NearbySpot) {
  return n.status === 'published' || form.status !== 'published';
}
function mergeTitle(n: NearbySpot) {
  return canMergeInto(n)
    ? `并入「${n.name}」`
    : '目标未发布：并入后在公开地图不会生效，请先发布该点位';
}

async function mergeInto(targetId: number) {
  error.value = '';
  try {
    const s = await api.admin.mergeSpot(id.value!, targetId);
    form.group_key = s.group_key ?? null;
    loadNearby();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '并入失败';
  }
}

async function unmerge() {
  error.value = '';
  try {
    const s = await api.admin.unmergeSpot(id.value!);
    form.group_key = s.group_key ?? null;
    loadNearby();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '解除关联失败';
  }
}

function fillForm(s: SpotDetail) {
  form.name = s.name;
  form.description = s.description;
  form.address = s.address;
  form.region = s.region;
  form.tips = s.tips;
  form.themes = s.themes.map((t) => t.slug);
  form.months = [...s.months];
  form.source_url = s.source_url;
  form.source_note = s.source_note;
  form.submitter_name = s.submitter_name;
  form.status = s.status;
  form.photos = s.photos;
  form.featured_photo_id = s.featured_photo_id;
  form.group_key = s.group_key ?? null;
  location.value = { lat: s.lat, lng: s.lng };
}

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

async function save() {
  error.value = '';
  if (!form.name.trim()) return (error.value = '请填写名称');
  if (location.value.lat == null || location.value.lng == null) return (error.value = '请选择位置');
  const payload = {
    name: form.name,
    description: form.description,
    lat: location.value.lat,
    lng: location.value.lng,
    address: form.address,
    region: form.region,
    tips: form.tips,
    themes: form.themes,
    months: form.months,
    source_url: form.source_url,
    source_note: form.source_note,
    submitter_name: form.submitter_name,
    status: form.status,
  };
  try {
    saving.value = true;
    if (isNew.value) {
      const s = await api.admin.create(payload);
      router.replace(`/admin/spots/${s.id}`);
    } else {
      const s = await api.admin.update(id.value!, payload);
      form.photos = s.photos;
      form.featured_photo_id = s.featured_photo_id;
      error.value = '';
      window.alert('已保存');
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!window.confirm('确定删除该点位及其全部照片？不可恢复。')) return;
  await api.admin.remove(id.value!);
  router.replace('/admin/spots');
}

/* ---- 照片管理 ---- */

async function uploadPhotos(e: Event) {
  const list = Array.from((e.target as HTMLInputElement).files ?? []);
  if (!list.length) return;
  const fd = new FormData();
  for (const f of list) fd.append('photos', f);
  try {
    uploading.value = true;
    const s = await api.admin.addPhotos(id.value!, fd);
    form.photos = s.photos;
    form.featured_photo_id = s.featured_photo_id;
  } finally {
    uploading.value = false;
    (e.target as HTMLInputElement).value = '';
  }
}

async function savePhoto(p: SpotPhoto, e: Event) {
  const caption = (e.target as HTMLInputElement).value;
  const s = await api.admin.updatePhoto(p.id, { caption });
  form.photos = s.photos;
}

async function saveCredit(p: SpotPhoto, e: Event) {
  const credit = (e.target as HTMLInputElement).value;
  const s = await api.admin.updatePhoto(p.id, { credit });
  form.photos = s.photos;
}

async function move(i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= form.photos.length) return;
  const a = form.photos[i];
  const b = form.photos[j];
  await Promise.all([
    api.admin.updatePhoto(a.id, { sort: j }),
    api.admin.updatePhoto(b.id, { sort: i }),
  ]);
  const s = await api.admin.spots().then((list) => list.find((x) => x.id === id.value));
  if (s) form.photos = s.photos;
}

async function setFeatured(p: SpotPhoto) {
  const s = await api.admin.setFeatured(id.value!, p.id);
  form.featured_photo_id = s.featured_photo_id;
}

async function deletePhoto(p: SpotPhoto) {
  if (!window.confirm('删除这张照片？')) return;
  const s = await api.admin.deletePhoto(p.id);
  form.photos = s.photos;
  form.featured_photo_id = s.featured_photo_id;
}

function statusLabel(s: string) {
  return { published: '已发布', pending: '待审核', rejected: '已拒绝', archived: '已下架' }[s] ?? s;
}
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
h1 {
  font-size: 19px;
  margin: 0;
}
h2 {
  font-size: 15px;
  margin: 0 0 10px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.edit {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr);
  gap: 22px;
  align-items: start;
}
.col {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
}
.field {
  display: block;
  margin-bottom: 14px;
}
.field > span {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 5px;
}
.field input,
.field textarea,
.field select {
  width: 100%;
  box-sizing: border-box;
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
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #fff;
  font-size: 12.5px;
  cursor: pointer;
}
.chip.active {
  color: #fff;
}
.chip.month.active {
  background: var(--primary);
  border-color: var(--primary);
}
.err {
  color: var(--danger);
  font-size: 13px;
}
.photo {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f5;
}
.photo img {
  width: 84px;
  height: 62px;
  object-fit: cover;
  border-radius: 7px;
  flex: none;
}
.pinfo {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.pinfo .cap {
  width: 100%;
  font-size: 12.5px;
}
.pops {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.group-title {
  margin-top: 18px;
}
.near-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.near-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.near-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  color: var(--muted);
  font-size: 12.5px;
}
.pad {
  padding: 20px;
}
@media (max-width: 980px) {
  .edit {
    grid-template-columns: 1fr;
  }
}
</style>
