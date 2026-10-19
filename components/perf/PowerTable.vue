<!--
  성능표 · 결정력: 포켓몬 × 기술 타입마다 결정력이 가장 높은 기술. 페널티가 있으면 페널티 없는 차선 기술을 아랫줄에.
  공격(특공) SP 0 / 32 / 32+성격. 타수가 랜덤인 연속기는 기댓값(위)과 최소~최대(아래).
  속임수주사위: 지녔을 때로 다시 계산 (메가진화는 메가스톤이라 해당 없음). 계산: utils/perfTable.ts powerRows
-->
<template>
  <section class="panel panel-pad perf-panel">
    <div class="opts">
      <div class="chip-row">
        <button type="button" class="chip" :class="{ active: !type }" @click="type = ''">
          {{ t('perf.allTypes') }}
        </button>
        <button
          v-for="ty in TYPE_ORDER"
          :key="ty"
          type="button"
          class="chip type-chip"
          :class="{ active: type === ty }"
          :style="{ '--tc': `var(--t-${ty})` }"
          @click="type = type === ty ? '' : ty"
        >
          {{ gd.name('types', ty) }}
        </button>
      </div>
      <div class="chip-row">
        <button
          v-for="c in CATS"
          :key="c"
          type="button"
          class="chip"
          :class="{ active: cat === c }"
          @click="cat = c"
        >
          {{ c === 'all' ? t('perf.allCats') : t('category.' + c) }}
        </button>
        <label class="check" :title="t('perf.reliableHint')">
          <input v-model="reliable" type="checkbox" />
          {{ t('perf.reliable') }}
        </label>
        <label class="check" :title="t('perf.loadedDiceHint')">
          <input v-model="dice" type="checkbox" />
          {{ t('perf.loadedDice') }}
          <small v-if="!diceReleased" class="muted">{{ t('perf.unreleased') }}</small>
        </label>
        <span class="spacer" />
        <span class="muted small">{{ t('perf.count', { n: rows.length }) }}</span>
      </div>
    </div>

    <div class="perf-scroll">
      <table class="perf-table">
        <thead>
          <tr>
            <th class="rk">#</th>
            <th>{{ t('perf.col.mon') }}</th>
            <th>{{ t('perf.col.type') }}</th>
            <th>{{ t('perf.col.move') }}</th>
            <th v-for="(c, k) in SP_CFGS" :key="c" class="num-col" :title="t('perf.rangeHint')">
              <button
                type="button"
                class="sort"
                :class="{ active: sortCfg === k }"
                @click="sortCfg = k"
              >
                {{ t('perf.cfg.' + c) }}<span class="arrow">▼</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in visible" :key="row.key">
            <td class="rk num">{{ i + 1 }}</td>
            <td><PerfMonCell :mon="row.mon" form="atkForm" /></td>
            <td><UiTypeBadge :type="row.type" small /></td>
            <td class="mv-col">
              <div
                v-for="(e, li) in row.lines"
                :key="li"
                class="line"
                :class="{ alt: li > 0, tall: !!e.ranges }"
              >
                <span class="row1">
                  <span v-if="li > 0" class="alt-label">{{ t('perf.alt') }}</span>
                  <UiCategoryBadge :category="e.category" />
                  <span class="mv" :title="gd.text('moves', e.move)">{{
                    gd.name('moves', e.move)
                  }}</span>
                  <span v-if="e.ability" class="tag ab" :title="gd.text('abilities', e.ability)">{{
                    gd.name('abilities', e.ability)
                  }}</span>
                  <span v-if="e.stat === 'def'" class="tag">{{ t('perf.usesDef') }}</span>
                  <span v-if="hitsText(e)" class="tag">{{ hitsText(e) }}</span>
                  <span v-if="e.alwaysCrit" class="tag">{{ t('perf.crit') }}</span>
                  <span v-for="p in e.penalties" :key="p" class="tag pen">{{ penText(p, e) }}</span>
                </span>
                <span v-if="e.ranges" class="row2">{{ distText(e) }}</span>
              </div>
            </td>
            <td v-for="k in 3" :key="k" class="num" :class="{ active: sortCfg === k - 1 }">
              <div
                v-for="(e, li) in row.lines"
                :key="li"
                class="line"
                :class="{ alt: li > 0, tall: !!e.ranges }"
              >
                <span class="row1">{{ e.values[k - 1]!.toLocaleString() }}</span>
                <span v-if="e.ranges" class="row2"
                  >{{ e.ranges[k - 1]![0].toLocaleString() }}~{{
                    e.ranges[k - 1]![1].toLocaleString()
                  }}</span
                >
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="muted empty">{{ t('perf.empty') }}</p>
      <div ref="sentinel" />
    </div>
    <p class="note muted">{{ t('perf.power.note') }}</p>
  </section>
</template>

<script lang="ts">
import type { PowerCandidate as Cand, PowerRow as Row } from '~/utils/perfTable'

// 탭을 다시 열거나 분류를 바꿔도 다시 계산하지 않도록 모듈 단위로 보관 (게임 데이터는 고정)
const candCache = new Map<string, Cand[]>()
const rowCache = new Map<string, Row[]>()
</script>

