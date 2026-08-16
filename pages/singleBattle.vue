<!-- pages/singleBattle.vue -->
<template>
  <div class="sb-page">
    <!-- 좌상단: 내 기술 목록 (고정) — 상대 6마리 각각에 대한 4가지 시나리오 데미지 -->
    <section class="sb-panel sb-panel--moves sb-cell-mine-moves">
      <div class="sb-panel-header-row">
        <h4 class="sb-panel-title">
          내 기술 목록과 상대별 데미지
        </h4>
        <label class="sb-crit-toggle">
          <input
            v-model="showCritMine"
            type="checkbox"
          >
          급소
        </label>
      </div>

      <div
        v-if="activeMineIndex === null"
        class="sb-placeholder"
      >
        아래에서 내 포켓몬을 선택하세요
      </div>

      <div
        v-else
        class="sb-dmg-table-wrap"
      >
        <table class="sb-dmg-table">
          <thead>
            <tr>
              <th>기술</th>
              <th
                v-for="i in 6"
                :key="'opp-head-' + i"
              >
                <img
                  :src="opponentSprite(i - 1)"
                  class="sb-table-sprite"
                  @error="$event.target.src = pokemonImg"
                >
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="k in mineDamageMoveIndices"
              :key="'mine-row-' + k"
            >
              <td class="sb-move-name">
                {{ selectedMoves[activeMineIndex]?.[k] || '-' }}
              </td>
              <td
                v-for="i in 6"
                :key="'mine-cell-' + i"
              >
                <template v-if="oppSelectedPokemon[i - 1]">
                  <div
                    v-for="sc in scenarioKeys"
                    :key="sc"
                    class="sb-scenario-line"
                  >
                    <span class="sb-scenario-label">{{ scenarioLabel(sc) }}</span>
                    <template v-if="mineCellScenario(k, i - 1, sc, showCritMine)">
                      <span class="sb-dmg">{{ mineCellScenario(k, i - 1, sc, showCritMine).dmgMin }}~{{ mineCellScenario(k, i - 1, sc, showCritMine).dmgMax }}</span>
                      <span class="sb-pct">({{ mineCellScenario(k, i - 1, sc, showCritMine).pctMin }}~{{ mineCellScenario(k, i - 1, sc, showCritMine).pctMax }}%)</span>
                    </template>
                    <span
                      v-else
                      class="sb-dmg-empty"
                    >-</span>
                  </div>
                </template>
                <span
                  v-else
                  class="sb-dmg-empty"
                >-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 중상단: 날씨, 필드, 공간변화, 스피드 비교 -->
    <section class="sb-panel sb-panel--field sb-cell-field">
      <!-- 날씨: 없음/난기류, 쾌청/큰가뭄, 비/폭우, 모래바람/눈 각각 세로쌍 -->
      <div class="sb-field-row">
        <span class="sb-field-label">날씨</span>
        <div class="sb-weather-buttons">
          <div class="sb-weather-col">
            <button
              v-for="w in ['없음', '난기류']"
              :key="w"
              type="button"
              class="sb-field-btn"
              :class="{ active: battleWeather === w }"
              @click="toggleBattleWeather(w)"
            >
              {{ w }}
            </button>
          </div>
          <div class="sb-weather-col">
            <button
              v-for="w in ['쾌청', '큰가뭄']"
              :key="w"
              type="button"
              class="sb-field-btn"
              :class="{ active: battleWeather === w }"
              @click="toggleBattleWeather(w)"
            >
              {{ w }}
            </button>
          </div>
          <div class="sb-weather-col">
            <button
              v-for="w in ['비', '폭우']"
              :key="w"
              type="button"
              class="sb-field-btn"
              :class="{ active: battleWeather === w }"
              @click="toggleBattleWeather(w)"
            >
              {{ w }}
            </button>
          </div>
          <div class="sb-weather-col">
            <button
              v-for="w in ['모래바람', '눈']"
              :key="w"
              type="button"
              class="sb-field-btn"
              :class="{ active: battleWeather === w }"
              @click="toggleBattleWeather(w)"
            >
              {{ w }}
            </button>
          </div>
        </div>
        <div
          v-if="battleWeather !== '없음'"
          class="sb-turn-counter"
        >
          <button
            type="button"
            @click="changeExtendableTurn(weatherTurn, -1)"
          >
            -
          </button>
          <span>{{ weatherTurn.current }}/{{ weatherTurn.total }}</span>
          <button
            type="button"
            @click="changeExtendableTurn(weatherTurn, 1)"
          >
            +
          </button>
        </div>
      </div>

      <!-- 필드 -->
      <div class="sb-field-row">
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
        <div
          v-if="battleField !== '없음'"
          class="sb-turn-counter"
        >
          <button
            type="button"
            @click="changeExtendableTurn(fieldTurn, -1)"
          >
            -
          </button>
          <span>{{ fieldTurn.current }}/{{ fieldTurn.total }}</span>
          <button
            type="button"
            @click="changeExtendableTurn(fieldTurn, 1)"
          >
            +
          </button>
        </div>
      </div>

      <!-- 공간변화 -->
      <div class="sb-field-row">
        <span class="sb-field-label">공간변화</span>
        <div class="sb-field-buttons">
          <button
            v-for="r in roomOptions"
            :key="r"
            type="button"
            class="sb-field-btn"
            :class="{ active: !!activeRooms[r] }"
            @click="toggleRoom(r)"
          >
            {{ r }}
          </button>
        </div>
      </div>
      <div
        v-if="Object.keys(activeRooms).length"
        class="sb-room-status-list"
      >
        <div
          v-for="(val, name) in activeRooms"
          :key="'room-status-' + name"
          class="sb-turn-counter"
        >
          <span>{{ name }}</span>
          <button
            type="button"
            @click="changeRoomTurn(name, -1)"
          >
            -
          </button>
          <span>{{ val.current }}/{{ val.total }}</span>
          <button
            type="button"
            @click="changeRoomTurn(name, 1)"
          >
            +
          </button>
        </div>
      </div>

      <!-- 전체 배틀 턴 수 -->
      <div class="sb-battle-turn">
        현재 턴: {{ battleTurn }}
      </div>

      <!-- 스피드 비교 (내림차순 정렬, 내 스피드는 빨간색) -->
      <div class="sb-speed-box">
        <div
          v-for="row in speedRows"
          :key="row.key"
          class="sb-speed-row"
          :class="{ 'sb-speed-row--mine': row.isMine }"
        >
          <span>{{ row.label }}</span>
          <span>{{ row.value }}</span>
        </div>
        <div
          v-if="!speedRows.length"
          class="sb-placeholder-small"
        >
          내/상대 포켓몬을 선택하면 표시됩니다
        </div>
      </div>
    </section>

    <!-- 우상단: 상태이상 + 상대 카드 + 실능치 + 랭크업 상태 + 확정/후보 목록 -->
    <section class="sb-panel sb-panel--opp-status sb-cell-opp-status">
      <!-- 상태이상 / 특수 상태이상 (상대) — 확정/후보 목록보다 위 -->
      <div class="sb-status-conditions">
        <div class="sb-condition-row">
          <span class="sb-condition-group-label">상태이상</span>
          <button
            v-for="s in STATUS_CONDITIONS"
            :key="'opp-cond-' + s"
            type="button"
            class="sb-condition-btn"
            :class="{ active: oppStatusCondition === s }"
            @click="toggleOppStatusCondition(s)"
          >
            {{ s }}
          </button>
        </div>
        <div
          v-for="group in SPECIAL_CONDITION_GROUPS"
          :key="'opp-cond-group-' + group.label"
          class="sb-condition-row"
        >
          <span class="sb-condition-group-label">특수 상태이상({{ group.label }})</span>
          <button
            v-for="s in group.items"
            :key="'opp-cond-' + s"
            type="button"
            class="sb-condition-btn"
            :class="{ active: !!oppSpecialConditions[s] }"
            @click="toggleOppSpecialCondition(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <template v-if="activeOppIndex !== null">
        <div class="sb-status-card">
          <img
            :src="opponentSprite(activeOppIndex)"
            class="sb-status-sprite"
            @error="$event.target.src = pokemonImg"
          >
          <div class="sb-status-info">
            <span class="sb-status-name">{{ oppDisplayName(activeOppIndex) }}</span>
            <label
              v-if="getOppMegaData(activeOppIndex) && oppMegaToggle[activeOppIndex] !== true"
              class="sb-mega-toggle"
            >
              <input
                v-model="oppMegaToggle[activeOppIndex]"
                type="checkbox"
              >
              메가진화
            </label>
            <div class="sb-hp-bar-bg">
              <div
                class="sb-hp-bar-fill"
                :style="{ width: oppHpBarPercent + '%' }"
              />
            </div>
            <span class="sb-hp-text">{{ oppHpRange.min }}~{{ oppHpRange.max }}/{{ oppMaxHp }} ({{ Math.round(oppHpBarPercent) }}%)</span>
          </div>
        </div>

        <div class="sb-compact-row">
          <div class="sb-realstats-box sb-realstats-box--compact">
            <div
              v-for="stat in statKeys"
              :key="'opp-real-' + stat.key"
              class="sb-realstat-row"
            >
              <span class="sb-realstat-name">{{ stat.name }}</span>
              <span
                class="sb-realstat-value"
                :style="{ color: oppStatColor(activeOppIndex, stat.key) }"
              >{{ oppDisplayStats(activeOppIndex)[stat.key] }}</span>
              <span
                v-if="oppStatBoostReason(activeOppIndex, stat.key)"
                class="sb-realstat-reason"
              >({{ oppStatBoostReason(activeOppIndex, stat.key) }})</span>
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
                  :key="'arrow-' + n"
                  class="sb-arrow"
                  :class="{
                    'sb-arrow--pos': oppRanks[stat.key] > 0 && isRankArrowFilled(oppRanks[stat.key], n),
                    'sb-arrow--neg': oppRanks[stat.key] < 0 && isRankArrowFilled(oppRanks[stat.key], n),
                  }"
                >{{ rankArrowChar(oppRanks[stat.key]) }}</span>
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
        </div>
      </template>
      <div
        v-else
        class="sb-placeholder"
      >
        아래 후보 중 한 마리를 선출하세요
      </div>

      <!-- 확정 포켓몬 / 후보 포켓몬: 항상 표시 -->
      <div class="sb-opp-team-area">
        <div class="sb-opp-confirmed-block">
          <span class="sb-mini-section-label">확정 포켓몬</span>
          <div class="sb-mini-list">
            <button
              v-for="idx in revealedOppIndices"
              :key="'opp-confirmed-' + idx"
              type="button"
              class="sb-mini-item"
              :class="{ 'sb-mini-item--active': idx === activeOppIndex, 'sb-mini-item--fainted': isOppFainted(idx) }"
              :disabled="isOppFainted(idx)"
              @click="selectOpp(idx)"
            >
              <img
                :src="opponentSprite(idx)"
                class="sb-mini-sprite"
                @error="$event.target.src = pokemonImg"
              >
              <span class="sb-mini-name">{{ oppDisplayName(idx) }}</span>
            </button>
            <span
              v-if="!revealedOppIndices.length"
              class="sb-placeholder-small"
            >아직 없음</span>
          </div>
        </div>

        <div
          v-if="revealedOppIndices.length < 3"
          class="sb-opp-candidate-block"
        >
          <span class="sb-mini-section-label">선출 변경 · 후보 포켓몬</span>
          <div class="sb-mini-list">
            <button
              v-for="i in 6"
              v-show="!revealedOppIndices.includes(i - 1) && oppSelectedPokemon[i - 1]"
              :key="'opp-cand-' + i"
              type="button"
              class="sb-mini-item"
              :disabled="isOppFainted(i - 1)"
              @click="selectOpp(i - 1)"
            >
              <img
                :src="opponentSprite(i - 1)"
                class="sb-mini-sprite"
                @error="$event.target.src = pokemonImg"
              >
              <span class="sb-mini-name">{{ oppDisplayName(i - 1) }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 좌하단: 내 파티(entrySelect 카드 스타일) + 현재 포켓몬 상태카드 + 상태이상 + 랭크업 -->
    <section class="sb-panel sb-panel--mine-status sb-cell-mine-status">
      <!-- 내 파티 (entrySelect.vue 카드 스타일, 항상 표시, 가로 배치) -->
      <div class="sb-mine-team">
        <div
          v-for="idx in orderedMineIndices"
          :key="'mine-card-' + idx"
          class="sb-mine-card"
          :class="{ 'sb-mine-card--active': idx === activeMineIndex, 'sb-mine-card--fainted': isMineFainted(idx) }"
          @click="selectMine(idx)"
        >
          <img
            :src="mySprite(idx)"
            class="sb-mine-card-sprite"
            @error="$event.target.src = pokemonImg"
          >

          <div class="sb-mine-card-name-block">
            <span class="sb-mine-card-name">{{ mineDisplayName(idx) }}</span>
            <div class="sb-hp-bar-bg">
              <div
                class="sb-hp-bar-fill"
                :style="{ width: mineHpPercentFor(idx) + '%' }"
              />
            </div>
            <span class="sb-hp-text">{{ Math.round(mineCurrentHp[idx] ?? mineDisplayStats(idx)?.H ?? 0) }}/{{ mineDisplayStats(idx)?.H ?? 0 }} ({{ mineHpPercentFor(idx) }}%)</span>
          </div>

          <div class="sb-mine-card-stats">
            <div class="sb-mine-card-stats-header">
              <span class="sb-realstat-name" />
              <span class="sb-mine-card-stats-label">실능치</span>
              <span class="sb-mine-card-stats-label">노력치</span>
            </div>
            <div
              v-for="stat in statKeys"
              :key="'card-stat-' + idx + '-' + stat.key"
              class="sb-realstat-row"
            >
              <span class="sb-realstat-name">{{ stat.name }}</span>
              <span
                class="sb-realstat-value"
                :style="{ color: mineStatColor(idx, stat.key) }"
              >{{ mineDisplayStats(idx)[stat.key] ?? 0 }}</span>
              <span class="sb-ev-tag">+{{ inputStats[idx]?.[stat.key] ?? 0 }}</span>
            </div>
          </div>

          <div class="sb-mine-card-moves">
            <div
              v-for="k in 4"
              :key="'card-move-' + idx + '-' + k"
              class="sb-mine-card-move-row-wrap"
            >
              <div class="sb-mine-card-move-row">
                <span class="sb-mine-card-move-name">{{ selectedMoves[idx]?.[k - 1] || '-' }}</span>
                <span class="sb-mine-card-move-dmg">{{ getMineMoveBaseDamage(idx, k - 1) }}</span>
              </div>
              <span class="sb-mine-card-move-info">{{ formatMoveInfo(selectedMoves[idx]?.[k - 1]) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 현재 활성 포켓몬 요약 카드 (사진/HP/메가진화) -->
      <div
        v-if="activeMineIndex !== null"
        class="sb-status-card"
      >
        <img
          :src="mySprite(activeMineIndex)"
          class="sb-status-sprite"
          @error="$event.target.src = pokemonImg"
        >
        <div class="sb-status-info">
          <span class="sb-status-name">{{ mineDisplayName(activeMineIndex) }}</span>
          <label
            v-if="getMineMegaData(activeMineIndex) && mineMegaToggle[activeMineIndex] !== true"
            class="sb-mega-toggle"
          >
            <input
              v-model="mineMegaToggle[activeMineIndex]"
              type="checkbox"
            >
            메가진화
          </label>
          <div class="sb-hp-bar-bg">
            <div
              class="sb-hp-bar-fill"
              :style="{ width: mineHpPercent + '%' }"
            />
          </div>
          <span class="sb-hp-text">{{ Math.round(mineCurrentHp[activeMineIndex] || 0) }}/{{ mineMaxHp }} ({{ mineHpPercent }}%)</span>
        </div>
      </div>

      <!-- 상태이상 / 특수 상태이상 (내) -->
      <div class="sb-status-conditions">
        <div class="sb-condition-row">
          <span class="sb-condition-group-label">상태이상</span>
          <button
            v-for="s in STATUS_CONDITIONS"
            :key="'cond-' + s"
            type="button"
            class="sb-condition-btn"
            :class="{ active: mineStatusCondition === s }"
            @click="toggleMineStatusCondition(s)"
          >
            {{ s }}
          </button>
        </div>
        <div
          v-for="group in SPECIAL_CONDITION_GROUPS"
          :key="'cond-group-' + group.label"
          class="sb-condition-row"
        >
          <span class="sb-condition-group-label">특수 상태이상({{ group.label }})</span>
          <button
            v-for="s in group.items"
            :key="'cond-' + s"
            type="button"
            class="sb-condition-btn"
            :class="{ active: !!mineSpecialConditions[s] }"
            @click="toggleMineSpecialCondition(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <div
        v-if="activeMineIndex !== null"
        class="sb-rank-box"
      >
        <div
          v-for="stat in rankStatKeys"
          :key="'mine-rank-' + stat.key"
          class="sb-rank-row"
        >
          <span class="sb-rank-name">{{ stat.name }}</span>
          <span class="sb-rank-arrows">
            <span
              v-for="n in 6"
              :key="'arrow-' + n"
              class="sb-arrow"
              :class="{
                'sb-arrow--pos': mineRanks[stat.key] > 0 && isRankArrowFilled(mineRanks[stat.key], n),
                'sb-arrow--neg': mineRanks[stat.key] < 0 && isRankArrowFilled(mineRanks[stat.key], n),
              }"
            >{{ rankArrowChar(mineRanks[stat.key]) }}</span>
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
    </section>

    <!-- 중간 하단: 내/상대 행동 입력 + 실행 -->
    <section class="sb-panel sb-cell-empty sb-panel--action-log">
      <div class="sb-action-block">
        <h5 class="sb-action-title">
          내 행동
        </h5>
        <div class="sb-action-type-row">
          <label>
            <input
              v-model="mineAction.type"
              type="radio"
              value="교체"
            >
            교체
          </label>
          <label>
            <input
              v-model="mineAction.type"
              type="radio"
              value="기술사용"
            >
            기술 사용
          </label>
        </div>

        <div
          v-if="mineAction.type === '교체'"
          class="sb-action-detail"
        >
          <select v-model="mineAction.targetIndex">
            <option
              :value="null"
              disabled
            >
              포켓몬 선택
            </option>
            <option
              v-for="idx in orderedMineIndices"
              :key="'mine-act-target-' + idx"
              :value="idx"
              :disabled="idx === activeMineIndex || isMineFainted(idx)"
            >
              {{ mineDisplayName(idx) }}
            </option>
          </select>
        </div>

        <div
          v-else
          class="sb-action-detail"
        >
          <select
            v-model.number="mineAction.moveIndex"
            :disabled="activeMineIndex === null"
          >
            <option
              v-for="k in 4"
              :key="'mine-act-move-' + k"
              :value="k - 1"
            >
              {{ selectedMoves[activeMineIndex]?.[k - 1] || '-' }}
            </option>
          </select>
          <label
            v-if="activeMineIndex !== null && getMineMegaData(activeMineIndex) && mineMegaToggle[activeMineIndex] !== true"
            class="sb-mega-toggle"
          >
            <input
              v-model="mineAction.useMega"
              type="checkbox"
            > 메가진화 사용
          </label>
          <span
            v-if="mineActionPreview"
            class="sb-preview"
          >
            예상 {{ mineActionPreview.dmgMin }}~{{ mineActionPreview.dmgMax }} ({{ mineActionPreview.pctMin }}~{{ mineActionPreview.pctMax }}%)
          </span>
          <span class="sb-input-label">입힌 데미지(%)</span>
          <input
            v-model.number="mineAction.dmgPercent"
            type="number"
            min="0"
            max="100"
            placeholder="0~100"
            class="sb-dmg-input"
          >
        </div>
      </div>

      <div class="sb-action-block">
        <h5 class="sb-action-title">
          상대 행동
        </h5>
        <div class="sb-action-type-row">
          <label>
            <input
              v-model="oppAction.type"
              type="radio"
              value="교체"
            >
            교체
          </label>
          <label>
            <input
              v-model="oppAction.type"
              type="radio"
              value="기술사용"
            >
            기술 사용
          </label>
        </div>

        <div
          v-if="oppAction.type === '교체'"
          class="sb-action-detail"
        >
          <select v-model="oppAction.targetIndex">
            <option
              :value="null"
              disabled
            >
              포켓몬 선택
            </option>
            <option
              v-for="i in 6"
              :key="'opp-act-target-' + i"
              :value="i - 1"
              :disabled="i - 1 === activeOppIndex || !oppSelectedPokemon[i - 1] || isOppFainted(i - 1)"
            >
              {{ oppSelectedPokemon[i - 1] ? oppDisplayName(i - 1) : '-' }}
            </option>
          </select>
        </div>

        <div
          v-else
          class="sb-action-detail"
        >
          <select
            v-model.number="oppAction.moveIndex"
            :disabled="activeOppIndex === null"
          >
            <option
              v-for="k in 4"
              :key="'opp-act-move-' + k"
              :value="k - 1"
            >
              {{ oppSelectedMoves[activeOppIndex]?.[k - 1] || '-' }}
            </option>
          </select>
          <label
            v-if="activeOppIndex !== null && getOppMegaData(activeOppIndex) && oppMegaToggle[activeOppIndex] !== true"
            class="sb-mega-toggle"
          >
            <input
              v-model="oppAction.useMega"
              type="checkbox"
            > 메가진화 사용
          </label>
          <span class="sb-input-label">입은 데미지</span>
          <input
            v-model.number="oppAction.damageTaken"
            type="number"
            min="0"
            placeholder="받은 데미지"
            class="sb-dmg-input"
          >
          <span
            v-if="oppScenarioMatches.length"
            class="sb-preview"
          >
            추정: {{ oppScenarioMatches.map(m => m.label).join(', ') }}
          </span>
          <span
            v-else-if="oppAction.damageTaken"
            class="sb-preview sb-preview--none"
          >
            일치하는 시나리오 없음(급소이거나 다른 조건)
          </span>
        </div>
      </div>

      <button
        type="button"
        class="sb-execute-btn"
        @click="executeTurn"
      >
        이번 턴 적용
      </button>
    </section>

    <!-- 우하단: 상대 기술 목록(select) + 내 포켓몬별 실제 데미지 -->
    <section class="sb-panel sb-panel--moves sb-cell-opp-moves">
      <div class="sb-panel-header-row">
        <h4 class="sb-panel-title">
          상대 기술 목록과 데미지
        </h4>
        <label class="sb-crit-toggle">
          <input
            v-model="showCritOpp"
            type="checkbox"
          >
          급소
        </label>
      </div>
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
          class="sb-move-row-block"
        >
          <select
            v-model="oppSelectedMoves[activeOppIndex][k - 1]"
            class="sb-move-select"
          >
            <option value="">
              -
            </option>
            <option
              v-for="m in oppMoveOptions(activeOppIndex, k - 1)"
              :key="m"
              :value="m"
            >
              {{ m }}
            </option>
          </select>
          <div class="sb-mine-col-list">
            <div
              v-for="col in mineColumns"
              :key="col.idx + '-' + col.mega"
              class="sb-mine-col-cell"
            >
              <span class="sb-mine-col-label">
                {{ col.label }}<span
                  v-if="col.mega"
                  class="sb-mega-tag"
                >(메가)</span>
              </span>
              <template v-if="oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp)">
                <span :class="['sb-dmg', { 'sb-dmg--crit': showCritOpp }]">
                  {{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).dmgMin }}~{{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).dmgMax }}
                </span>
                <span class="sb-pct">
                  ({{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).pctMin }}~{{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).pctMax }}%)
                </span>
              </template>
              <span
                v-else
                class="sb-dmg-empty"
              >-</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { calculateStat } from '@/utils/stat'
