<!--
  추천 파티 — 직접 고르기 (RecommendDialog 의 탭). 고른 포켓몬 기준으로
    · 다음 후보: 함께 쓰인 순 / 위협 대비 순 (utils/teamRecommend.ts suggestNext)
    · 고른 포켓몬들에게 두루 강한 상대와 맡는 멤버
    · 포켓몬별 정보: 같이 쓰인 포켓몬, 불리한 상대 → 그 상대에게 강한 포켓몬 (memberInfo)
  를 보여 주고, 칩을 누르면 추가. "나머지 자동 채우기"는 고른 포켓몬에서 자동 추천 규칙으로 6마리까지.
  party: 지금 파티의 폼 id (불러오기용). 적용은 부모 → emit('apply', 폼 id 목록)
-->
<template>
  <div class="mode-body">
    <div class="members-row">
      <span class="section-label">{{
        t('party.rec.members', { n: rec.members.value.length })
      }}</span>
      <div class="members">
        <span v-for="id in rec.members.value" :key="id" class="member">
          <UiPokeSprite :id="id" :size="26" />
          <span>{{ gd.name('pokemon', id) }}</span>
          <button
            type="button"
            class="x"
            :aria-label="t('party.rec.remove')"
            :title="t('party.rec.remove')"
            @click="remove(id)"
          >
            ✕
          </button>
        </span>
        <div v-if="rec.members.value.length < 6" class="add">
          <TeamSpeciesPicker v-model="picking" :ids="addable" :label="t('party.rec.addHint')" />
        </div>
      </div>
      <div class="chip-row">
        <button
          type="button"
          class="btn btn-sm"
          :disabled="!party.length"
          :title="t('party.rec.loadPartyHint')"
          @click="loadParty"
        >
          {{ t('party.rec.loadParty') }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :disabled="!rec.members.value.length"
          @click="rec.members.value = []"
        >
          {{ t('party.rec.clear') }}
        </button>
      </div>
    </div>

    <div class="body-scroll">
      <p v-if="!rec.members.value.length" class="muted small">{{ t('party.rec.pickSome') }}</p>
      <p v-else-if="!rec.base.value" class="muted small">{{ t('party.rec.loading') }}</p>
      <template v-else-if="next">
        <p v-if="!rec.vs.value" class="warn-text small">{{ t('party.rec.noVs') }}</p>

        <!-- 다음 후보 -->
        <div v-if="rec.members.value.length < 6" class="next">
          <div class="col">
            <span class="section-label" :title="t('party.rec.nextMatesHint')">{{
              t('party.rec.nextMates')
            }}</span>
            <div class="chip-row">
              <TeamRecommendChip
                v-for="m in next.mates"
                :id="m.id"
                :key="m.id"
                :ratio="m.share"
                @add="add"
              />
              <span v-if="!next.mates.length" class="muted small">{{ t('party.rec.none') }}</span>
            </div>
          </div>
          <div class="col">
            <span class="section-label" :title="t('party.rec.nextCountersHint')">{{
              t('party.rec.nextCounters')
            }}</span>
            <ul class="counters">
              <li v-for="c in next.counters" :key="c.id" class="small">
                <TeamRecommendChip :id="c.id" @add="add" />
                <span class="muted">{{ counterText(c.counters) }}</span>
              </li>
              <li v-if="!next.counters.length" class="muted small">{{ t('party.rec.none') }}</li>
            </ul>
          </div>
        </div>

        <TeamRecommendThreats
          :threats="next.threats"
          :title="t('party.rec.teamThreats')"
          :can-add="canAdd"
          @add="add"
        />

        <!-- 포켓몬별 정보 -->
        <div class="per">
          <span class="section-label">{{ t('party.rec.perMember') }}</span>
          <details v-for="m in info" :key="m.id" class="mon" open>
            <summary>
              <UiPokeSprite :id="m.id" :size="28" />
              <strong>{{ gd.name('pokemon', m.id) }}</strong>
            </summary>
            <div class="mon-body small">
              <div class="line">
                <span class="label">{{ t('party.rec.memberMates') }}</span>
                <div class="chip-row">
                  <TeamRecommendChip
                    v-for="[id, v] in m.info.mates"
                    :id="id"
                    :key="id"
                    :ratio="v"
                    :disabled="!canAdd(id)"
                    @add="add"
                  />
                  <span v-if="!m.info.mates.length" class="muted">{{ t('party.rec.none') }}</span>
                </div>
              </div>
              <div class="line">
                <span class="label" :title="t('party.rec.memberThreatsHint')">{{
                  t('party.rec.memberThreats')
                }}</span>
                <ul class="mthreats">
                  <li v-for="th in m.info.threats" :key="th.id">
                    <TeamRecommendChip
                      :id="th.id"
                      :ratio="th.out"
                      tone="bad"
                      :disabled="!canAdd(th.id)"
                      @add="add"
                    />
                    <span class="arrow">→</span>
                    <TeamRecommendChip
                      v-for="[id, v] in th.answers"
                      :id="id"
                      :key="id"
                      :ratio="v"
                      tone="good"
                      :disabled="!canAdd(id)"
                      @add="add"
                    />
                  </li>
                  <li v-if="!m.info.threats.length" class="muted">{{ t('party.rec.noData') }}</li>
                </ul>
              </div>
            </div>
          </details>
        </div>
      </template>
    </div>

    <div class="foot">
      <button
        type="button"
        class="btn btn-sm"
        :disabled="!rec.base.value || !rec.members.value.length || rec.members.value.length >= 6"
        :title="t('party.rec.autoFillHint')"
        @click="autoFill"
      >
        {{ t('party.rec.autoFill') }}
      </button>
      <span class="spacer" />
      <span class="muted small">{{ t('party.rec.applyManualHint') }}</span>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!rec.members.value.length"
        @click="emit('apply', [...rec.members.value])"
      >
        {{ t('party.rec.apply') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTeamRecommend } from '~/composables/useTeamRecommend'
import { memberInfo, recommendTeam, suggestNext } from '~/utils/teamRecommend'

const props = defineProps<{ party: string[] }>()
const emit = defineEmits<{ apply: [forms: string[]] }>()
const { t } = useI18n()
const gd = useGameData()
const rec = useTeamRecommend()

// 표에 없는 폼은 뺌 (통계 종류를 바꾼 경우)
watch(
  rec.ids,
  (ids) => {
    if (ids.length) rec.members.value = rec.members.value.filter((id) => ids.includes(id))
  },
  { immediate: true },
)

// 더 넣을 수 있는지: 통계에 있고, 6마리 미만, 같은 종이 없음
const idSet = computed(() => new Set(rec.ids.value))
const canAdd = (id: string) =>
  idSet.value.has(id) && rec.members.value.length < 6 && !rec.sameSpecies(rec.members.value, id)
const addable = computed(() => rec.ids.value.filter(canAdd))
const add = (id: string) => {
  if (canAdd(id)) rec.members.value = [...rec.members.value, id]
}
const remove = (id: string) => (rec.members.value = rec.members.value.filter((m) => m !== id))
// 지금 파티 불러오기 (통계에 없는 포켓몬은 뺌)
const loadParty = () => {
  rec.members.value = props.party.filter((id) => idSet.value.has(id)).slice(0, 6)
}

// 검색으로 추가 (고르면 바로 넣고 비움)
const picking = ref('')
watch(picking, (id) => {
  if (!id) return
  add(id)
  picking.value = ''
})

const next = computed(() => {
  const base = rec.base.value
  if (!base || !rec.members.value.length) return null
  return suggestNext({ ...base, members: rec.members.value })
})
const info = computed(() => {
  const base = rec.base.value
  if (!base) return []
  return rec.members.value.map((id) => ({
    id,
    info: memberInfo({ table: base.table, vs: base.vs, id }),
  }))
})

const autoFill = () => {
  const base = rec.base.value
  if (!base) return
  rec.members.value = recommendTeam({ ...base, members: rec.members.value }).picks.map((p) => p.id)
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const counterText = (list: [string, number][]) =>
  list.map(([id, v]) => `${gd.name('pokemon', id)} ${pct(v)}`).join(' · ')
</script>

<style scoped>
.members-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.members {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.member {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 2px;
  border-radius: 999px;
  border: 1px solid var(--accent-2);
  background: var(--well);
  font-size: 13px;
  font-weight: 700;
}
.x {
  appearance: none;
  border: 0;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
}
.x:hover {
  color: var(--bad);
}
.add {
  flex: 1;
  min-width: 200px;
}
.next {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 640px) {
  .next {
    grid-template-columns: 1fr;
  }
}
.col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.counters,
.mthreats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.counters li,
.mthreats li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
}
.per {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mon {
  border-radius: var(--radius-sm);
  background: var(--well);
  border: 1px solid var(--line-soft);
  padding: 4px 10px 8px;
}
.mon summary {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  list-style: none;
}
.mon summary::-webkit-details-marker {
  display: none;
}
.mon-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
}
.line {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}
@media (max-width: 640px) {
  .line {
    grid-template-columns: 1fr;
  }
}
.label {
  color: var(--text-2);
  font-weight: 700;
  padding-top: 3px;
}
.arrow {
  color: var(--text-3);
}
</style>
