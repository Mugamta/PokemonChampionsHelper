<template>
  <!-- 화면 전환 로딩 (plugins/page-loading.client.ts). 빠른 전환에서는 깜빡이지 않게 조금 늦게 나타난다 -->
  <div v-if="loading" class="page-loading" role="status" aria-live="polite">
    <div class="box">
      <span class="spinner" />
      <span>{{ label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
// 이동할 경로 (없으면 꺼짐). 이 동안 하는 일: 그 페이지의 코드를 받고 화면을 만든다
const loading = useState<string | null>('page-loading', () => null)

// ── 경로 → 페이지 이름 ─────
const TITLES: Record<string, string> = {
  '/': 'app.home',
  '/party': 'party.title',
  '/single': 'entry.titleSingle',
  '/single/battle': 'battle.titleSingle',
  '/double': 'entry.titleDouble',
  '/double/battle': 'battle.titleDouble',
  '/stats': 'perf.title',
  '/vs': 'vs.title',
  '/dex': 'dex.title',
  '/patch': 'patch.title',
  '/guide': 'guide.title',
  '/help': 'help.title',
  '/about': 'about.title',
  '/contact': 'contact.title',
}
const label = computed(() => {
  const path = (loading.value ?? '').replace(/(.)\/+$/, '$1') // 끝 슬래시 제거 (/guide/ → /guide)
  const key = TITLES[path]
  return key ? t('app.pageLoading', { page: t(key) }) : t('app.pageLoadingAny')
})
</script>

<style scoped>
/* 새 페이지를 만드는 동안 메인 스레드가 막혀도 움직이도록 opacity·transform 애니메이션만 쓴다 (컴포지터에서 실행) */
.page-loading {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--well-strong);
  cursor: progress;
  opacity: 0;
  will-change: opacity;
  animation: page-loading-in 0.15s ease-out 0.08s forwards;
}
.box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--panel-solid);
  box-shadow: var(--shadow);
  color: var(--text-2);
  font-size: 14px;
}
.spinner {
  width: 22px;
  height: 22px;
  border: 3px solid var(--line-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  will-change: transform;
  animation: page-loading-spin 0.8s linear infinite;
}
@keyframes page-loading-in {
  to {
    opacity: 1;
  }
}
@keyframes page-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