import { calculateDamage, calculateBaseDamage } from '@/utils/move'
import { MegaEvolutionMap } from '@/data/mega-evolutions'
import { getMoveData, formatMoveInfo } from '@/utils/move-info'
import { NatureMap } from '@/data/nature'

const mineAction = reactive({ type: '기술사용', moveIndex: 0, targetIndex: null, useMega: false, dmgPercent: 0 })
const oppAction = reactive({ type: '기술사용', moveIndex: 0, targetIndex: null, useMega: false, damageTaken: 0 })

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

const { selectedMineIndices } = useMineOrderSelection()

const orderedMineIndices = computed(() => [...selectedMineIndices.value])

const activeMineIndex = ref(null)
const activeOppIndex = ref(null)

const showCritMine = ref(false)
const showCritOpp = ref(false)

const battleTurn = ref(1)

const revealedOppIndices = ref([])

const statKeys = [
  { key: 'H', name: '체력' },
  { key: 'A', name: '공격' },
  { key: 'B', name: '방어' },
  { key: 'C', name: '특수공격' },
  { key: 'D', name: '특수방어' },
  { key: 'S', name: '스피드' },
]

// ── 상태이상 / 특수 상태이상 (내 / 상대 각각) ─────────────
const STATUS_CONDITIONS = ['독', '화상', '마비', '잠듦', '얼음']
const SPECIAL_CONDITION_GROUPS = [
  { label: '멘탈허브', items: ['혼란', '반동', '도발', '사슬묶기', '앙코르', '트집', '헤롱헤롱', '회복봉인'] },
  { label: '기타', items: ['소금절이', '씨뿌리기', '악몽', '저주'] },
  { label: '교체불가', items: ['문어굳히기', '물고버티기', '뿌리박기', '조이기'] },
]
const mineStatusCondition = ref('')
const mineSpecialConditions = reactive({})
const oppStatusCondition = ref('')
const oppSpecialConditions = reactive({})

