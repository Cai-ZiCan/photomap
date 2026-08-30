<template>
  <div class="months" :title="months.length ? `最佳观赏月份：${months.join('、')}月` : '全年可拍'">
    <span v-for="m in 12" :key="m" class="m" :class="{ on: months.includes(m) }" :style="months.includes(m) ? { background: color } : {}">{{ m }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ months: number[]; color: string }>();
</script>

<style scoped>
.months {
  display: flex;
  gap: 3px;
}
.m {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  font-size: 10px;
  border-radius: 5px;
  background: #eef1f4;
  color: #98a1ab;
}
.m.on {
  color: #fff;
  font-weight: 600;
}
</style>
