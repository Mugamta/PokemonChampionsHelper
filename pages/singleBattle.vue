<!-- pages/singleBattle.vue -->
<template>
  <div class="sb-page">
    <!-- 좌상단: 내 기술 목록 (고정) — 상대 6마리 각각에 대한 4가지 시나리오 데미지 -->
    <section class="sb-panel sb-panel--moves sb-cell-mine-moves">
      <div class="sb-panel-header-row">
        <h4 class="sb-panel-title">
          예상 데미지{{ previewMineName ? ` (${previewMineName} 공격)` : '' }}
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
        v-if="previewMineIndex === null"
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
                v-for="idx in mineTableOppSlots"
                :key="'opp-head-' + idx"
              >
                <img
                  :src="opponentSprite(idx)"
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
                {{ selectedMoves[previewMineIndex]?.[k] || '-' }}
              </td>
              <td
                v-for="idx in mineTableOppSlots"
                :key="'mine-cell-' + idx"
              >
                <template v-if="oppSelectedPokemon[idx]">
                  <div
                    v-for="sc in scenarioKeys"
                    :key="sc"
                    class="sb-scenario-line"
                  >
                    <span class="sb-scenario-label">{{ scenarioLabel(sc) }}</span>
                    <template v-if="mineCellScenario(k, idx, sc, showCritMine)">
                      <span
                        class="sb-dmg"
                        :class="{ 'sb-dmg--lethal': mineCellScenario(k, idx, sc, showCritMine).isLethalRange }"
                      >{{ mineCellScenario(k, idx, sc, showCritMine).dmgMin }}~{{ mineCellScenario(k, idx, sc, showCritMine).dmgMax }}</span>
                      <span
                        class="sb-pct"
                        :class="{ 'sb-pct--lethal': mineCellScenario(k, idx, sc, showCritMine).isLethalRange }"
                      >({{ mineCellScenario(k, idx, sc, showCritMine).pctMin }}~{{ mineCellScenario(k, idx, sc, showCritMine).pctMax }}%)</span>
                      <span
                        v-if="mineCellScenario(k, idx, sc, showCritMine).koLabel"
                        class="sb-ko-label"
                      >{{ mineCellScenario(k, idx, sc, showCritMine).koLabel }}</span>
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

    <!-- 우상단: 상대 카드 + 실능치 + 랭크업 상태 + 상태이상 + 확정/후보 목록 -->
    <section class="sb-panel sb-panel--opp-status sb-cell-opp-status">
      <template v-if="activeOppIndex !== null">
        <div class="sb-status-card">
          <img
            :src="opponentSprite(activeOppIndex)"
            class="sb-status-sprite"
            @error="$event.target.src = pokemonImg"
          >
          <div class="sb-status-info">
            <span class="sb-status-name">
              {{ oppDisplayName(activeOppIndex) }}
              <span
                v-if="oppStatusSummary"
                class="sb-status-summary"
              >{{ oppStatusSummary }}</span>
            </span>
          </div>
          <div class="sb-status-right">
            <span
              class="sb-status-ability"
              :title="abilityDescription(oppAbilityForCalc(activeOppIndex))"
            >{{ oppAbilityForCalc(activeOppIndex) || '-' }}</span>
            <label
              v-if="getOppMegaData(activeOppIndex) && oppMegaToggle[activeOppIndex] !== true"
              class="sb-mega-toggle"
            >
              <input
                :checked="oppMegaToggle[activeOppIndex]"
                type="checkbox"
                @change="onOppMegaCheckboxChange(activeOppIndex, $event.target.checked)"
              >
              메가진화
            </label>
          </div>
        </div>

        <!-- 체력 / 체력바 / 실능치 / 랭크업을 한 행에 배치 -->
        <div class="sb-compact-row">
          <div class="sb-hp-block">
            <div class="sb-hp-bar-bg">
              <div
                class="sb-hp-bar-fill"
                :style="{ width: oppHpBarPercent + '%' }"
              />
            </div>
            <span class="sb-hp-text">{{ oppHpRange.min }}~{{ oppHpRange.max }}/{{ oppMaxHp }} ({{ Math.round(oppHpBarPercent) }}%)</span>
          </div>

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

      <!-- 상태이상 / 특수 상태이상 (상대) — 항상 표시, 위 행 아래에 가로로 배치 -->
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
            {{ specialConditionLabel(s, !!oppSpecialConditions[s], oppSpecialTurns) }}
          </button>
        </div>
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

    <!-- 좌하단: 내 파티(entrySelect 카드 스타일) + 현재 포켓몬 상태카드 + 상태이상 + 실능치/랭크업 -->
    <section class="sb-panel sb-panel--mine-status sb-cell-mine-status">
      <!-- 내 파티 (entrySelect.vue 카드 스타일, 현재 나와있는 포켓몬은 제외, 가로 배치) -->
      <div class="sb-mine-team">
        <div
          v-for="idx in benchMineIndices"
          :key="'mine-card-' + idx"
          class="sb-mine-card"
          :class="{ 'sb-mine-card--fainted': isMineFainted(idx), 'sb-mine-card--previewing': idx === previewMineIndex }"
          @click="previewMineIndex = idx"
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
            <label
              v-if="getMineMegaData(idx) && mineMegaToggle[idx] !== true"
              class="sb-mega-toggle"
              @click.stop
            >
              <input
                :checked="mineMegaToggle[idx]"
                type="checkbox"
                @change="onMineMegaCheckboxChange(idx, $event.target.checked)"
              >
              메가진화
            </label>
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
        <span
          v-if="!benchMineIndices.length"
          class="sb-placeholder-small"
        >대기 중인 포켓몬 없음</span>
      </div>

      <!-- 현재 활성 포켓몬 요약 카드 (사진/특성/메가진화) — 클릭 시 예상 데미지 미리보기가 이 포켓몬으로 돌아옴 -->
      <div
        v-if="activeMineIndex !== null"
        class="sb-status-card sb-status-card--clickable"
        :class="{ 'sb-status-card--previewing': previewMineIndex === activeMineIndex }"
        @click="previewMineIndex = activeMineIndex"
      >
        <img
          :src="mySprite(activeMineIndex)"
          class="sb-status-sprite"
          @error="$event.target.src = pokemonImg"
        >
        <div class="sb-status-info">
          <span class="sb-status-name">
            {{ mineDisplayName(activeMineIndex) }}
            <span
              v-if="mineStatusSummary"
              class="sb-status-summary"
            >{{ mineStatusSummary }}</span>
          </span>
        </div>
        <div class="sb-status-right">
          <span
            class="sb-status-ability"
            :title="abilityDescription(mineAbilityForCalc(activeMineIndex))"
          >{{ mineAbilityForCalc(activeMineIndex) || '-' }}</span>
          <label
            v-if="getMineMegaData(activeMineIndex) && mineMegaToggle[activeMineIndex] !== true"
            class="sb-mega-toggle"
          >
            <input
              :checked="mineMegaToggle[activeMineIndex]"
              type="checkbox"
              @change="onMineMegaCheckboxChange(activeMineIndex, $event.target.checked)"
            >
            메가진화
          </label>
        </div>
      </div>

      <!-- 상태이상 / 특수 상태이상 (내) — 항상 표시, 실능치/랭크업 행보다 위에 배치 -->
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
            {{ specialConditionLabel(s, !!mineSpecialConditions[s], mineSpecialTurns) }}
          </button>
        </div>
      </div>

      <!-- 체력 / 체력바 / 실능치 / 랭크업을 한 행에 배치 -->
      <div
        v-if="activeMineIndex !== null"
        class="sb-compact-row"
      >
        <div class="sb-hp-block">
          <div class="sb-hp-bar-bg">
            <div
              class="sb-hp-bar-fill"
              :style="{ width: mineHpPercent + '%' }"
            />
          </div>
          <span class="sb-hp-text">{{ Math.round(mineCurrentHp[activeMineIndex] || 0) }}/{{ mineMaxHp }} ({{ mineHpPercent }}%)</span>
        </div>

        <div class="sb-realstats-box sb-realstats-box--compact">
          <div
            v-for="stat in statKeys"
            :key="'mine-active-real-' + stat.key"
            class="sb-realstat-row"
          >
            <span class="sb-realstat-name">{{ stat.name }}</span>
            <span
              class="sb-realstat-value"
              :style="{ color: mineStatColor(activeMineIndex, stat.key) }"
            >{{ mineDisplayStats(activeMineIndex)[stat.key] ?? 0 }}</span>
          </div>
        </div>

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

      <div class="sb-inflict-status-block">
        <label class="sb-inflict-checkbox">
          <input
            v-model="mineInflictsStatus"
            type="checkbox"
          >
          내 포켓몬에게 상태이상 발생
        </label>
        <div
          v-if="mineInflictsStatus"
          class="sb-status-conditions"
        >
          <div class="sb-condition-row">
            <span class="sb-condition-group-label">상태이상</span>
            <button
              v-for="s in STATUS_CONDITIONS"
              :key="'mine-inflict-cond-' + s"
              type="button"
              class="sb-condition-btn"
              :class="{ active: mineInflictStatusChoice === s }"
              @click="mineInflictStatusChoice = mineInflictStatusChoice === s ? '' : s"
            >
              {{ s }}
            </button>
          </div>
          <div
            v-for="group in SPECIAL_CONDITION_GROUPS"
            :key="'mine-inflict-group-' + group.label"
            class="sb-condition-row"
          >
            <span class="sb-condition-group-label">특수 상태이상({{ group.label }})</span>
            <button
              v-for="s in group.items"
              :key="'mine-inflict-cond-' + s"
              type="button"
              class="sb-condition-btn"
              :class="{ active: mineInflictStatusChoice === s }"
              @click="mineInflictStatusChoice = mineInflictStatusChoice === s ? '' : s"
            >
              {{ s }}
            </button>
          </div>
        </div>
      </div>

      <div class="sb-inflict-status-block">
        <label class="sb-inflict-checkbox">
          <input
            v-model="oppInflictsStatus"
            type="checkbox"
          >
          상대 포켓몬에게 상태이상 발생
        </label>
        <div
          v-if="oppInflictsStatus"
          class="sb-status-conditions"
        >
          <div class="sb-condition-row">
            <span class="sb-condition-group-label">상태이상</span>
            <button
              v-for="s in STATUS_CONDITIONS"
              :key="'opp-inflict-cond-' + s"
              type="button"
              class="sb-condition-btn"
              :class="{ active: oppInflictStatusChoice === s }"
              @click="oppInflictStatusChoice = oppInflictStatusChoice === s ? '' : s"
            >
              {{ s }}
            </button>
          </div>
          <div
            v-for="group in SPECIAL_CONDITION_GROUPS"
            :key="'opp-inflict-group-' + group.label"
            class="sb-condition-row"
          >
            <span class="sb-condition-group-label">특수 상태이상({{ group.label }})</span>
            <button
              v-for="s in group.items"
              :key="'opp-inflict-cond-' + s"
              type="button"
              class="sb-condition-btn"
              :class="{ active: oppInflictStatusChoice === s }"
              @click="oppInflictStatusChoice = oppInflictStatusChoice === s ? '' : s"
            >
              {{ s }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="turnOrderForecast.length"
        class="sb-turn-order-forecast"
      >
        <div
          v-for="(line, i) in turnOrderForecast"
          :key="'turn-order-' + i"
        >
          {{ line }}
        </div>
      </div>

      <div
        v-if="mineStatusDamageForecast || oppStatusDamageForecast"
        class="sb-status-forecast"
      >
        <div v-if="mineStatusDamageForecast">
          {{ mineStatusDamageForecast }}
        </div>
        <div v-if="oppStatusDamageForecast">
          {{ oppStatusDamageForecast }}
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
                <span :class="['sb-dmg', { 'sb-dmg--crit': showCritOpp, 'sb-dmg--lethal': oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).isLethalRange }]">
                  {{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).dmgMin }}~{{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).dmgMax }}
                </span>
                <span
                  class="sb-pct"
                  :class="{ 'sb-pct--lethal': oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).isLethalRange }"
                >
                  ({{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).pctMin }}~{{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).pctMax }}%)
                </span>
                <span
                  v-if="oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).koLabel"
                  class="sb-ko-label"
                >{{ oppCellVsMine(k - 1, col.idx, col.mega, showCritOpp).koLabel }}</span>
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
import { calculateDamage, calculateBaseDamage, calculateDamageRolls, formatKoLabel, calculateStatusDamage } from '@/utils/move'
import { MegaEvolutionMap } from '@/data/mega-evolutions'
import { getMoveData, formatMoveInfo } from '@/utils/move-info'
import { NatureMap } from '@/data/nature'

