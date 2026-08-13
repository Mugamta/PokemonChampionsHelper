<!-- pages/singleBattle.vue -->
<template>
  <div class="sb-page">
    <div class="sb-row">
      <!-- 좌상단: 내 기술 목록 + 데미지 -->
      <section class="sb-panel sb-panel--moves">
        <h4 class="sb-panel-title">
          포켓몬 기술 목록과 데미지
        </h4>

        <div
          v-if="activeMineIndex === null"
          class="sb-select-row"
        >
          <button
            v-for="i in 6"
            :key="'mine-pick-' + i"
            type="button"
            class="sb-pick-btn"
            :disabled="!selectedPokemon[i - 1]"
            @click="activeMineIndex = i - 1"
          >
            <img
              :src="mySprite(i - 1)"
              class="sb-pick-sprite"
              @error="$event.target.src = pokemonImg"
            >
            <span class="sb-pick-name">{{ selectedPokemon[i - 1] || '-' }}</span>
          </button>
        </div>

        <div
          v-else
          class="sb-move-list"
        >
          <button
            type="button"
            class="sb-change-btn"
            @click="activeMineIndex = null"
          >
            교체
          </button>
          <div
            v-for="k in 4"
            :key="'mine-atk-' + k"
            class="sb-move-row"
          >
            <span class="sb-move-name">{{ selectedMoves[activeMineIndex]?.[k - 1] || '-' }}</span>
            <template v-if="activeOppIndex !== null && mineCell(k - 1)">
              <span :class="['sb-dmg', { 'sb-dmg--crit': showCrit }]">
                {{ mineCell(k - 1).dmgMin }}~{{ mineCell(k - 1).dmgMax }}
              </span>
              <span class="sb-pct">
                {{ mineCell(k - 1).pctMin }}~{{ mineCell(k - 1).pctMax }}%
              </span>
            </template>
            <span
              v-else
              class="sb-dmg-empty"
            >-</span>
          </div>
        </div>
      </section>

      <!-- 중상단: 날씨, 필드 -->
      <section class="sb-panel sb-panel--field">
        <div class="sb-field-row">
          <span class="sb-field-label">날씨</span>
          <div class="sb-field-buttons">
            <button
              v-for="w in weatherOptions"
              :key="w"
              type="button"
              class="sb-field-btn"
              :class="{ active: battleWeather === w }"
              @click="toggleBattleWeather(w)"
            >
              {{ w }}
            </button>
          </div>
          <span class="sb-field-label">필드</span>
          <div class="sb-field-buttons">
            <button
              v-for="f in fieldOptions"
              :key="f"
              type="button"
              class="sb-field-btn"
              :class="{ active: battleField === f }"
              @click="toggleBattleField(f)"
            >
              {{ f }}
            </button>
          </div>
        </div>
        <label class="sb-crit-toggle">
          <input
            v-model="showCrit"
            type="checkbox"
          >
          급소(치명타)
        </label>
      </section>

      <!-- 우상단: 상대 카드 + 랭크업 상태 -->
      <section class="sb-panel sb-panel--opp-status">
        <div
          v-if="activeOppIndex === null"
          class="sb-select-row"
        >
          <button
            v-for="i in 6"
            :key="'opp-pick-' + i"
            type="button"
            class="sb-pick-btn"
            :disabled="!oppSelectedPokemon[i - 1]"
            @click="activeOppIndex = i - 1"
          >
            <img
              :src="opponentSprite(i - 1)"
              class="sb-pick-sprite"
              @error="$event.target.src = pokemonImg"
            >
            <span class="sb-pick-name">{{ oppSelectedPokemon[i - 1] || '-' }}</span>
          </button>
        </div>

        <template v-else>
          <div class="sb-status-card">
            <img
              :src="opponentSprite(activeOppIndex)"
              class="sb-status-sprite"
              @error="$event.target.src = pokemonImg"
            >
            <div class="sb-status-info">
              <div class="sb-status-name-row">
                <span class="sb-status-name">{{ oppDisplayName(activeOppIndex) }}</span>
                <button
                  type="button"
                  class="sb-change-btn"
                  @click="activeOppIndex = null"
                >
                  교체
                </button>
              </div>
              <div class="sb-hp-bar-bg">
                <div
                  class="sb-hp-bar-fill"
                  :style="{ width: oppHpPercent + '%' }"
                />
              </div>
              <span class="sb-hp-text">{{ oppHpPercent }}%</span>
            </div>
          </div>

          <div class="sb-rank-box">
            <div
              v-for="stat in rankStatKeys"
              :key="'opp-rank-' + stat.key"
              class="sb-rank-row"
            >
              <span class="sb-rank-name">{{ stat.name }}</span>
              <span class="sb-rank-arrows">
                <span
                  v-for="n in 6"
                  :key="'up-' + n"
                  class="sb-arrow sb-arrow--up"
                  :class="{ 'sb-arrow--filled': n <= Math.max(oppRanks[stat.key], 0) }"
                >▲</span>
                <span
                  v-for="n in 6"
                  :key="'down-' + n"
                  class="sb-arrow sb-arrow--down"
                  :class="{ 'sb-arrow--filled': n <= Math.max(-oppRanks[stat.key], 0) }"
                >▼</span>
              </span>
              <span class="sb-rank-value">{{ oppRanks[stat.key] >= 0 ? '+' : '' }}{{ oppRanks[stat.key] }}</span>
              <span class="sb-rank-btns">
                <button
                  type="button"
                  class="sb-rank-btn"
                  @click="changeRank(oppRanks, stat.key, 1)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  class="sb-rank-btn"
                  @click="changeRank(oppRanks, stat.key, -1)"
                >
                  ▼
                </button>
              </span>
            </div>
          </div>
        </template>
      </section>
    </div>

    <div class="sb-row">
      <!-- 좌하단: 내 랭크업 상태 + 내 카드 -->
      <section class="sb-panel sb-panel--mine-status">
        <template v-if="activeMineIndex !== null">
          <div class="sb-rank-box">
            <div
              v-for="stat in rankStatKeys"
              :key="'mine-rank-' + stat.key"
              class="sb-rank-row"
            >
              <span class="sb-rank-name">{{ stat.name }}</span>
              <span class="sb-rank-arrows">
                <span
                  v-for="n in 6"
                  :key="'up-' + n"
                  class="sb-arrow sb-arrow--up"
                  :class="{ 'sb-arrow--filled': n <= Math.max(mineRanks[stat.key], 0) }"
                >▲</span>
                <span
                  v-for="n in 6"
                  :key="'down-' + n"
                  class="sb-arrow sb-arrow--down"
                  :class="{ 'sb-arrow--filled': n <= Math.max(-mineRanks[stat.key], 0) }"
                >▼</span>
              </span>
              <span class="sb-rank-value">{{ mineRanks[stat.key] >= 0 ? '+' : '' }}{{ mineRanks[stat.key] }}</span>
              <span class="sb-rank-btns">
                <button
                  type="button"
                  class="sb-rank-btn"
                  @click="changeRank(mineRanks, stat.key, 1)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  class="sb-rank-btn"
                  @click="changeRank(mineRanks, stat.key, -1)"
                >
                  ▼
                </button>
              </span>
            </div>
          </div>

          <div class="sb-status-card">
            <img
              :src="mySprite(activeMineIndex)"
              class="sb-status-sprite"
              @error="$event.target.src = pokemonImg"
            >
            <div class="sb-status-info">
              <span class="sb-status-name">{{ mineDisplayName(activeMineIndex) }}</span>
              <div class="sb-hp-bar-bg">
                <div
                  class="sb-hp-bar-fill"
                  :style="{ width: mineHpPercent + '%' }"
                />
              </div>
              <span class="sb-hp-text">{{ mineHpPercent }}%</span>
            </div>
          </div>
        </template>
        <div
          v-else
          class="sb-placeholder"
        >
          왼쪽 위에서 내 포켓몬을 선택하세요
        </div>
      </section>

      <div class="sb-panel sb-panel--empty" />

      <!-- 우하단: 상대 기술 목록 + 데미지 -->
      <section class="sb-panel sb-panel--moves">
        <h4 class="sb-panel-title">
          포켓몬 기술 목록과 데미지
        </h4>
        <div
          v-if="activeOppIndex === null"
          class="sb-placeholder"
        >
          오른쪽 위에서 상대 포켓몬을 선택하세요
        </div>
        <div
          v-else
          class="sb-move-list"
        >
          <div
            v-for="k in 4"
            :key="'opp-atk-' + k"
            class="sb-move-row"
          >
            <span class="sb-move-name">{{ oppSelectedMoves[activeOppIndex]?.[k - 1] || '-' }}</span>
            <template v-if="activeMineIndex !== null && oppCell(k - 1)">
              <span :class="['sb-dmg', { 'sb-dmg--crit': showCrit }]">
                {{ oppCell(k - 1).dmgMin }}~{{ oppCell(k - 1).dmgMax }}
              </span>
              <span class="sb-pct">
                {{ oppCell(k - 1).pctMin }}~{{ oppCell(k - 1).pctMax }}%
              </span>
            </template>
            <span
              v-else
              class="sb-dmg-empty"
            >-</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { calculateStat } from '@/utils/stat'