const toggleMineStatusCondition = (name) => {
  mineStatusCondition.value = mineStatusCondition.value === name ? '' : name
}
const toggleMineSpecialCondition = (name) => {
  mineSpecialConditions[name] = !mineSpecialConditions[name]
}
const toggleOppStatusCondition = (name) => {
  oppStatusCondition.value = oppStatusCondition.value === name ? '' : name
}
const toggleOppSpecialCondition = (name) => {
  oppSpecialConditions[name] = !oppSpecialConditions[name]
}

// ── 메가진화 판정 ─────────────
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

const mineCurrentHp = reactive({})
const mineMegaToggle = reactive({})
const oppMegaToggle = reactive({})
const oppHpPercent = reactive({})

const isMineFainted = (idx) => mineCurrentHp[idx] !== undefined && mineCurrentHp[idx] <= 0
const isOppFainted = (idx) => oppHpPercent[idx] !== undefined && oppHpPercent[idx] <= 0

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

const mineDisplayStats = (index) => {
  const mega = getMineMegaData(index)
  const toggled = mineMegaToggle[index] === true
  return buildDisplayStats(selectedPokemon.value[index], mega && toggled, calcStats, index, selectedNature, selectedTool, inputStats)
}
const oppDisplayStats = (index) => {
  const mega = getOppMegaData(index)
  const toggled = oppMegaToggle[index] === true
  return buildDisplayStats(oppSelectedPokemon.value[index], mega && toggled, oppCalcStats, index, oppSelectedNature, oppSelectedTool, oppInputStats)
}

