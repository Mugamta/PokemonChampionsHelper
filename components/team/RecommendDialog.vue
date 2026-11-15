<!--
  추천 파티 만들기 (파티 화면 다이얼로그 내용). 최신 통계(사용률 표의 달 + 그 달 대면 자료)로
    · 자동 추천 (RecommendAuto): 첫 포켓몬을 고르면 핵심 + 대비로 6마리
    · 직접 고르기 (RecommendManual): 고른 포켓몬 기준 후보·포켓몬별 정보를 보며 한 마리씩
  설정(RecommendSettings)은 두 모드 공용. 상태·자료는 composables/useTeamRecommend.ts, 규칙은 utils/teamRecommend.ts
  통계 종류(싱글/더블)는 파티 화면의 통계 토글. 적용은 부모(pages/party.vue)가 한다 → emit('apply', 폼 id 목록)
-->
<template>
  <section class="panel panel-pad rec-dialog">
    <h3 class="panel-title">
      {{ t('party.rec.title') }}
      <span class="modes" role="group">
        <button
          v-for="m in ['auto', 'manual'] as const"
          :key="m"
          type="button"
          class="btn btn-sm"
          :class="{ 'btn-on': rec.mode.value === m }"
          @click="rec.mode.value = m"
        >
          {{ t('party.rec.mode.' + m) }}
        </button>
      </span>
      <span class="spacer" />
      <button
        type="button"
        class="btn btn-sm"
        :class="{ 'btn-on': showSettings }"
        @click="showSettings = !showSettings"
      >
        {{ t('party.rec.s.title') }}
      </button>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        :aria-label="t('party.rec.close')"
        @click="emit('close')"
      >
        ✕
      </button>
    </h3>
    <!-- 좁은 화면에서는 2줄로 접고 누르면 펼침 -->
    <p class="muted small desc" :class="{ open: descOpen }" @click="descOpen = !descOpen">
      {{
        t(rec.mode.value === 'auto' ? 'party.rec.desc' : 'party.rec.descManual', {
          kind: rec.source.value ? t('usage.' + rec.source.value.kind) : '',
          month: rec.source.value?.month ?? '',
        })
      }}
    </p>
    <TeamRecommendSettings v-if="showSettings" />

    <TeamRecommendAuto v-if="rec.mode.value === 'auto'" @apply="emit('apply', $event)" />
    <TeamRecommendManual v-else :party="party" @apply="emit('apply', $event)" />
  </section>
</template>

<script setup lang="ts">
import { useTeamRecommend } from '~/composables/useTeamRecommend'

defineProps<{ party: string[] }>()
const emit = defineEmits<{ close: []; apply: [forms: string[]] }>()
const { t } = useI18n()
const rec = useTeamRecommend()
const showSettings = ref(false)
const descOpen = ref(false)
</script>

<style scoped>
.rec-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(90vh, 960px);
  background: var(--panel-solid);
}
.rec-dialog .panel-title {
  margin: 0;
  flex-wrap: wrap;
}
.modes {
  display: inline-flex;
  gap: 4px;
  margin-left: 6px;
}
.btn-on {
  border-color: var(--accent-2);
  color: var(--accent-2);
}
.desc {
  margin: 0;
  line-height: 1.5;
}
@media (max-width: 640px) {
  .desc:not(.open) {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    cursor: pointer;
  }
}
.small {
  font-size: 12px;
}
</style>

<!-- 모드 내용(RecommendAuto / RecommendManual) 공용 배치: 위 고정 + 가운데 스크롤 + 아래 버튼 -->
<style>
.rec-dialog .mode-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.rec-dialog .body-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
}
.rec-dialog .body-scroll p {
  margin: 0;
}
.rec-dialog .small {
  font-size: 12px;
}
.rec-dialog .foot {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.rec-dialog .foot .spacer {
  flex: 1;
}
</style>
