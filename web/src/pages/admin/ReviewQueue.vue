<template>
  <div>
    <h1>审核队列 <span class="muted" v-if="list.length">（{{ list.length }} 条待处理）</span></h1>

    <p v-if="!list.length" class="empty">✅ 暂无待审核内容。网友投稿与链接导入的草稿会出现在这里。</p>

    <div v-for="s in list" :key="s.id" class="card">
      <div class="cover-col">
        <img v-if="s.coverThumb" :src="s.coverThumb" />
        <div v-else class="noimg">无图</div>
      </div>
      <div class="info">
        <div class="title-row">
          <b>{{ s.name }}</b>
          <span class="badge" :class="s.source">{{ sourceLabel(s.source) }}</span>
        </div>
        <div class="meta">
          <span v-if="s.region">{{ s.region }}</span>
          <span>{{ s.lat.toFixed(4) }}, {{ s.lng.toFixed(4) }}</span>
          <span v-if="s.submitter_name">投稿人：{{ s.submitter_name }}</span>
          <span>{{ s.created_at }}</span>
        </div>
        <p v-if="s.description" class="desc">{{ s.description }}</p>
        <div class="thumbs">
          <img v-for="p in s.photos" :key="p.id" :src="p.thumb" loading="lazy" />
        </div>
        <div v-if="s.source_url" class="src">原文：<a :href="s.source_url" target="_blank" rel="noopener">{{ s.source_url }}</a></div>
        <div v-if="s.review_note" class="note">备注：{{ s.review_note }}</div>
      </div>
      <div class="ops">
        <button class="btn ok" @click="approve(s)">✓ 通过发布</button>
        <RouterLink class="btn" :to="`/admin/spots/${s.id}`">编辑后发布</RouterLink>
        <button class="btn danger" @click="reject(s)">✕ 拒绝</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../api';
import type { SpotDetail } from '../../types';

const list = ref<SpotDetail[]>([]);

onMounted(load);
async function load() {
  list.value = await api.admin.spots({ status: 'pending' });
}

function sourceLabel(s: string) {
  return s === 'creator' ? '制作者' : s === 'user' ? '网友投稿' : '网络采集';
}

async function approve(s: SpotDetail) {
  await api.admin.setStatus(s.id, 'published');
  await load();
}
async function reject(s: SpotDetail) {
  const note = window.prompt(`拒绝「${s.name}」的原因（选填，仅管理端可见）：`) ?? '';
  await api.admin.setStatus(s.id, 'rejected', note);
  await load();
}
</script>

<style scoped>
h1 {
  font-size: 20px;
  margin: 0 0 16px;
}
.muted {
  font-size: 13px;
  color: var(--muted);
  font-weight: 400;
}
.empty {
  color: var(--muted);
  background: var(--panel);
  border: 1px dashed var(--border);
  padding: 40px;
  border-radius: 12px;
  text-align: center;
}
.card {
  display: flex;
  gap: 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 14px;
  align-items: flex-start;
}
.cover-col img,
.noimg {
  width: 110px;
  height: 82px;
  object-fit: cover;
  border-radius: 8px;
  flex: none;
}
.noimg {
  display: grid;
  place-items: center;
  background: #eef1f4;
  color: var(--muted);
  font-size: 12px;
}
.info {
  flex: 1;
  min-width: 0;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted);
  margin: 5px 0 8px;
}
.desc {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.65;
}
.thumbs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.thumbs img {
  width: 56px;
  height: 42px;
  object-fit: cover;
  border-radius: 6px;
}
.src {
  font-size: 12px;
  margin-top: 6px;
  word-break: break-all;
}
.src a {
  color: var(--primary);
}
.note {
  font-size: 12px;
  color: #b97c14;
  background: #fdf3e0;
  padding: 4px 9px;
  border-radius: 7px;
  display: inline-block;
  margin-top: 6px;
}
.ops {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: none;
}
@media (max-width: 760px) {
  .card {
    flex-direction: column;
  }
  .ops {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