const mineAbilityForCalc = (index) => {
  const mega = getMineMegaData(index)
  const toggled = mineMegaToggle[index] === true
  return (mega && toggled) ? mega.ability : selectedAbility.value[index]
}
const oppAbilityForCalc = (index) => {
  const mega = getOppMegaData(index)
  const toggled = oppMegaToggle[index] === true
  return (mega && toggled) ? mega.ability : oppSelectedAbility.value[index]
}

const ensureMineHpInit = (index) => {
  if (mineCurrentHp[index] === undefined) {
    mineCurrentHp[index] = mineDisplayStats(index)?.H || 0
  }
  if (mineMegaToggle[index] === undefined) {
    mineMegaToggle[index] = false
  }
}
const ensureOppHpInit = (index) => {
  if (oppHpPercent[index] === undefined) {
    oppHpPercent[index] = 100
  }
  if (oppMegaToggle[index] === undefined) {
    oppMegaToggle[index] = false
  }
}

const selectMine = (idx) => {
  if (isMineFainted(idx)) return
  ensureMineHpInit(idx)
  activeMineIndex.value = idx
}
const selectOpp = (idx) => {
  if (isOppFainted(idx)) return
  ensureOppHpInit(idx)
  activeOppIndex.value = idx
  if (!revealedOppIndices.value.includes(idx)) {
    revealedOppIndices.value.push(idx)
  }
}

watch(
  orderedMineIndices,
  (list) => {
    list.forEach((idx) => ensureMineHpInit(idx))
    if (list.length === 0) {
      activeMineIndex.value = null
      return
    }
    if (activeMineIndex.value === null || !list.includes(activeMineIndex.value)) {
      selectMine(list[0])
    }
  },
  { immediate: true },
)