const mineAction = reactive({ type: '기술사용', moveIndex: 0, targetIndex: null, useMega: false, dmgPercent: 0 })
const oppAction = reactive({ type: '기술사용', moveIndex: 0, targetIndex: null, useMega: false, damageTaken: 0 })

// 체크 시 아래에 상태이상~특수 상태이상 선택 목록이 노출되고,
// "이번 턴 적용" 클릭 시 선택된 상태이상이 각각 내/상대 포켓몬에게 적용된다.
const mineInflictsStatus = ref(false)
const oppInflictsStatus = ref(false)
const mineInflictStatusChoice = ref('')
const oppInflictStatusChoice = ref('')

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
const benchMineIndices = computed(() => orderedMineIndices.value.filter((idx) => idx !== activeMineIndex.value))

const activeMineIndex = ref(null)
const activeOppIndex = ref(null)

// 좌상단 "예상 데미지" 표에 표시할 미리보기 대상(실제 필드 교체와는 별개).
// 기본값은 현재 실제로 나와있는 포켓몬이며, 벤치 카드를 클릭하면 그 포켓몬의 예상 데미지만 미리 볼 수 있다.
const previewMineIndex = ref(null)
watch(activeMineIndex, (val) => { previewMineIndex.value = val }, { immediate: true })

