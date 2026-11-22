<!--
  도감 패치 이력: 포켓몬·기술·도구 하나가 레귤레이션마다 어떻게 바뀌었는지 (최신이 위).
  포켓몬 = 출전 추가·제외, 종족값 등, 습득 기술 ±, 배우는 기술의 수치 변경 / 기술 = 추가·제외, 수치, 배우는 포켓몬 ±
  / 도구 = 추가·제외. 데이터: composables/usePatchHistory.ts (패치 내역 화면과 같은 비교)
-->
<template>
  <section class="panel panel-pad">
    <h3 class="panel-title">
      {{ t('dex.patch.title') }}
      <span class="spacer" />
      <NuxtLink class="all link" to="/patch">{{ t('dex.patch.all') }}</NuxtLink>
    </h3>
    <p v-if="!rows.length" class="muted small">{{ t('dex.patch.none') }}</p>
    <div v-for="h in rows" :key="h.reg" class="reg-row">
      <div class="reg-head">
        <span class="reg-id">{{ h.reg }}</span>
        <span v-if="h.joined" class="tag good">{{
          h.first ? t('dex.patch.opened') : t('dex.patch.joined')
        }}</span>
        <span v-if="h.left" class="tag bad">{{ t('dex.patch.left') }}</span>
      </div>
      <div class="reg-body">
        <!-- 포켓몬: 종족값·타입·특성·무게 -->
        <div v-if="kind === 'pokemon' && h.changes.length" class="line">
          <span class="lbl">{{ t('patch.pokemonChanges') }}</span>
          <div class="vals">
            <span v-for="f in h.changes" :key="f.key" class="change">
              {{ p.pokemonLabel(f.key) }}
              <span class="num">{{ p.pokemonValue(f.key, f.from) }}</span>
              →
              <b class="num">{{ p.pokemonValue(f.key, f.to) }}</b>
            </span>
          </div>
        </div>
        <!-- 기술: 수치 -->
        <div v-if="kind === 'moves' && h.changes.length" class="line">
          <span class="lbl">{{ t('patch.moveChanges') }}</span>
          <div class="vals">
            <span v-for="f in h.changes" :key="f.key" class="change">
              <template v-if="f.key === 'effects' || f.key === 'target'">{{
                t('patch.field.' + f.key)
              }}</template>
              <template v-else>
                {{ t('patch.field.' + f.key) }}
                <span class="num">{{ p.moveValue(f.key, f.from) }}</span>
                →
                <b class="num">{{ p.moveValue(f.key, f.to) }}</b>
              </template>
            </span>
          </div>
        </div>
        <!-- 포켓몬: 습득 기술 ± -->
        <template v-if="kind === 'pokemon'">
          <div v-if="h.learnAdded.length" class="line">
            <span class="lbl"
              >{{ t('patch.learnset') }} <b class="good-text">+{{ h.learnAdded.length }}</b></span
            >
            <div class="vals">
              <NuxtLink v-for="m in h.learnAdded" :key="m" class="link" :to="moveLink(m)">{{
                gd.name('moves', m)
              }}</NuxtLink>
            </div>
          </div>
          <div v-if="h.learnRemoved.length" class="line">
            <span class="lbl"
              >{{ t('patch.learnset') }} <b class="bad-text">−{{ h.learnRemoved.length }}</b></span
            >
            <div class="vals">
              <NuxtLink v-for="m in h.learnRemoved" :key="m" class="link" :to="moveLink(m)">{{
                gd.name('moves', m)
              }}</NuxtLink>
            </div>
          </div>
          <div v-for="c in h.moveChanges" :key="c.id" class="line">
            <NuxtLink class="lbl link strong" :to="moveLink(c.id)">{{
              gd.name('moves', c.id)
            }}</NuxtLink>
            <div class="vals">
              <span v-for="f in c.changes" :key="f.key" class="change">
                <template v-if="f.key === 'effects' || f.key === 'target'">{{
                  t('patch.field.' + f.key)
                }}</template>
                <template v-else>
                  {{ t('patch.field.' + f.key) }}
                  <span class="num">{{ p.moveValue(f.key, f.from) }}</span>
                  →
                  <b class="num">{{ p.moveValue(f.key, f.to) }}</b>
                </template>
              </span>
            </div>
          </div>
        </template>
        <!-- 기술: 배우는 포켓몬 ± -->
        <template v-if="kind === 'moves'">
          <div v-if="h.learnAdded.length" class="line">
            <span class="lbl"
              >{{ t('dex.mv.learners') }} <b class="good-text">+{{ h.learnAdded.length }}</b></span
            >
            <PatchMonList :ids="h.learnAdded" />
          </div>
          <div v-if="h.learnRemoved.length" class="line">
            <span class="lbl"
              >{{ t('dex.mv.learners') }} <b class="bad-text">−{{ h.learnRemoved.length }}</b></span
            >
            <PatchMonList :ids="h.learnRemoved" />
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { usePatchHistory } from '~/composables/usePatchHistory'
import {
  itemHistory,
  monHistory,
  moveHistory,
  type ItemHistory,
  type MonHistory,
} from '~/utils/regulationData'

const props = defineProps<{ kind: 'pokemon' | 'moves' | 'items'; id: string }>()
const { t } = useI18n()
const gd = useGameData()
const p = usePatchHistory()

// 최신 레귤레이션이 위로. 세 종류를 한 모양으로 (없는 칸은 빈 목록)
const rows = computed(() => {
  const e = p.entries.value
  const list: (Partial<MonHistory> & ItemHistory)[] =
    props.kind === 'pokemon'
      ? monHistory(e, props.id)
      : props.kind === 'moves'
        ? moveHistory(e, props.id)
        : itemHistory(e, props.id)
  return list
    .map((h) => ({
      ...h,
      changes: h.changes ?? [],
      learnAdded: h.learnAdded ?? [],
      learnRemoved: h.learnRemoved ?? [],
      moveChanges: h.moveChanges ?? [],
    }))
    .reverse()
})

const moveLink = (id: string) => ({ path: '/dex', query: { tab: 'moves', move: id } })
</script>

<style scoped>
.reg-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 4px 12px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
  font-size: 13px;
}
.reg-row:first-of-type {
  border-top: 0;
  padding-top: 0;
}
.reg-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  align-self: start;
  line-height: 24px;
}
.reg-id {
  font-weight: 800;
}
.tag {
  font-size: 11px;
  font-weight: 700;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid currentColor;
  line-height: 18px;
}
.tag.good {
  color: var(--good);
}
.tag.bad {
  color: var(--bad);
}
.reg-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 24px;
}
.lbl {
  flex: none;
  min-width: 110px;
  color: var(--text-2);
}
.vals {
  display: flex;
  flex-wrap: wrap;
  gap: 0 12px;
  min-width: 0;
}
.change {
  white-space: nowrap;
}
.link {
  color: var(--text);
  text-decoration: none;
  border-radius: 6px;
}
.link:hover {
  background: var(--hover);
  color: var(--accent-text);
}
.strong {
  font-weight: 700;
}
.all {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  padding: 0 4px;
}
.small {
  font-size: 13px;
  margin: 0;
}
@media (max-width: 600px) {
  .reg-row {
    grid-template-columns: 1fr;
  }
  .line {
    flex-wrap: wrap;
  }
  .lbl {
    min-width: 0;
  }
}
</style>