const mineMaxHp = computed(() => (activeMineIndex.value === null ? 0 : (mineDisplayStats(activeMineIndex.value)?.H || 0)))
const oppMaxHp = computed(() => (activeOppIndex.value === null ? 0 : (oppDisplayStats(activeOppIndex.value)?.H || 0)))
const mineHpPercent = computed(() => {
  if (activeMineIndex.value === null || !mineMaxHp.value) return 0
  return Math.round(((mineCurrentHp[activeMineIndex.value] || 0) / mineMaxHp.value) * 100)
})
const mineHpPercentFor = (idx) => {
  const max = mineDisplayStats(idx)?.H || 0
  if (!max) return 100
  const cur = mineCurrentHp[idx] ?? max
  return Math.round((cur / max) * 100)
}
const oppHpBarPercent = computed(() => {
  if (activeOppIndex.value === null) return 0
  return oppHpPercent[activeOppIndex.value] ?? 100
})
const oppHpRange = computed(() => {
  if (activeOppIndex.value === null || !oppMaxHp.value) return { min: 0, max: 0 }
  const p = oppHpPercent[activeOppIndex.value] ?? 100
  const maxHp = oppMaxHp.value
  const pLow = Math.max(0, p - 0.5)
  const pHigh = Math.min(100, p + 0.5)
  const min = Math.max(0, Math.min(maxHp, Math.ceil((pLow / 100) * maxHp)))
  const max = Math.max(0, Math.min(maxHp, Math.floor((pHigh / 100) * maxHp)))
  return { min, max: Math.max(min, max) }
})

// ── 성격 색상 + 아이템 상승 사유 ─────────────
const findNatureBoosting = (statKey) => Object.keys(NatureMap).find((n) => NatureMap[n].up === statKey) || '무보정'

const statMultiplier = (natureName, statKey) => {
  const effect = NatureMap[natureName?.replace(/\([^)]*\)/g, '') || '무보정']
  if (!effect) return 1.0
  if (effect.up === statKey) return 1.1
  if (effect.down === statKey) return 0.9
  return 1.0
}
const mineStatColor = (index, statKey) => {
  if (statKey === 'H') return '#fff'
  const m = statMultiplier(selectedNature.value[index], statKey)
  return m === 1.1 ? 'red' : m === 0.9 ? 'blue' : '#fff'
}
const oppStatColor = (index, statKey) => {
  if (statKey === 'H') return '#fff'
  const m = statMultiplier(oppSelectedNature.value[index], statKey)
  return m === 1.1 ? 'red' : m === 0.9 ? 'blue' : '#fff'
}

const ITEM_STAT_BOOSTS = {
  구애스카프: { stat: 'S', label: '구애스카프' },
  구애머리띠: { stat: 'A', label: '구애머리띠' },
  구애안경: { stat: 'C', label: '구애안경' },
  돌격조끼: { stat: 'D', label: '돌격조끼' },
}
const oppStatBoostReason = (index, statKey) => {
  const boost = ITEM_STAT_BOOSTS[oppSelectedTool.value[index]]
  return boost && boost.stat === statKey ? boost.label : null
}

// ── 날씨 / 필드 / 공간변화 + 턴 카운터 ─────────────
const fieldOptions = ['일렉트릭필드', '그래스필드', '미스트필드', '사이코필드']

const battleWeather = ref('없음')
const battleField = ref('없음')

const weatherTurn = reactive({ current: 0, total: 5 })
const fieldTurn = reactive({ current: 0, total: 5 })

const WEATHER_BASE_TOTAL = 5
const WEATHER_EXTENDED_TOTAL = 8

const changeExtendableTurn = (target, delta) => {
  if (delta > 0) {
    if (target.current >= target.total && target.total < WEATHER_EXTENDED_TOTAL) {
      target.total = WEATHER_EXTENDED_TOTAL
    }
    target.current = Math.min(target.total, target.current + 1)
  } else {
    target.current = Math.max(0, target.current - 1)
  }
}
const advanceEffectTurn = (target, onEnd) => {
  target.current += 1
  if (target.current >= target.total && typeof onEnd === 'function') {
    onEnd()
  }
}

const toggleBattleWeather = (v) => {
  battleWeather.value = v === '없음' ? '없음' : (battleWeather.value === v ? '없음' : v)
  weatherTurn.current = 0
  weatherTurn.total = WEATHER_BASE_TOTAL
}
const toggleBattleField = (v) => {
  battleField.value = battleField.value === v ? '없음' : v
  fieldTurn.current = 0
  fieldTurn.total = WEATHER_BASE_TOTAL
}

const roomOptions = ['매직룸', '트릭룸', '원더룸', '중력']
const activeRooms = reactive({})

const toggleRoom = (name) => {
  if (activeRooms[name]) {
    delete activeRooms[name]
  } else {
    activeRooms[name] = { current: 0, total: 5 }
  }
}
const changeRoomTurn = (name, delta) => {
  const r = activeRooms[name]
  if (!r) return
  r.current = Math.min(r.total, Math.max(0, r.current + delta))
}

// ── 스피드 비교 ─────────────
const mineSpeedStat = computed(() => (activeMineIndex.value === null ? 0 : (mineDisplayStats(activeMineIndex.value)?.S || 0)))

const speedRows = computed(() => {
  if (activeMineIndex.value === null) return []
  const rows = [{ key: 'mine', label: '내 스피드', value: mineSpeedStat.value, isMine: true }]
  if (activeOppIndex.value !== null) {
    const name = oppSelectedPokemon.value[activeOppIndex.value]
    const data = name ? pokemonMap.value[name] : null
    const base = data?.stats?.S || 0
    const neutral = calculateStat('S', base, 0, '무보정', '', '')
    const semi = calculateStat('S', base, 32, '무보정', '', '')
    const max = calculateStat('S', base, 32, findNatureBoosting('S'), '', '')
    rows.push(
      { key: 'neutral', label: '상대 무보정', value: neutral, isMine: false },
      { key: 'semi', label: '상대 준속', value: semi, isMine: false },
      { key: 'max', label: '상대 최속', value: max, isMine: false },
      { key: 'semiScarf', label: '상대 준속 스카프', value: Math.floor(semi * 1.5), isMine: false },
      { key: 'maxScarf', label: '상대 최속 스카프', value: Math.floor(max * 1.5), isMine: false },
    )
  }
  return rows.sort((a, b) => b.value - a.value)
})

// ── 상대 기술 select 옵션 ─────────────
const oppMoveOptions = (index, moveIdx) => {
  const name = oppSelectedPokemon.value[index]
  const allMoves = pokemonMap.value[name]?.moves || []
  const used = oppSelectedMoves.value[index]?.filter((m, i) => i !== moveIdx && m) || []
  return allMoves.filter((m) => !used.includes(m))
}

// 교체 → 기술사용 순으로 처리
const executeTurn = () => {
  if (mineAction.type === '교체' && mineAction.targetIndex !== null) {
    selectMine(mineAction.targetIndex)
    mineAction.targetIndex = null
    mineAction.type = '기술사용'
  }
  if (oppAction.type === '교체' && oppAction.targetIndex !== null) {
    selectOpp(oppAction.targetIndex)
    oppAction.targetIndex = null
    oppAction.type = '기술사용'
  }

  if (mineAction.type === '기술사용') {
    if (mineAction.useMega && activeMineIndex.value !== null) {
      mineMegaToggle[activeMineIndex.value] = true
    }
    if (activeOppIndex.value !== null) {
      const oi = activeOppIndex.value
      const dealtPercent = Math.max(0, Math.min(100, Number(mineAction.dmgPercent) || 0))
      oppHpPercent[oi] = Math.max(0, (oppHpPercent[oi] ?? 100) - dealtPercent)
    }
  }

  if (oppAction.type === '기술사용') {
    if (oppAction.useMega && activeOppIndex.value !== null) {
      oppMegaToggle[activeOppIndex.value] = true
    }
    if (activeMineIndex.value !== null) {
      const mi = activeMineIndex.value
      mineCurrentHp[mi] = Math.max(0, (mineCurrentHp[mi] || 0) - (Number(oppAction.damageTaken) || 0))
    }
  }

  if (battleWeather.value !== '없음') {
    advanceEffectTurn(weatherTurn, () => { battleWeather.value = '없음' })
  }
  if (battleField.value !== '없음') {
    advanceEffectTurn(fieldTurn, () => { battleField.value = '없음' })
  }
  Object.keys(activeRooms).forEach((name) => {
    advanceEffectTurn(activeRooms[name], () => { delete activeRooms[name] })
  })

  oppAction.damageTaken = 0
  mineAction.dmgPercent = 0
  battleTurn.value += 1
}