const showCritMine = ref(false)
const showCritOpp = ref(false)

const battleTurn = ref(1)

const revealedOppIndices = ref([])

// 좌상단 "예상 데미지" 표에 표시할 상대 슬롯. 3마리가 모두 확정되면 그 3마리만,
// 아직 확정 전이면 기존처럼 6칸(후보 포함)을 모두 보여준다.
const mineTableOppSlots = computed(() => (revealedOppIndices.value.length === 3 ? [...revealedOppIndices.value] : [0, 1, 2, 3, 4, 5]))

const statKeys = [
  { key: 'H', name: '체력' },
  { key: 'A', name: '공격' },
  { key: 'B', name: '방어' },
  { key: 'C', name: '특수공격' },
  { key: 'D', name: '특수방어' },
  { key: 'S', name: '스피드' },
]

// ── 상태이상 / 특수 상태이상 (내 / 상대 각각) ─────────────
const STATUS_CONDITIONS = ['독', '맹독', '화상', '마비', '잠듦', '얼음']
const SPECIAL_CONDITION_GROUPS = [
  { label: '멘탈허브', items: ['혼란', '반동', '도발', '사슬묶기', '앙코르', '트집', '헤롱헤롱', '회복봉인'] },
  { label: '기타', items: ['소금절이', '씨뿌리기', '악몽', '저주'] },
  { label: '교체불가', items: ['문어굳히기', '물고버티기', '뿌리박기', '조이기'] },
]
const mineStatusCondition = ref('')
const mineSpecialConditions = reactive({})
const oppStatusCondition = ref('')
const oppSpecialConditions = reactive({})

// 특수 상태이상 지속 턴 수(null/미기재면 무한 지속 = ∞ 표시, 숫자면 총 지속 턴)
const SPECIAL_CONDITION_DURATIONS = {
  혼란: 4,
  반동: 1,
  도발: 3,
  사슬묶기: null,
  앙코르: 4,
  트집: null,
  헤롱헤롱: null,
  회복봉인: 5,
  소금절이: null,
  씨뿌리기: null,
  악몽: null,
  저주: null,
  문어굳히기: null,
  물고버티기: 5,
  뿌리박기: null,
  조이기: 5,
}
// 특수 상태이상별 현재 경과 턴(지속 턴이 있는 항목만 사용)
const mineSpecialTurns = reactive({})
const oppSpecialTurns = reactive({})

const specialConditionLabel = (name, active, turnsMap) => {
  if (!active) return name
  const total = SPECIAL_CONDITION_DURATIONS[name]
  if (total === null || total === undefined) return `${name}(∞)`
  const current = turnsMap[name] || 1
  return `${name}(${current}/${total})`
}

// 맹독 경과 턴(걸린 첫 턴 1, 다음 턴 2 ...) — 상태이상이 바뀌면 초기화
const mineToxicTurn = ref(0)
const oppToxicTurn = ref(0)

const toggleMineStatusCondition = (name) => {
  mineStatusCondition.value = mineStatusCondition.value === name ? '' : name
  mineToxicTurn.value = 0
}
const toggleMineSpecialCondition = (name) => {
  const turningOn = !mineSpecialConditions[name]
  mineSpecialConditions[name] = turningOn
  if (turningOn) {
    mineSpecialTurns[name] = 1
  } else {
    delete mineSpecialTurns[name]
  }
}
const toggleOppStatusCondition = (name) => {
  oppStatusCondition.value = oppStatusCondition.value === name ? '' : name
  oppToxicTurn.value = 0
}
const toggleOppSpecialCondition = (name) => {
  const turningOn = !oppSpecialConditions[name]
  oppSpecialConditions[name] = turningOn
  if (turningOn) {
    oppSpecialTurns[name] = 1
  } else {
    delete oppSpecialTurns[name]
  }
}

// 특성 설명(마우스 호버 툴팁용) — 계산 로직에서 다루는 특성 위주로 기재
const ABILITY_DESCRIPTIONS = {
  천하장사: '물리 기술의 위력이 1.5배가 된다.',
  근성: '상태이상(화상/마비 등)에 걸리면 공격 관련 스탯이 1.5배가 된다.',
  날씨부정: '날씨의 효과를 무시한다.',
  에어록: '날씨의 효과를 무시한다.',
  내열: '화상으로 인한 매 턴 데미지가 절반(1/32)으로 줄어든다.',
  부유: '땅 타입 기술에 맞지 않으며, 필드의 효과를 받지 않는다.',
}
const abilityDescription = (name) => (name ? (ABILITY_DESCRIPTIONS[name] || name) : '')

// 이름 옆에 표시할 상태이상 요약(맹독 데미지 비율 + 활성화된 특수 상태이상 지속 턴)
const buildStatusSummary = (statusCondition, toxicTurn, specialConditions, specialTurns) => {
  const parts = []
  if (statusCondition) {
    if (statusCondition === '맹독') {
      parts.push(`맹독(${toxicTurn + 1}/16)`)
    } else {
      parts.push(statusCondition)
    }
  }
  Object.keys(specialConditions).forEach((name) => {
    if (specialConditions[name]) {
      parts.push(specialConditionLabel(name, true, specialTurns))
    }
  })
  return parts.join(', ')
}
const mineStatusSummary = computed(() => buildStatusSummary(mineStatusCondition.value, mineToxicTurn.value, mineSpecialConditions, mineSpecialTurns))
const oppStatusSummary = computed(() => buildStatusSummary(oppStatusCondition.value, oppToxicTurn.value, oppSpecialConditions, oppSpecialTurns))

