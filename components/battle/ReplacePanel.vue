<!-- 쓰러진 뒤 교체: 쓰러진 칸마다 내보낼 포켓몬을 고르고 한 번에 등장 (양쪽이면 등장 특성은 스피드 순) -->
<template>
  <section v-if="pending.length" class="panel panel-pad replace">
    <h3 class="panel-title">{{ t('battle.replaceTitle') }}</h3>
    <p class="muted hint">{{ t('battle.replaceHint') }}</p>
    <div v-for="p in pending" :key="key(p)" class="rp-row">
      <span class="rp-label" :class="p.side">
        {{ t(p.side === 'mine' ? 'battle.replaceMine' : 'battle.replaceOpp') }}
        <template v-if="b.N > 1">
          · {{ gd.name('pokemon', b.resolveAt(p.side, active(p))?.species.id) }}
        </template>
      </span>
      <select v-model="choice[key(p)]" class="field-input">
        <option :value="null">{{ t('battle.switchTo') }}</option>
        <option v-for="i in options(p)" :key="i" :value="i" :disabled="takenBy(p.side, i, key(p))">
          {{ gd.name('pokemon', b.resolveAt(p.side, i)?.species.id) }}
        </option>
      </select>
    </div>
    <div class="exec">
      <button type="button" class="btn btn-primary" :disabled="!picked.length" @click="go">
        {{ t('battle.replaceGo') }} ▶
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { BattleSide, useBattle } from '~/composables/useBattle'

const props = defineProps<{ b: ReturnType<typeof useBattle> }>()
const { t } = useI18n()
const gd = useGameData()

type Pending = { side: BattleSide; slot: number }
const pending = computed(() => props.b.pendingReplace.value)
const key = (p: Pending) => `${p.side}:${p.slot}`
const active = (p: Pending) => props.b.state.value!.sides[p.side].active[p.slot] ?? null
const options = (p: Pending) => props.b.replaceOptions(p.side)
const choice = reactive<Record<string, number | null>>({})
// 칸마다 빈 선택(null)을 넣어 둬야 안내 문구 옵션이 보인다
watchEffect(() => {
  for (const p of pending.value) if (!(key(p) in choice)) choice[key(p)] = null
})
// 같은 쪽의 다른 칸에서 이미 고른 포켓몬 (더블)
const takenBy = (side: BattleSide, i: number, self: string) =>
  Object.entries(choice).some(([k, v]) => k !== self && k.startsWith(side + ':') && v === i)
const picked = computed(() =>
  pending.value
    .map((p) => ({ ...p, idx: choice[key(p)] }))
    .filter((c): c is Pending & { idx: number } => c.idx != null),
)
const go = () => {
  props.b.replaceFainted(picked.value)
  for (const k of Object.keys(choice)) delete choice[k]
}
</script>

<style scoped>
.replace {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-color: var(--accent);
}
.hint {
  margin: 0;
  font-size: 12px;
}
.rp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  align-items: center;
  gap: 8px;
}
.rp-label {
  font-weight: 700;
  font-size: 13px;
}
.exec {
  display: flex;
  justify-content: flex-end;
}
</style>