// ── 랭크업 ─────────────
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

const rankArrowChar = (rank) => (rank < 0 ? '▼' : '▲')
const isRankArrowFilled = (rank, n) => n <= Math.abs(rank)

const mineDisplayName = (index) => {
  const mega = getMineMegaData(index)
  const toggled = mineMegaToggle[index] === true
  return mega && toggled ? mega.megaName : (selectedPokemon.value[index] || '')
}
const oppDisplayName = (index) => {
  const mega = getOppMegaData(index)
  const toggled = oppMegaToggle[index] === true
  return mega && toggled ? mega.megaName : (oppSelectedPokemon.value[index] || '')
}

const mySprite = (index) => {
  const mega = getMineMegaData(index)
  const toggled = mineMegaToggle[index] === true
  if (mega && toggled) return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
  const data = pokemonMap.value[selectedPokemon.value[index]]
  return data?.id ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png` : pokemonImg
}
const opponentSprite = (index) => {
  const mega = getOppMegaData(index)
  const toggled = oppMegaToggle[index] === true
  if (mega && toggled) return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
  const data = pokemonMap.value[oppSelectedPokemon.value[index]]
  return data?.id ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png` : pokemonImg
}

const getMineMoveBaseDamage = (idx, moveIndex) => {
  const moveName = selectedMoves.value[idx]?.[moveIndex]
  if (!moveName) return ''
  const move = getMoveData(moveName)
  if (!move) return ''
  if (move.Category === '변화') return ''
  const stats = mineDisplayStats(idx)
  const attack = move.Category === '물리' ? stats?.A || 0 : stats?.C || 0
  const ability = mineAbilityForCalc(idx)
  const item = selectedTool.value[idx]
  return calculateBaseDamage(move.Power || 0, attack, true, move.Type || '', move.Category, ability, battleWeather.value, item, '', battleField.value)
}

const buildCell = (move, attack, defense, ability, item, defHp, useCrit) => {
  const dmg = calculateDamage(move.Power || 0, attack, defense, true, move.Type || '', move.Category, ability, battleWeather.value, item, '', battleField.value, 50)
  const dmgMin = useCrit ? dmg.critMin : dmg.min
  const dmgMax = useCrit ? dmg.critMax : dmg.max
  return {
    dmgMin,
    dmgMax,
    pctMin: defHp > 0 ? ((dmgMin / defHp) * 100).toFixed(1) : '0.0',
    pctMax: defHp > 0 ? ((dmgMax / defHp) * 100).toFixed(1) : '0.0',
  }
}