// 중앙 하단: "이번 턴 적용" 시 독/맹독/화상으로 깎일 예상 데미지 문구
const buildStatusDamageForecast = (label, statusCondition, toxicTurn, maxHp, ability) => {
  if (!statusCondition || !['독', '맹독', '화상'].includes(statusCondition)) return ''
  const nextToxicTurn = statusCondition === '맹독' ? toxicTurn + 1 : toxicTurn
  const dmg = calculateStatusDamage(maxHp, statusCondition, ability, nextToxicTurn)
  const fraction = statusCondition === '독'
    ? '1/8'
    : statusCondition === '화상'
      ? (ability === '내열' ? '1/32' : '1/16')
      : `${nextToxicTurn}/16`
  return `턴 종료 시 ${label} ${statusCondition}으로 인하여 ${dmg}를 입음 (${fraction})`
}
const mineStatusDamageForecast = computed(() => {
  if (activeMineIndex.value === null) return ''
  return buildStatusDamageForecast('내 포켓몬이', mineStatusCondition.value, mineToxicTurn.value, mineDisplayStats(activeMineIndex.value)?.H || 0, mineAbilityForCalc(activeMineIndex.value))
})
const oppStatusDamageForecast = computed(() => {
  if (activeOppIndex.value === null) return ''
  return buildStatusDamageForecast('상대 포켓몬이', oppStatusCondition.value, oppToxicTurn.value, oppDisplayStats(activeOppIndex.value)?.H || 0, oppAbilityForCalc(activeOppIndex.value))
})

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

// mega(진짜 토글이든, 미리보기 override든)일 때 종족값 기반으로 직접 실능치를 계산
const calcStatsFromBaseStats = (baseStats, index, natureRef, itemRef, evsRef) => {
  const natureName = natureRef.value[index]?.replace(/\([^)]*\)/g, '') || '무보정'
  const itemName = itemRef.value[index] || ''
  const keys = ['H', 'A', 'B', 'C', 'D', 'S']
  const result = {}
  keys.forEach((k) => {
    result[k] = calculateStat(k, baseStats[k] || 0, evsRef.value[index]?.[k] || 0, natureName, itemName, '')
  })
  return result
}

// megaData: 메가 진화 데이터, useActualMegaStats: 실제 토글 상태와 일치하는 경우(=진짜 메가 상태)에만
// 미리 계산된 calcStatsRef를 그대로 쓰고, 그렇지 않으면(=미리보기 override) 메가 종족값으로 직접 계산한다.
const buildDisplayStats = (name, mega, calcStatsRef, index, natureRef, itemRef, evsRef, megaData, useActualMegaStats) => {
  if (mega) {
    if (useActualMegaStats) return calcStatsRef.value[index] || {}
    if (megaData?.stats) return calcStatsFromBaseStats(megaData.stats, index, natureRef, itemRef, evsRef)
    return calcStatsRef.value[index] || {}
  }
  const data = name ? pokemonMap.value[name] : null
  if (!data?.stats) return calcStatsRef.value[index] || {}
  return calcStatsFromBaseStats(data.stats, index, natureRef, itemRef, evsRef)
}

// forceMega가 주어지면(true/false) 실제 토글 상태 대신 이 값을 사용한다.
// (예: 메가진화 사용 체크박스만 켠 상태에서 예상 데미지 미리보기에 반영하기 위함)
// forceMega가 실제 토글 상태와 다를 때는 calcStats에 의존하지 않고 메가 종족값으로 직접 계산한다.
const mineDisplayStats = (index, forceMega) => {
  const mega = getMineMegaData(index)
  const actualToggled = mineMegaToggle[index] === true
  const toggled = forceMega !== undefined ? forceMega : actualToggled
  const useActualMegaStats = toggled === actualToggled
  return buildDisplayStats(selectedPokemon.value[index], mega && toggled, calcStats, index, selectedNature, selectedTool, inputStats, mega, useActualMegaStats)
}
const oppDisplayStats = (index, forceMega) => {
  const mega = getOppMegaData(index)
  const actualToggled = oppMegaToggle[index] === true
  const toggled = forceMega !== undefined ? forceMega : actualToggled
  const useActualMegaStats = toggled === actualToggled
  return buildDisplayStats(oppSelectedPokemon.value[index], mega && toggled, oppCalcStats, index, oppSelectedNature, oppSelectedTool, oppInputStats, mega, useActualMegaStats)
}