<script setup lang="ts">
import type { PerfMon } from '~/composables/usePerfList'
import { useIncremental } from '~/composables/useIncremental'
import {
  powerCandidates,
  powerRows,
  SP_CFGS,
  type Penalty,
  type PowerEntry,
} from '~/utils/perfTable'
import { TYPE_ORDER } from '~/utils/typeCheck'
import type { Move, TypeId } from '~/utils/types'

const props = defineProps<{ mons: PerfMon[]; match: ((id: string) => boolean) | null }>()
const { t } = useI18n()
const gd = useGameData()

const CATS = ['all', 'physical', 'special'] as const
const type = ref<TypeId | ''>('')
const cat = ref<(typeof CATS)[number]>('all')
const sortCfg = ref(2)
const reliable = ref(false) // 페널티 없는 기술(차선) 기준으로 정렬
const dice = ref(false) // 속임수주사위를 지녔을 때 (아직 챔피언스 도구 목록에 없으면 "미출시")
const diceReleased = computed(() => !!gd.data.value?.items.loadeddice)

const rowsOf = (m: PerfMon, c: (typeof CATS)[number]) => {
  const item = dice.value ? 'loadeddice' : ''
  const key = `${m.id}|${c}|${item}`
  let rows = rowCache.get(key)
  if (!rows) {
    const ckey = `${m.id}|${item}`
    let cands = candCache.get(ckey)
    if (!cands) {
      const moves = m.learnset.map((id) => toRaw(gd.move(id))).filter((mv): mv is Move => !!mv)
      cands = powerCandidates(m.atkForm, moves, item)
      candCache.set(ckey, cands)
    }
    rows = powerRows(m.atkForm, cands, c === 'all' ? undefined : c)
    rowCache.set(key, rows)
  }
  return rows
}

const rows = computed(() => {
  const out: { key: string; mon: PerfMon; type: TypeId; lines: PowerEntry[] }[] = []
  for (const m of props.mons) {
    if (props.match && !props.match(m.id)) continue
    for (const r of rowsOf(m, cat.value)) {
      if (type.value && r.type !== type.value) continue
      out.push({
        key: `${m.id}|${r.type}`,
        mon: m,
        type: r.type,
        lines: r.alt ? [r.best, r.alt] : [r.best],
      })
    }
  }
  const k = sortCfg.value
  // 차선 기준: 페널티 없는 기술의 값 (그런 기술이 없으면 맨 뒤)
  const key = (r: (typeof out)[number]) => {
    const e = reliable.value && r.lines[0]!.penalties.length ? r.lines[1] : r.lines[0]
    return e ? e.values[k]! : -1
  }
  return out.sort((a, b) => key(b) - key(a))
})
const { visible, sentinel } = useIncremental(rows)

// 타수 태그: 고정이면 "n회", 랜덤이면 "최소~최대회" (부자유친은 특성 태그로 충분)
const hitsText = (e: PowerEntry) => {
  const h = e.hits
  if (!h || h.parentalBond) return ''
  return h.min === h.max
    ? t('perf.hits', { n: h.max })
    : t('perf.hitsRange', { min: h.min, max: h.max })
}
// 타수 분포 한 줄: 4가지 이하면 타수별 확률, 많으면 범위만 + 기댓값
const pct = (p: number) => Number((p * 100).toFixed(1))
const distText = (e: PowerEntry) => {
  const h = e.hits!
  const exp = t('perf.hitsExp', { n: Number(h.expHits.toFixed(2)) })
  if (h.outcomes.length > 4) return exp
  return (
    h.outcomes.map((o) => t('perf.hitPct', { n: o.hits, p: pct(o.p) })).join(' · ') + ' → ' + exp
  )
}
const penText = (p: Penalty, e: PowerEntry) =>
  p === 'accuracy'
    ? t('perf.pen.accuracy', { n: Math.round(e.accuracy ?? 100) })
    : t('perf.pen.' + p)
</script>

<style scoped>
.type-chip.active {
  background: var(--tc);
  border-color: var(--tc);
  color: #fff;
}
.mv-col {
  min-width: 260px;
}
.line {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 24px;
  white-space: nowrap;
}
/* 타수가 랜덤인 기술: 위 = 기댓값, 아래 = 범위·분포. 같은 기술은 모든 칸에서 같은 높이라 줄이 맞는다 */
.line.tall {
  min-height: 40px;
}
.row1 {
  display: flex;
  align-items: center;
  gap: 5px;
}
.row2 {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
}
td.num .line {
  align-items: flex-end;
}
.line.alt {
  color: var(--text-2);
  font-size: 12px;
}
.alt-label {
  font-size: 10px;
  font-weight: 800;
  color: var(--text-3);
  padding: 0 5px;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
}
.mv {
  font-weight: 700;
}
.line.alt .mv {
  font-weight: 600;
}
.tag {
  font-size: 10px;
  font-weight: 700;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--well);
  color: var(--text-2);
}
.tag.ab {
  color: var(--accent-2);
}
.tag.pen {
  color: var(--warn);
}
</style>