import { calculateDamage } from '@/utils/move'
import { MegaEvolutionMap } from '@/data/mega-evolutions'
import { getMoveData } from '@/utils/move-info'

const config = useRuntimeConfig()
const pokemonImg = (config.app.baseURL || '/') + 'pokemon.webp'

const { pokemonMap } = useEligiblePokemon()

const {
  selectedPokemon,
  selectedAbility,
  selectedNature,
  selectedTool,
  selectedMoves,
  inputStats,
  calcStats,
} = useParty()

const {
  selectedPokemon: oppSelectedPokemon,
  selectedAbility: oppSelectedAbility,
  selectedNature: oppSelectedNature,
  selectedTool: oppSelectedTool,
  selectedMoves: oppSelectedMoves,
  inputStats: oppInputStats,
  calcStats: oppCalcStats,
} = useOpponentParty()

const activeMineIndex = ref(null)
const activeOppIndex = ref(null)
const showCrit = ref(false)

const weatherOptions = ['쾌청', '큰가뭄', '비', '폭우', '모래바람', '눈', '난기류']
const fieldOptions = ['일렉트릭필드', '그래스필드', '미스트필드', '사이코필드']
const battleWeather = ref('없음')
const battleField = ref('없음')
const toggleBattleWeather = (v) => { battleWeather.value = battleWeather.value === v ? '없음' : v }
const toggleBattleField = (v) => { battleField.value = battleField.value === v ? '없음' : v }