const mineAbilityForCalc = (index, forceMega) => {
  const mega = getMineMegaData(index)
  const toggled = forceMega !== undefined ? forceMega : mineMegaToggle[index] === true
  return (mega && toggled) ? mega.ability : selectedAbility.value[index]
}
const oppAbilityForCalc = (index, forceMega) => {
  const mega = getOppMegaData(index)
  const toggled = forceMega !== undefined ? forceMega : oppMegaToggle[index] === true
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

// ── 날씨 자동 발동(기술/특성/메가·원시 등장) ─────────────
// selectMine/selectOpp(등장·교체)에서 곧바로 사용하므로 여기서 먼저 선언한다.
const battleWeather = ref('없음')
const weatherTurn = reactive({ current: 0, total: 5 })
const WEATHER_BASE_TOTAL = 5
const WEATHER_EXTENDED_TOTAL = 8

// 턴 제한 없는 날씨(메가레쿠쟈/원시가이오가/원시그란돈)를 유발한 포켓몬 추적
const weatherSource = reactive({ side: null, idx: null })

const setWeather = (newWeather, opts = {}) => {
  battleWeather.value = newWeather
  weatherTurn.current = 0
  weatherTurn.total = WEATHER_BASE_TOTAL
  if (opts.permanent) {
    weatherSource.side = opts.side
    weatherSource.idx = opts.idx
  } else {
    weatherSource.side = null
    weatherSource.idx = null
  }
}

// 영구 날씨를 유발한 포켓몬이 필드에서 벗어나면(교체) 날씨가 사라진다
const clearWeatherIfSourceGone = (side, idx) => {
  if (weatherSource.side === side && weatherSource.idx === idx) {
    battleWeather.value = '없음'
    weatherSource.side = null
    weatherSource.idx = null
  }
}
// 영구 날씨를 유발한 포켓몬이 기절해도 날씨가 사라진다
const checkWeatherSourceFainted = () => {
  if (weatherSource.side === 'mine' && isMineFainted(weatherSource.idx)) {
    battleWeather.value = '없음'
    weatherSource.side = null
    weatherSource.idx = null
  }
  if (weatherSource.side === 'opp' && isOppFainted(weatherSource.idx)) {
    battleWeather.value = '없음'
    weatherSource.side = null
    weatherSource.idx = null
  }
}

// 메가레쿠쟈/원시가이오가/원시그란돈 등장(레쿠쟈로 나온 뒤 메가진화하는 경우 포함) 시
// 턴 제한 없는 날씨로 덮어쓴다. 셋 중 나중에 등장한 쪽이 우선한다.
const PRIMAL_WEATHER_MAP = { 메가레쿠쟈: '난기류', 원시가이오가: '폭우', 원시그란돈: '큰가뭄' }
const checkMegaFormWeather = (side, idx) => {
  // 실제로 필드에 나와있는 포켓몬일 때만 날씨에 영향을 준다(벤치에서 메가 토글만 켠 경우는 제외)
  const activeIdx = side === 'mine' ? activeMineIndex.value : activeOppIndex.value
  if (activeIdx !== idx) return
  const megaData = side === 'mine' ? getMineMegaData(idx) : getOppMegaData(idx)
  const toggled = side === 'mine' ? mineMegaToggle[idx] === true : oppMegaToggle[idx] === true
  if (megaData && toggled && PRIMAL_WEATHER_MAP[megaData.megaName]) {
    setWeather(PRIMAL_WEATHER_MAP[megaData.megaName], { permanent: true, side, idx })
  }
}

// 가뭄/잔비/모래날림/눈퍼뜨리기 특성을 지닌 포켓몬이 등장하면 기존 날씨를 덧씌우고 턴이 새로 시작된다
const WEATHER_ABILITY_MAP = { 가뭄: '쾌청', 잔비: '비', 모래날림: '모래바람', 눈퍼뜨리기: '눈' }
const checkAbilityWeather = (side, idx) => {
  if (weatherSource.side !== null) return // 원시 날씨(턴 무제한)는 일반 날씨 특성으로 덮어쓰지 않음
  const ability = side === 'mine' ? mineAbilityForCalc(idx) : oppAbilityForCalc(idx)
  const weather = WEATHER_ABILITY_MAP[ability]
  if (weather) {
    setWeather(weather)
  }
}

// 쾌청/비바라기/모래바람/설경 기술을 사용하면 해당 날씨로 전환된다
const WEATHER_MOVE_MAP = { 쾌청: '쾌청', 비바라기: '비', 모래바람: '모래바람', 설경: '눈' }
const maybeApplyWeatherMove = (moveName) => {
  if (weatherSource.side !== null) return
  const weather = WEATHER_MOVE_MAP[moveName]
  if (weather) {
    setWeather(weather)
  }
}

// 메가진화/원시회귀 체크박스를 직접 클릭했을 때(카드 위 토글) 날씨 체크까지 함께 수행
const onMineMegaCheckboxChange = (idx, checked) => {
  mineMegaToggle[idx] = checked
  if (checked) {
    checkMegaFormWeather('mine', idx)
  } else {
    clearWeatherIfSourceGone('mine', idx)
  }
}
const onOppMegaCheckboxChange = (idx, checked) => {
  oppMegaToggle[idx] = checked
  if (checked) {
    checkMegaFormWeather('opp', idx)
  } else {
    clearWeatherIfSourceGone('opp', idx)
  }
}

const toggleBattleWeather = (v) => {
  battleWeather.value = v === '없음' ? '없음' : (battleWeather.value === v ? '없음' : v)
  weatherTurn.current = 0
  weatherTurn.total = WEATHER_BASE_TOTAL
  weatherSource.side = null
  weatherSource.idx = null
}

const selectMine = (idx) => {
  if (isMineFainted(idx)) return
  ensureMineHpInit(idx)
  const prevMineIndex = activeMineIndex.value
  activeMineIndex.value = idx
  if (prevMineIndex !== null && prevMineIndex !== idx) clearWeatherIfSourceGone('mine', prevMineIndex)
  checkMegaFormWeather('mine', idx)
  checkAbilityWeather('mine', idx)
}
const selectOpp = (idx) => {
  if (isOppFainted(idx)) return
  ensureOppHpInit(idx)
  const prevOppIndex = activeOppIndex.value
  activeOppIndex.value = idx
  if (prevOppIndex !== null && prevOppIndex !== idx) clearWeatherIfSourceGone('opp', prevOppIndex)
  checkMegaFormWeather('opp', idx)
  checkAbilityWeather('opp', idx)
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

// ── 필드 / 공간변화 + 턴 카운터 (날씨 관련 상태는 selectMine/selectOpp 이전에 선언됨) ─────────────
const fieldOptions = ['일렉트릭필드', '그래스필드', '미스트필드', '사이코필드']

const battleField = ref('없음')
const fieldTurn = reactive({ current: 0, total: 5 })

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

// 중앙 하단에서 선택한 상태이상을 실제로 내/상대 포켓몬에게 적용
// (1. 내 기술로 상태이상 유발 → 내 포켓몬, 2. 상대 기술로 상태이상 유발 → 상대 포켓몬)
const applyInflictedStatusChoices = () => {
  if (mineInflictsStatus.value && mineInflictStatusChoice.value) {
    const value = mineInflictStatusChoice.value
    if (STATUS_CONDITIONS.includes(value)) {
      mineStatusCondition.value = value
      mineToxicTurn.value = 0
    } else {
      mineSpecialConditions[value] = true
      mineSpecialTurns[value] = 1
    }
  }
  mineInflictsStatus.value = false
  mineInflictStatusChoice.value = ''

  if (oppInflictsStatus.value && oppInflictStatusChoice.value) {
    const value = oppInflictStatusChoice.value
    if (STATUS_CONDITIONS.includes(value)) {
      oppStatusCondition.value = value
      oppToxicTurn.value = 0
    } else {
      oppSpecialConditions[value] = true
      oppSpecialTurns[value] = 1
    }
  }
  oppInflictsStatus.value = false
  oppInflictStatusChoice.value = ''
}

// 특수 상태이상 지속 턴을 1씩 진행시키고, 지속 턴이 다한 항목은 해제한다.
// (사슬묶기/트집/헤롱헤롱/씨뿌리기 등 무한 지속 항목은 계속 유지)
const advanceSpecialConditionTurns = (conditions, turns) => {
  Object.keys(conditions).forEach((name) => {
    if (!conditions[name]) return
    const total = SPECIAL_CONDITION_DURATIONS[name]
    if (total === null || total === undefined) return
    const next = (turns[name] || 1) + 1
    if (next > total) {
      delete conditions[name]
      delete turns[name]
    } else {
      turns[name] = next
    }
  })
}

// 상태이상으로 인한 턴 종료 시 잔여 데미지 적용 (독/맹독/화상)
const applyEndOfTurnStatusDamage = () => {
  if (activeMineIndex.value !== null && mineStatusCondition.value) {
    const mi = activeMineIndex.value
    if (mineStatusCondition.value === '맹독') {
      mineToxicTurn.value += 1
    }
    const dmg = calculateStatusDamage(
      mineDisplayStats(mi)?.H || 0,
      mineStatusCondition.value,
      mineAbilityForCalc(mi),
      mineToxicTurn.value,
    )
    if (dmg > 0) {
      mineCurrentHp[mi] = Math.max(0, (mineCurrentHp[mi] || 0) - dmg)
    }
  }
  if (activeOppIndex.value !== null && oppStatusCondition.value) {
    const oi = activeOppIndex.value
    if (oppStatusCondition.value === '맹독') {
      oppToxicTurn.value += 1
    }
    const dmg = calculateStatusDamage(
      oppDisplayStats(oi)?.H || 0,
      oppStatusCondition.value,
      oppAbilityForCalc(oi),
      oppToxicTurn.value,
    )
    if (dmg > 0) {
      const maxHp = oppMaxHp.value || 1
      oppHpPercent[oi] = Math.max(0, (oppHpPercent[oi] ?? 100) - (dmg / maxHp) * 100)
    }
  }
}

// 교체 → 기술사용 → 상태이상 잔여 데미지 순으로 처리
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
      checkMegaFormWeather('mine', activeMineIndex.value)
    }
    if (activeMineIndex.value !== null) {
      maybeApplyWeatherMove(selectedMoves.value[activeMineIndex.value]?.[mineAction.moveIndex])
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
      checkMegaFormWeather('opp', activeOppIndex.value)
    }
    if (activeOppIndex.value !== null) {
      maybeApplyWeatherMove(oppSelectedMoves.value[activeOppIndex.value]?.[oppAction.moveIndex])
    }
    if (activeMineIndex.value !== null) {
      const mi = activeMineIndex.value
      mineCurrentHp[mi] = Math.max(0, (mineCurrentHp[mi] || 0) - (Number(oppAction.damageTaken) || 0))
    }
  }

  checkWeatherSourceFainted()

  applyInflictedStatusChoices()
  applyEndOfTurnStatusDamage()
  advanceSpecialConditionTurns(mineSpecialConditions, mineSpecialTurns)
  advanceSpecialConditionTurns(oppSpecialConditions, oppSpecialTurns)

  // 턴 제한 없는 날씨(메가레쿠쟈/원시가이오가/원시그란돈)는 턴이 지나도 사라지지 않는다
  if (battleWeather.value !== '없음' && weatherSource.side === null) {
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
  mineAction.useMega = false
  oppAction.useMega = false
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

const previewMineName = computed(() => (previewMineIndex.value === null ? '' : mineDisplayName(previewMineIndex.value)))

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

// 1타가 가능한지(최대 데미지가 100%를 넘는지) 판정
const isLethalPercentRange = (pctMax) => Number(pctMax) >= 100

const buildCell = (move, attack, defense, ability, item, defHp, useCrit) => {
  const dmg = calculateDamage(move.Power || 0, attack, defense, true, move.Type || '', move.Category, ability, battleWeather.value, item, '', battleField.value, 50)
  const dmgMin = useCrit ? dmg.critMin : dmg.min
  const dmgMax = useCrit ? dmg.critMax : dmg.max
  const pctMin = defHp > 0 ? ((dmgMin / defHp) * 100).toFixed(1) : '0.0'
  const pctMax = defHp > 0 ? ((dmgMax / defHp) * 100).toFixed(1) : '0.0'

  const rolls = calculateDamageRolls(move.Power || 0, attack, defense, true, move.Type || '', move.Category, ability, battleWeather.value, item, '', battleField.value, 50, useCrit)
  const koLabel = formatKoLabel(rolls, defHp)

  return {
    dmgMin,
    dmgMax,
    pctMin,
    pctMax,
    isLethalRange: isLethalPercentRange(pctMax),
    koLabel,
  }
}

// forceMega가 주어지면 실제 메가 토글 상태와 상관없이 해당 값으로 공격자의 능력치/특성을 계산한다.
const mineCellVsSlot = (moveIndex, oppIdx, useCrit, forceMega) => {
  if (activeMineIndex.value === null) return null
  if (!oppSelectedPokemon.value[oppIdx]) return null
  const moveName = selectedMoves.value[activeMineIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'
  const atkStats = mineDisplayStats(activeMineIndex.value, forceMega)
  const defStats = oppDisplayStats(oppIdx)
  const attack = (atkStats?.[atkKey] || 0) * rankMultiplier(mineRanks[atkKey])
  const defRank = oppIdx === activeOppIndex.value ? oppRanks[defKey] : 0
  const defense = (defStats?.[defKey] || 0) * rankMultiplier(defRank)
  return buildCell(move, attack, defense, mineAbilityForCalc(activeMineIndex.value, forceMega), selectedTool.value[activeMineIndex.value], defStats?.H || 0, useCrit)
}

// 메가진화 사용 체크박스(mineAction.useMega)가 켜져 있으면 그 상태를 예상 데미지 계산에 반영한다.
const mineActionPreview = computed(() => {
  if (mineAction.type !== '기술사용') return null
  if (activeOppIndex.value === null || activeMineIndex.value === null) return null
  const megaData = getMineMegaData(activeMineIndex.value)
  const alreadyMega = mineMegaToggle[activeMineIndex.value] === true
  const forceMega = megaData && !alreadyMega ? mineAction.useMega : undefined
  return mineCellVsSlot(mineAction.moveIndex, activeOppIndex.value, false, forceMega)
})

// ── 중앙 하단: 스피드 기준 행동 순서 미리보기 ─────────────
const oppActiveSpeed = computed(() => (activeOppIndex.value === null ? 0 : (oppDisplayStats(activeOppIndex.value)?.S || 0)))

// dmgMin~dmgMax(절대 데미지)가 상대의 현재 체력 범위(hpMin~hpMax)를 항상/절대 넘지 못하는지 판정
// 'guaranteed': 무조건 쓰러뜨림, 'none': 절대 못 쓰러뜨림, 'possible': 난수에 따라 다름
const assessKo = (dmgMin, dmgMax, hpMin, hpMax) => {
  if (hpMax <= 0) return 'guaranteed'
  if (dmgMin >= hpMax) return 'guaranteed'
  if (dmgMax < hpMin) return 'none'
  return 'possible'
}

const turnOrderForecast = computed(() => {
  if (activeMineIndex.value === null || activeOppIndex.value === null) return []
  if (mineAction.type !== '기술사용' || oppAction.type !== '기술사용') {
    return ['교체가 포함된 턴은 교체가 최우선으로 처리되어 행동 순서 미리보기를 제공하지 않습니다.']
  }

  const mineName = mineDisplayName(activeMineIndex.value)
  const oppName = oppDisplayName(activeOppIndex.value)
  const mineMoveName = selectedMoves.value[activeMineIndex.value]?.[mineAction.moveIndex] || '(기술 없음)'
  const oppMoveName = oppSelectedMoves.value[activeOppIndex.value]?.[oppAction.moveIndex] || '(기술 없음)'

  const minePreview = mineActionPreview.value
  const oppPreview = oppCellVsMine(oppAction.moveIndex, activeMineIndex.value, undefined, false)

  const mineHpNow = mineCurrentHp[activeMineIndex.value] ?? mineMaxHp.value
  const oppHpRangeNow = oppHpRange.value

  const describeAttack = (attackerName, moveName, preview) => (preview
    ? `${attackerName}이(가) ${moveName}(으)로 공격합니다 (예상 ${preview.dmgMin}~${preview.dmgMax}, ${preview.pctMin}~${preview.pctMax}%).`
    : `${attackerName}이(가) ${moveName}(으)로 공격합니다.`)

  const lines = []

  if (mineSpeedStat.value === oppActiveSpeed.value) {
    lines.push(`${mineName}과(와) ${oppName}의 스피드가 같아 선공 여부를 알 수 없습니다.`)
    return lines
  }

  const mineFirst = mineSpeedStat.value > oppActiveSpeed.value
  const firstName = mineFirst ? mineName : oppName
  const secondName = mineFirst ? oppName : mineName

  lines.push(`${firstName}이(가) 더 빨라 먼저 행동합니다.`)
  lines.push(describeAttack(firstName, mineFirst ? mineMoveName : oppMoveName, mineFirst ? minePreview : oppPreview))

  const firstPreview = mineFirst ? minePreview : oppPreview
  const koResult = firstPreview
    ? (mineFirst
      ? assessKo(firstPreview.dmgMin, firstPreview.dmgMax, oppHpRangeNow.min, oppHpRangeNow.max)
      : assessKo(firstPreview.dmgMin, firstPreview.dmgMax, mineHpNow, mineHpNow))
    : 'none'

  if (koResult === 'guaranteed') {
    lines.push(`이 공격으로 ${secondName}이(가) 반드시 쓰러져 행동할 수 없습니다.`)
  } else {
    if (koResult === 'possible') {
      lines.push(`이 공격의 난수에 따라 ${secondName}이(가) 쓰러져 행동하지 못할 수도 있습니다.`)
    }
    const secondPreview = mineFirst ? oppPreview : minePreview
    lines.push(`쓰러지지 않는다면 이어서 ${describeAttack(secondName, mineFirst ? oppMoveName : mineMoveName, secondPreview)}`)
  }

  return lines
})

// ── 좌상단 표: 4가지 상대 시나리오 (변화기 제외) ─────────────
const scenarioKeys = ['neutral', 'h32', 'full', 'fullNature']
const scenarioLabel = (sc) => ({ neutral: '무보정', h32: 'H32', full: '풀보정', fullNature: '풀보정(성격)' }[sc])

const mineDamageMoveIndices = computed(() => {
  if (previewMineIndex.value === null) return []
  return [0, 1, 2, 3].filter((k) => {
    const name = selectedMoves.value[previewMineIndex.value]?.[k]
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
  if (previewMineIndex.value === null) return null
  if (!oppSelectedPokemon.value[oppIdx]) return null
  const moveName = selectedMoves.value[previewMineIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'

  const atkStats = mineDisplayStats(previewMineIndex.value)
  // 랭크업은 실제 필드에 나와있는 포켓몬에게만 적용(벤치 미리보기 대상에는 적용 안 함)
  const atkRank = previewMineIndex.value === activeMineIndex.value ? mineRanks[atkKey] : 0
  const attack = (atkStats?.[atkKey] || 0) * rankMultiplier(atkRank)
  const defRank = oppIdx === activeOppIndex.value ? oppRanks[defKey] : 0
  const defense = scenarioDefenseValue(oppIdx, defKey, scenario) * rankMultiplier(defRank)
  const defHp = scenarioHpValue(oppIdx, scenario)

  return buildCell(move, attack, defense, mineAbilityForCalc(previewMineIndex.value), selectedTool.value[previewMineIndex.value], defHp, useCrit)
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
    const pctMin = defHp > 0 ? ((dmgMin / defHp) * 100).toFixed(1) : '0.0'
    const pctMax = defHp > 0 ? ((dmgMax / defHp) * 100).toFixed(1) : '0.0'
    return {
      dmgMin,
      dmgMax,
      pctMin,
      pctMax,
      isLethalRange: isLethalPercentRange(pctMax),
      koLabel: cell.koLabel,
    }
  }
  return cell
}

// forceMega === true 이면 mega, false이면 non-mega로 강제하고, 값이 실제 토글 상태와 다를 경우
// (예: 메가 컬럼을 미리보기로 보여주는 경우) 종족값으로 직접 계산한다.
const mineStatsForColumn = (idx, forceMega) => {
  const mega = getMineMegaData(idx)
  const actualToggled = mineMegaToggle[idx] === true
  const useMega = forceMega === true ? true : (forceMega === false ? false : actualToggled)
  const useActualMegaStats = useMega === actualToggled
  return buildDisplayStats(selectedPokemon.value[idx], mega && useMega, calcStats, idx, selectedNature, selectedTool, inputStats, mega, useActualMegaStats)
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
.sb-cell-field        { grid-area: field; }
.sb-cell-opp-status  { grid-area: oppStatus; }
.sb-cell-mine-status { grid-area: mineStatus; }
/* 중앙/우측 열의 아래쪽 카드는 위쪽 카드와의 사이에 빨간 구분선을 넣는다 */
.sb-cell-empty        { grid-area: fieldBottom; border-top: 3px solid #e53935; padding-top: 14px; }
.sb-cell-opp-moves   { grid-area: oppMoves; border-top: 3px solid #e53935; padding-top: 14px; }

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
.sb-inflict-status-block { display:flex; flex-direction:column; gap:4px; border-top:1px solid #666; padding-top:8px; }
.sb-inflict-checkbox { display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer; }
.sb-status-forecast { display:flex; flex-direction:column; gap:2px; font-size:10px; color:#ffb74d; border-top:1px solid #666; padding-top:6px; }
.sb-turn-order-forecast { display:flex; flex-direction:column; gap:2px; font-size:10px; color:#81d4fa; border-top:1px solid #666; padding-top:6px; }

.sb-panel--moves { align-self:start; }

.sb-dmg-table-wrap { overflow-x:auto; }
.sb-dmg-table { border-collapse:collapse; font-size:10px; width:100%; }
.sb-dmg-table th, .sb-dmg-table td { border:1px solid #666; padding:3px 5px; text-align:center; vertical-align:top; }
.sb-table-sprite { width:28px; height:28px; object-fit:cover; }
.sb-move-name { text-align:left; color:#ccc; white-space:nowrap; }

.sb-scenario-line {
  display:grid;
  grid-template-columns: 76px 56px 66px 92px;
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
.sb-scenario-line .sb-ko-label { text-align:right; color:#4fc3f7; font-size:9px; }
.sb-scenario-line .sb-dmg-empty { grid-column: 2 / span 3; text-align:center; }

.sb-panel--field { display:flex; flex-direction:column; gap:10px; }
.sb-panel--opp-status,
.sb-panel--mine-status { display:flex; flex-direction:column; gap:8px; }

.sb-panel-title { margin:0 0 6px 0; font-size:13px; }

.sb-move-list { display:flex; flex-direction:column; gap:6px; }
/* 기술을 선택해도(값 유무와 무관하게) 항상 동일한 높이를 갖도록 최소 높이를 고정 */
.sb-move-row-block { display:flex; flex-direction:column; gap:3px; border-bottom:1px solid #666; padding-bottom:6px; min-height: 108px; box-sizing:border-box; }
.sb-move-select { font-size:11px; padding:2px 4px; width:160px; max-width:160px; box-sizing:border-box; }
.sb-dmg { font-weight:bold; font-size:11px; }
.sb-dmg--crit { color:#ff5252; }
.sb-dmg--lethal { color:#ff1744; }
.sb-pct { font-size:9px; color:#aaa; }
.sb-pct--lethal { color:#ff1744; font-weight:bold; }
.sb-dmg-empty { color:#888; }
.sb-ko-label { font-size:9px; color:#4fc3f7; margin-left:4px; }

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
.sb-status-card--clickable { cursor:pointer; outline:2px solid transparent; border-radius:6px; }
.sb-status-card--previewing { outline: 3px solid #4fc3f7; }
.sb-status-sprite { width:48px; height:48px; object-fit:cover; border:2px solid #333; border-radius:6px; background:#e8e8e8; flex-shrink:0; }
.sb-status-info { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.sb-status-right { display:flex; flex-direction:column; gap:4px; margin-left:auto; align-items:flex-end; }
.sb-status-ability { font-size:11px; color:#ffd54f; font-weight:bold; white-space:nowrap; cursor:help; }
.sb-status-summary { font-size:9px; color:#ff8a65; font-weight:normal; margin-left:4px; white-space:normal; }

/* 체력/실능치/랭크업(또는 실능치/랭크업)을 한 행에 배치하는 공통 컨테이너 */
.sb-compact-row { display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap; }

.sb-hp-block { display:flex; flex-direction:column; gap:2px; width:150px; flex-shrink:0; }

.sb-realstats-box { display:flex; flex-direction:column; gap:1px; font-size:11px; }
.sb-realstats-box--compact { flex:1; min-width:120px; }
.sb-realstat-row { display:flex; align-items:center; gap:4px; }
.sb-realstat-name { width:50px; color:#ccc; font-size:10px; }
.sb-realstat-value { font-weight:bold; width:30px; text-align:right; font-size:11px; }
.sb-realstat-reason { font-size:8px; color:#ffeb3b; }
.sb-ev-tag { font-size:9px; color:#aaa; margin-left:2px; }

.sb-rank-box { display:flex; flex-direction:column; gap:2px; flex-shrink:0; }
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
.sb-status-conditions { display:flex; flex-direction:row; flex-wrap:wrap; gap:12px; }
.sb-condition-row { display:flex; flex-direction:column; align-items:flex-start; gap:3px; }
.sb-condition-group-label { font-size:9px; color:#ccc; }
.sb-condition-btn { font-size:9px; padding:2px 6px; border:1px solid #999; border-radius:10px; cursor:pointer; background:#444; color:#fff; align-self:stretch; text-align:left; }
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

/* 내 파티 카드 (entrySelect.vue와 동일한 가로 배치, 현재 나와있는 포켓몬은 제외) */
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
.sb-mine-card--fainted { opacity:0.4; cursor:not-allowed; }
.sb-mine-card--previewing { outline: 3px solid #4fc3f7; }
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
/* 데미지 값 유무와 상관없이 각 행의 높이를 고정하고, grid로 컬럼 폭을 고정해 텍스트 길이에 따른 흔들림을 방지 */
.sb-mine-col-cell {
  display:grid;
  grid-template-columns: 70px 56px 66px 40px;
  align-items:center;
  column-gap:4px;
  font-size:10px;
  white-space:nowrap;
  height:16px;
  overflow:hidden;
}
.sb-mine-col-label { color:#ccc; overflow:hidden; text-overflow:ellipsis; }
.sb-mine-col-cell .sb-dmg,
.sb-mine-col-cell .sb-pct { text-align:right; }
.sb-mine-col-cell .sb-dmg-empty { grid-column: 2 / span 3; text-align:center; }
.sb-mega-tag { color:#ffeb3b; font-size:9px; margin-left:2px; }
</style>