const mineCellVsSlot = (moveIndex, oppIdx, useCrit) => {
  if (activeMineIndex.value === null) return null
  if (!oppSelectedPokemon.value[oppIdx]) return null
  const moveName = selectedMoves.value[activeMineIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'
  const atkStats = mineDisplayStats(activeMineIndex.value)
  const defStats = oppDisplayStats(oppIdx)
  const attack = (atkStats?.[atkKey] || 0) * rankMultiplier(mineRanks[atkKey])
  const defRank = oppIdx === activeOppIndex.value ? oppRanks[defKey] : 0
  const defense = (defStats?.[defKey] || 0) * rankMultiplier(defRank)
  return buildCell(move, attack, defense, mineAbilityForCalc(activeMineIndex.value), selectedTool.value[activeMineIndex.value], defStats?.H || 0, useCrit)
}

const mineActionPreview = computed(() => {
  if (mineAction.type !== '기술사용') return null
  if (activeOppIndex.value === null) return null
  return mineCellVsSlot(mineAction.moveIndex, activeOppIndex.value, false)
})

// ── 좌상단 표: 4가지 상대 시나리오 (변화기 제외) ─────────────
const scenarioKeys = ['neutral', 'h32', 'full', 'fullNature']
const scenarioLabel = (sc) => ({ neutral: '무보정', h32: 'H32', full: '풀보정', fullNature: '풀보정(성격)' }[sc])

const mineDamageMoveIndices = computed(() => {
  if (activeMineIndex.value === null) return []
  return [0, 1, 2, 3].filter((k) => {
    const name = selectedMoves.value[activeMineIndex.value]?.[k]
    if (!name) return false
    const move = getMoveData(name)
    return move && move.Category !== '변화'
  })
})

const oppBaseStatsForIndex = (idx) => {
  const mega = getOppMegaData(idx)
  const toggled = oppMegaToggle[idx] === true
  if (mega && toggled) return mega.stats
  const name = oppSelectedPokemon.value[idx]
  return pokemonMap.value[name]?.stats || {}
}

const scenarioDefenseValue = (idx, defKey, scenario) => {
  const base = oppBaseStatsForIndex(idx)
  const baseDef = base?.[defKey] || 0
  if (scenario === 'neutral' || scenario === 'h32') return calculateStat(defKey, baseDef, 0, '무보정', '', '')
  if (scenario === 'full') return calculateStat(defKey, baseDef, 32, '무보정', '', '')
  if (scenario === 'fullNature') return calculateStat(defKey, baseDef, 32, findNatureBoosting(defKey), '', '')
  return 0
}
const scenarioHpValue = (idx, scenario) => {
  const base = oppBaseStatsForIndex(idx)
  const baseHp = base?.H || 0
  const hpEv = scenario === 'neutral' ? 0 : 32
  return calculateStat('H', baseHp, hpEv, '무보정', '', '')
}

const mineCellScenario = (moveIndex, oppIdx, scenario, useCrit) => {
  if (activeMineIndex.value === null) return null
  if (!oppSelectedPokemon.value[oppIdx]) return null
  const moveName = selectedMoves.value[activeMineIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'

  const atkStats = mineDisplayStats(activeMineIndex.value)
  const attack = (atkStats?.[atkKey] || 0) * rankMultiplier(mineRanks[atkKey])
  const defRank = oppIdx === activeOppIndex.value ? oppRanks[defKey] : 0
  const defense = scenarioDefenseValue(oppIdx, defKey, scenario) * rankMultiplier(defRank)
  const defHp = scenarioHpValue(oppIdx, scenario)

  return buildCell(move, attack, defense, mineAbilityForCalc(activeMineIndex.value), selectedTool.value[activeMineIndex.value], defHp, useCrit)
}

// ── 우하단 표: 받은 데미지 역산용 시나리오 ─────────────
const oppScenarioKeys = ['neutral', 'ev32', 'ev32Nature', 'itemBoost']
const oppScenarioLabels = {
  neutral: '무보정',
  ev32: 'A/C 32',
  ev32Nature: 'A/C 32+성격',
  itemBoost: '데미지업 도구(20%)',
}

const scenarioOffenseValue = (idx, atkKey, scenario) => {
  const base = oppBaseStatsForIndex(idx)
  const baseAtk = base?.[atkKey] || 0
  if (scenario === 'neutral') return calculateStat(atkKey, baseAtk, 0, '무보정', '', '')
  if (scenario === 'ev32') return calculateStat(atkKey, baseAtk, 32, '무보정', '', '')
  return calculateStat(atkKey, baseAtk, 32, findNatureBoosting(atkKey), '', '')
}

const oppDamageScenario = (moveIndex, scenario, useCrit) => {
  if (activeMineIndex.value === null || activeOppIndex.value === null) return null
  const moveName = oppSelectedMoves.value[activeOppIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'

  const attack = scenarioOffenseValue(activeOppIndex.value, atkKey, scenario === 'itemBoost' ? 'ev32Nature' : scenario) * rankMultiplier(oppRanks[atkKey])
  const defStats = mineDisplayStats(activeMineIndex.value)
  const defense = (defStats?.[defKey] || 0) * rankMultiplier(mineRanks[defKey])

  const cell = buildCell(move, attack, defense, oppAbilityForCalc(activeOppIndex.value), oppSelectedTool.value[activeOppIndex.value], defStats?.H || 0, useCrit)
  if (scenario === 'itemBoost') {
    const defHp = defStats?.H || 0
    const dmgMin = Math.floor(cell.dmgMin * 1.2)
    const dmgMax = Math.floor(cell.dmgMax * 1.2)
    return {
      dmgMin,
      dmgMax,
      pctMin: defHp > 0 ? ((dmgMin / defHp) * 100).toFixed(1) : '0.0',
      pctMax: defHp > 0 ? ((dmgMax / defHp) * 100).toFixed(1) : '0.0',
    }
  }
  return cell
}

const mineStatsForColumn = (idx, forceMega) => {
  const mega = getMineMegaData(idx)
  const useMega = forceMega === true ? true : (forceMega === false ? false : mineMegaToggle[idx] === true)
  return buildDisplayStats(selectedPokemon.value[idx], mega && useMega, calcStats, idx, selectedNature, selectedTool, inputStats)
}

const mineColumns = computed(() => {
  const cols = []
  orderedMineIndices.value.forEach((idx) => {
    cols.push({ idx, mega: false, label: mineDisplayName(idx) })
    if (idx === activeMineIndex.value) {
      const megaData = getMineMegaData(idx)
      if (megaData && mineMegaToggle[idx] !== true) {
        cols.push({ idx, mega: true, label: megaData.megaName })
      }
    }
  })
  return cols
})

const oppCellVsMine = (moveIndex, idx, forceMega, useCrit) => {
  if (activeOppIndex.value === null) return null
  const moveName = oppSelectedMoves.value[activeOppIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'

  const atkStats = oppDisplayStats(activeOppIndex.value)
  const attack = (atkStats?.[atkKey] || 0) * rankMultiplier(oppRanks[atkKey])
  const defStats = mineStatsForColumn(idx, forceMega)
  const defRank = idx === activeMineIndex.value ? mineRanks[defKey] : 0
  const defense = (defStats?.[defKey] || 0) * rankMultiplier(defRank)

  return buildCell(move, attack, defense, oppAbilityForCalc(activeOppIndex.value), oppSelectedTool.value[activeOppIndex.value], defStats?.H || 0, useCrit)
}

const oppScenarioMatches = computed(() => {
  const dmg = Number(oppAction.damageTaken)
  if (!dmg || activeMineIndex.value === null || activeOppIndex.value === null) return []
  return oppScenarioKeys
    .map((sc) => ({ key: sc, label: oppScenarioLabels[sc], data: oppDamageScenario(oppAction.moveIndex, sc, false) }))
    .filter((s) => s.data && dmg >= s.data.dmgMin && dmg <= s.data.dmgMax)
})
</script>

<style scoped>
.sb-page {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) 300px minmax(320px, 1fr);
  grid-template-rows: auto auto;
  grid-template-areas:
    "mineMoves  field       oppStatus"
    "mineStatus fieldBottom oppMoves";
  gap: 12px;
  padding: 8px;
  align-items: start;
}
.sb-cell-mine-moves  { grid-area: mineMoves; }
.sb-cell-field        { grid-area: field; border-left: 3px solid #e53935; padding-left: 10px; }
.sb-cell-opp-status  { grid-area: oppStatus; border-left: 3px solid #e53935; padding-left: 10px; }
.sb-cell-mine-status { grid-area: mineStatus; }
.sb-cell-empty        { grid-area: fieldBottom; border-left: 3px solid #e53935; padding-left: 10px; }
.sb-cell-opp-moves   { grid-area: oppMoves; border-left: 3px solid #e53935; padding-left: 10px; }

.sb-panel { background:#555; border-radius:6px; padding:8px; color:#fff; min-height:60px; box-sizing:border-box; }
.sb-panel-header-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }

.sb-panel--action-log { display:flex; flex-direction:column; gap:12px; }
.sb-action-block { display:flex; flex-direction:column; gap:6px; }
.sb-action-title { margin:0; font-size:12px; color:#ffeb3b; }
.sb-action-type-row { display:flex; gap:12px; font-size:11px; }
.sb-action-detail { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sb-action-detail select { font-size:11px; padding:2px 4px; }
.sb-input-label { font-size:10px; color:#999; }
.sb-preview { font-size:10px; color:#8bc34a; }
.sb-preview--none { color:#ff8a65; }

.sb-panel--moves { align-self:start; }

.sb-dmg-table-wrap { overflow-x:auto; }
.sb-dmg-table { border-collapse:collapse; font-size:10px; width:100%; }
.sb-dmg-table th, .sb-dmg-table td { border:1px solid #666; padding:3px 5px; text-align:center; vertical-align:top; }
.sb-table-sprite { width:28px; height:28px; object-fit:cover; }
.sb-move-name { text-align:left; color:#ccc; white-space:nowrap; }

.sb-scenario-line {
  display:grid;
  grid-template-columns: 76px 56px 66px;
  column-gap:4px;
  align-items:center;
  white-space:nowrap;
  font-size:10px;
  line-height:14px;
  padding:1px 0;
}
.sb-scenario-label { color:#999; text-align:left; }
.sb-scenario-line .sb-dmg { text-align:right; }
.sb-scenario-line .sb-pct { text-align:right; }
.sb-scenario-line .sb-dmg-empty { grid-column: 2 / span 2; text-align:center; }

.sb-panel--field { display:flex; flex-direction:column; gap:10px; }
.sb-panel--opp-status,
.sb-panel--mine-status { display:flex; flex-direction:column; gap:8px; }

.sb-panel-title { margin:0 0 6px 0; font-size:13px; }

.sb-move-list { display:flex; flex-direction:column; gap:6px; }
.sb-move-row-block { display:flex; flex-direction:column; gap:3px; border-bottom:1px solid #666; padding-bottom:6px; }
.sb-move-select { font-size:11px; padding:2px 4px; width:auto; max-width:160px; }
.sb-dmg { font-weight:bold; font-size:11px; }
.sb-dmg--crit { color:#ff5252; }
.sb-pct { font-size:9px; color:#aaa; }
.sb-dmg-empty { color:#888; }

.sb-field-row { display:flex; align-items:flex-start; flex-wrap:wrap; gap:6px; }
.sb-field-label { font-size:10px; color:#ccc; width: 26px; padding-top:2px; }
.sb-field-buttons { display:flex; flex-wrap:wrap; gap:2px; align-items:flex-start; }
.sb-weather-buttons { display:flex; gap:4px; align-items:flex-start; }
.sb-weather-col { display:flex; flex-direction:column; gap:2px; }
.sb-field-btn { font-size:10px; padding:2px 6px; border:1px solid #999; border-radius:4px; cursor:pointer; background:#444; color:#fff; }
.sb-field-btn.active { background:#4caf50; }
.sb-crit-toggle { display:flex; align-items:center; gap:4px; font-size:12px; color:#ffeb3b; cursor:pointer; }

.sb-turn-counter { display:flex; align-items:center; gap:4px; font-size:10px; color:#ccc; margin-left:4px; }
.sb-turn-counter button { font-size:10px; width:16px; height:16px; line-height:1; border:1px solid #888; background:#444; color:#fff; cursor:pointer; border-radius:3px; }

.sb-battle-turn { font-size:11px; color:#ffeb3b; font-weight:bold; margin-top:2px; }

.sb-speed-box { display:flex; flex-direction:column; gap:2px; border-top:1px solid #666; padding-top:6px; }
.sb-speed-row { display:flex; justify-content:space-between; font-size:11px; }
.sb-speed-row--mine { color:#ff5252; font-weight:bold; }
.sb-placeholder-small { font-size:10px; color:#999; }

.sb-status-name { font-size:13px; font-weight:bold; }
.sb-mega-toggle { display:flex; align-items:center; gap:4px; font-size:10px; color:#ffeb3b; cursor:pointer; }
.sb-hp-bar-bg { width:100%; height:8px; background:#222; border-radius:4px; overflow:hidden; }
.sb-hp-bar-fill { height:100%; background:linear-gradient(90deg,#8bc34a,#4caf50); }
.sb-hp-text { font-size:10px; color:#ccc; }

.sb-status-card { display:flex; flex-direction:row; align-items:flex-start; gap:8px; }
.sb-status-sprite { width:48px; height:48px; object-fit:cover; border:2px solid #333; border-radius:6px; background:#e8e8e8; flex-shrink:0; }
.sb-status-info { display:flex; flex-direction:column; gap:2px; width:140px; min-width:0; }

.sb-compact-row { display:flex; gap:12px; align-items:flex-start; }

.sb-realstats-box { display:flex; flex-direction:column; gap:1px; font-size:11px; }
.sb-realstats-box--compact { flex:1; min-width:0; }
.sb-realstat-row { display:flex; align-items:center; gap:4px; }
.sb-realstat-name { width:50px; color:#ccc; font-size:10px; }
.sb-realstat-value { font-weight:bold; width:30px; text-align:right; font-size:11px; }
.sb-realstat-reason { font-size:8px; color:#ffeb3b; }
.sb-ev-tag { font-size:9px; color:#aaa; margin-left:2px; }

.sb-rank-box { display:flex; flex-direction:column; gap:2px; }
.sb-rank-row { display:flex; align-items:center; gap:4px; }
.sb-rank-name { width:50px; font-size:10px; }
.sb-rank-arrows { display:flex; gap:1px; font-size:9px; width:60px; }
.sb-arrow { color:#666; }
.sb-arrow--pos { color:#f44336; }
.sb-arrow--neg { color:#2196f3; }
.sb-rank-value { width:22px; text-align:right; font-size:10px; }
.sb-rank-btns { display:flex; flex-direction:column; }
.sb-rank-btn { font-size:7px; line-height:7px; padding:0 3px; border:1px solid #888; background:#444; color:#fff; cursor:pointer; }

/* 상태이상 / 특수 상태이상 */
.sb-status-conditions { display:flex; flex-direction:column; gap:4px; }
.sb-condition-row { display:flex; align-items:center; flex-wrap:wrap; gap:4px; }
.sb-condition-group-label { font-size:9px; color:#ccc; width:110px; flex-shrink:0; }
.sb-condition-btn { font-size:9px; padding:2px 6px; border:1px solid #999; border-radius:10px; cursor:pointer; background:#444; color:#fff; }
.sb-condition-btn.active { background:#e53935; border-color:#e53935; }

/* 상대 확정/후보 영역 (항상 표시, 좌우 배치) */
.sb-opp-team-area { display:flex; gap:16px; flex-wrap:wrap; margin-top:8px; }
.sb-opp-confirmed-block,
.sb-opp-candidate-block { flex:1; min-width:160px; display:flex; flex-direction:column; gap:4px; }
.sb-mini-section-label { font-size:10px; color:#ccc; }

/* 미니 목록 아이템 */
.sb-mini-list { display:flex; flex-wrap:wrap; gap:8px; }
.sb-mini-item {
  position: relative;
  display:flex;
  align-items:center;
  gap:6px;
  background:#666;
  border:2px solid #000;
  border-radius:6px;
  padding:4px 10px 4px 6px;
  cursor:pointer;
  color:#fff;
  outline: 2px solid transparent;
  transition: outline-color 0.15s ease;
}
.sb-mini-item--active { outline: 3px solid #4caf50; }
.sb-mini-item--fainted { opacity:0.35; cursor:not-allowed; }
.sb-mini-sprite { width:32px; height:32px; object-fit:cover; border:1px solid #333; border-radius:4px; background:#e8e8e8; }
.sb-mini-name { font-size:11px; white-space:nowrap; }

/* 내 파티 카드 (entrySelect.vue와 동일한 가로 배치, 항상 표시) */
.sb-mine-team { display:flex; flex-direction:column; gap:6px; }
.sb-mine-card {
  position: relative;
  display:flex;
  flex-direction:row;
  align-items:center;
  gap:12px;
  background:#666;
  border:2px solid #000;
  border-radius:6px;
  padding:6px 12px;
  cursor:pointer;
  outline: 2px solid transparent;
  transition: outline-color 0.15s ease;
}
.sb-mine-card--active { outline: 3px solid #4caf50; }
.sb-mine-card--fainted { opacity:0.4; cursor:not-allowed; }
.sb-mine-card-sprite { width:44px; height:44px; object-fit:cover; border:2px solid #333; border-radius:6px; background:#e8e8e8; flex-shrink:0; }
.sb-mine-card-name-block { display:flex; flex-direction:column; gap:2px; width:110px; flex-shrink:0; }
.sb-mine-card-name { font-size:13px; font-weight:bold; color:#fff; }
.sb-mine-card-stats { display:flex; flex-direction:column; gap:1px; font-size:10px; flex-shrink:0; }
.sb-mine-card-stats-header { display:flex; align-items:center; gap:4px; }
.sb-mine-card-stats-label { width:30px; font-size:8px; color:#888; text-align:right; }
.sb-mine-card-moves { display:flex; flex-direction:column; gap:2px; flex:1; min-width:220px; }
.sb-mine-card-move-row-wrap { display:flex; flex-direction:column; gap:1px; }
.sb-mine-card-move-row { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:10px; }
.sb-mine-card-move-name { color:#fff; }
.sb-mine-card-move-dmg { color:#ffeb3b; font-size:9px; }
.sb-mine-card-move-info { font-size:9px; color:#ccc; white-space:normal; min-height:11px; }

.sb-placeholder { font-size:12px; color:#aaa; padding:12px; }
.sb-dmg-input { width:70px; font-size:11px; padding:2px 4px; }
.sb-execute-btn {
  align-self: flex-start;
  font-size:12px;
  padding:6px 14px;
  border:none;
  border-radius:4px;
  background:#4caf50;
  color:#fff;
  cursor:pointer;
}
.sb-room-status-list { display:flex; flex-wrap:wrap; gap:8px; margin-top:2px; }
.sb-mine-col-list { display:flex; flex-direction:column; gap:2px; margin-left:4px; }
.sb-mine-col-cell { display:flex; align-items:center; gap:6px; font-size:10px; white-space:nowrap; }
.sb-mine-col-label { color:#ccc; width:70px; flex-shrink:0; }
.sb-mega-tag { color:#ffeb3b; font-size:9px; margin-left:2px; }
</style>