const rankStatKeys = [
  { key: 'A', name: '공격' },
  { key: 'B', name: '방어' },
  { key: 'C', name: '특수공격' },
  { key: 'D', name: '특수방어' },
]
const mineRanks = reactive({ A: 0, B: 0, C: 0, D: 0 })
const oppRanks = reactive({ A: 0, B: 0, C: 0, D: 0 })

const changeRank = (target, key, delta) => {
  target[key] = Math.min(6, Math.max(-6, target[key] + delta))
}

const rankMultiplier = (stage) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage))

// ── 메가진화 판정 (entrySelect.vue와 동일 로직) ─────────────
const getMineMegaData = (index) => {
  const name = selectedPokemon.value[index]
  const tool = selectedTool.value[index]
  if (!name || !tool) return null
  const list = MegaEvolutionMap[name]
  if (!list) return null
  return list.find((m) => m.stoneName === tool) || null
}
const getOppMegaData = (index) => {
  const name = oppSelectedPokemon.value[index]
  const tool = oppSelectedTool.value[index]
  if (!name || !tool) return null
  const list = MegaEvolutionMap[name]
  if (!list) return null
  return list.find((m) => m.stoneName === tool) || null
}

const mineDisplayName = (index) => {
  const mega = getMineMegaData(index)
  return mega ? mega.megaName : (selectedPokemon.value[index] || '')
}
const oppDisplayName = (index) => {
  const mega = getOppMegaData(index)
  return mega ? mega.megaName : (oppSelectedPokemon.value[index] || '')
}

