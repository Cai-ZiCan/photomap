<template>
  <div v-if="o">
    <h1>总览</h1>
    <div class="cards">
      <div class="stat"><b>{{ o.published }}</b><span>已发布</span></div>
      <div class="stat warn" @click="goReview"><b>{{ o.pending }}</b><span>待审核 →</span></div>
      <div class="stat"><b>{{ o.rejected }}</b><span>已拒绝</span></div>
      <div class="stat"><b>{{ o.themes }}</b><span>专题</span></div>
      <div class="stat" v-if="o.seedSpots > 0"><b>{{ o.seedSpots }}</b><span>示例数据</span></div>
    </div>

    <div class="quick">
      <h2>快捷操作</h2>
      <div class="row">
        <RouterLink class="btn primary" to="/admin/spots/new">＋ 新建点位</RouterLink>
        <RouterLink class="btn" to="/admin/import">🔗 从链接导入</RouterLink>
        <RouterLink class="btn" to="/admin/review">🕒 审核投稿</RouterLink>
        <RouterLink class="btn" to="/admin/settings">⚙️ 导出数据</RouterLink>
      </div>
    </div>

    <div v-if="pending.length" class="recent">
      <h2>最新待审核</h2>
      <table class="table">
        <thead>
          <tr><th>点位</th><th>来源</th><th>提交人</th><th>时间</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="s in pending" :key="s.id">
            <td>{{ s.name }}</td>
            <td><span class="badge" :class="s.source">{{ sourceLabel(s.source) }}</span></td>
            <td>{{ s.submitter_name || '—' }}</td>
            <td>{{ s.created_at }}</td>
            <td><RouterLink class="btn mini" :to="`/admin/spots/${s.id}`">查看</RouterLink></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api';
import type { Overview, SpotDetail } from '../../types';

const router = useRouter();
const o = ref<Overview | null>(null);
const pending = ref<SpotDetail[]>([]);

onMounted(async () => {
  o.value = await api.admin.overview();
  pending.value = (await api.admin.spots({ status: 'pending' })).slice(0, 5);
});

function goReview() {
  router.push({ name: 'admin-review' });
}
function sourceLabel(s: string) {
  return s === 'creator' ? '制作者' : s === 'user' ? '网友投稿' : '网络采集';
}
</script>

<style scoped>
h1 {
  font-size: 20px;
  margin: 0 0 18px;
}
h2 {
  font-size: 15px;
  margin: 26px 0 10px;
}
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.stat {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 22px;
  min-width: 118px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat b {
  font-size: 24px;
}
.stat span {
  font-size: 12px;
  color: var(--muted);
}
.stat.warn {
  cursor: pointer;
  border-color: #f0d9a8;
}
.stat.warn b {
  color: #b97c14;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.quick {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px 18px 18px;
  margin-top: 22px;
}
.recent {
  margin-top: 8px;
}
</style>