const mySprite = (index) => {
  const mega = getMineMegaData(index)
  if (mega) return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
  const data = pokemonMap.value[selectedPokemon.value[index]]
  return data?.id ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png` : pokemonImg
}
const opponentSprite = (index) => {
  const mega = getOppMegaData(index)
  if (mega) return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
  const data = pokemonMap.value[oppSelectedPokemon.value[index]]
  return data?.id ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png` : pokemonImg
}

const buildDisplayStats = (name, mega, calcStatsRef, index, natureRef, itemRef, evsRef) => {
  if (mega) return calcStatsRef.value[index] || {}
  const data = name ? pokemonMap.value[name] : null
  if (!data?.stats) return calcStatsRef.value[index] || {}
  const natureName = natureRef.value[index]?.replace(/\([^)]*\)/g, '') || '무보정'
  const itemName = itemRef.value[index] || ''
  const keys = ['H', 'A', 'B', 'C', 'D', 'S']
  const result = {}
  keys.forEach((k) => {
    result[k] = calculateStat(k, data.stats[k] || 0, evsRef.value[index]?.[k] || 0, natureName, itemName, '')
  })
  return result
}

const mineDisplayStats = (index) => buildDisplayStats(
  selectedPokemon.value[index], getMineMegaData(index), calcStats, index, selectedNature, selectedTool, inputStats,
)
const oppDisplayStats = (index) => buildDisplayStats(
  oppSelectedPokemon.value[index], getOppMegaData(index), oppCalcStats, index, oppSelectedNature, oppSelectedTool, oppInputStats,
)

// 현재는 턴 진행/HP 소모 로직이 없어 항상 100%로 표시 (실제 배틀 진행 기능은 후속 작업)
const mineHpPercent = computed(() => 100)
const oppHpPercent = computed(() => 100)

const buildCell = (move, atkStats, defStats, atkKey, defKey, atkRank, defRank, ability, item) => {
  const category = move.Category
  const attack = (atkStats?.[atkKey] || 0) * rankMultiplier(atkRank)
  const defense = (defStats?.[defKey] || 0) * rankMultiplier(defRank)
  const dmg = calculateDamage(move.Power || 0, attack, defense, true, move.Type || '', category, ability, battleWeather.value, item, '', battleField.value, 50)
  const defHp = defStats?.H || 0
  const dmgMin = showCrit.value ? dmg.critMin : dmg.min
  const dmgMax = showCrit.value ? dmg.critMax : dmg.max
  return {
    dmgMin,
    dmgMax,
    pctMin: defHp > 0 ? ((dmgMin / defHp) * 100).toFixed(1) : '0.0',
    pctMax: defHp > 0 ? ((dmgMax / defHp) * 100).toFixed(1) : '0.0',
  }
}

const mineCell = (moveIndex) => {
  if (activeMineIndex.value === null || activeOppIndex.value === null) return null
  const moveName = selectedMoves.value[activeMineIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'
  return buildCell(
    move,
    mineDisplayStats(activeMineIndex.value),
    oppDisplayStats(activeOppIndex.value),
    atkKey, defKey,
    mineRanks[atkKey], oppRanks[defKey],
    selectedAbility.value[activeMineIndex.value],
    selectedTool.value[activeMineIndex.value],
  )
}

const oppCell = (moveIndex) => {
  if (activeMineIndex.value === null || activeOppIndex.value === null) return null
  const moveName = oppSelectedMoves.value[activeOppIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'
  const mega = getOppMegaData(activeOppIndex.value)
  const ability = mega ? mega.ability : oppSelectedAbility.value[activeOppIndex.value]
  return buildCell(
    move,
    oppDisplayStats(activeOppIndex.value),
    mineDisplayStats(activeMineIndex.value),
    atkKey, defKey,
    oppRanks[atkKey], mineRanks[defKey],
    ability,
    oppSelectedTool.value[activeOppIndex.value],
  )
}
</script>

<style scoped>
.sb-page { display:flex; flex-direction:column; gap:12px; padding:8px; }
.sb-row { display:flex; gap:12px; align-items:flex-start; }
.sb-panel { background:#555; border-radius:6px; padding:8px; color:#fff; min-height:60px; }
.sb-panel--moves { flex:1; min-width:280px; }
.sb-panel--field { width:260px; display:flex; flex-direction:column; gap:8px; }
.sb-panel--opp-status,
.sb-panel--mine-status { flex:1; min-width:280px; display:flex; flex-direction:column; gap:8px; }
.sb-panel--empty { width:260px; background:transparent; }

.sb-panel-title { margin:0 0 6px 0; font-size:13px; }

.sb-select-row { display:flex; flex-wrap:wrap; gap:6px; }
.sb-pick-btn { display:flex; flex-direction:column; align-items:center; gap:2px; background:#444; border:1px solid #777; border-radius:6px; padding:4px; cursor:pointer; color:#fff; width:60px; }
.sb-pick-btn:disabled { opacity:0.3; cursor:default; }
.sb-pick-sprite { width:40px; height:40px; object-fit:cover; }
.sb-pick-name { font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:56px; }

.sb-change-btn { font-size:10px; background:#333; color:#fff; border:1px solid #888; border-radius:4px; padding:2px 6px; cursor:pointer; }

.sb-move-list { display:flex; flex-direction:column; gap:6px; }
.sb-move-row { display:flex; align-items:center; gap:8px; }
.sb-move-name { flex:1; font-size:12px; }
.sb-dmg { font-weight:bold; font-size:12px; }
.sb-dmg--crit { color:#ff5252; }
.sb-pct { font-size:9px; color:#aaa; }
.sb-dmg-empty { color:#888; }

.sb-field-row { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.sb-field-label { font-size:10px; color:#ccc; }
.sb-field-buttons { display:flex; flex-wrap:wrap; gap:2px; }
.sb-field-btn { font-size:10px; padding:2px 6px; border:1px solid #999; border-radius:4px; cursor:pointer; background:#444; color:#fff; }
.sb-field-btn.active { background:#4caf50; }
.sb-crit-toggle { display:flex; align-items:center; gap:4px; font-size:12px; color:#ffeb3b; cursor:pointer; }

.sb-status-card { display:flex; align-items:center; gap:8px; }
.sb-status-sprite { width:56px; height:56px; object-fit:cover; border:2px solid #333; border-radius:6px; background:#e8e8e8; }
.sb-status-info { display:flex; flex-direction:column; gap:2px; flex:1; }
.sb-status-name-row { display:flex; align-items:center; justify-content:space-between; gap:6px; }
.sb-status-name { font-size:13px; font-weight:bold; }
.sb-hp-bar-bg { width:100%; height:8px; background:#222; border-radius:4px; overflow:hidden; }
.sb-hp-bar-fill { height:100%; background:linear-gradient(90deg,#8bc34a,#4caf50); }
.sb-hp-text { font-size:10px; color:#ccc; }

.sb-rank-box { display:flex; flex-direction:column; gap:4px; }
.sb-rank-row { display:flex; align-items:center; gap:4px; }
.sb-rank-name { width:60px; font-size:11px; }
.sb-rank-arrows { display:flex; gap:1px; font-size:9px; }
.sb-arrow { color:#555; }
.sb-arrow--filled.sb-arrow--up { color:#f44336; }
.sb-arrow--filled.sb-arrow--down { color:#2196f3; }
.sb-rank-value { width:24px; text-align:right; font-size:11px; }
.sb-rank-btns { display:flex; flex-direction:column; }
.sb-rank-btn { font-size:8px; line-height:8px; padding:0 3px; border:1px solid #888; background:#444; color:#fff; cursor:pointer; }

.sb-placeholder { font-size:12px; color:#aaa; padding:12px; }
</style>