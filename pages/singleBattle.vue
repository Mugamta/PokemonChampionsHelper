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

      <!-- 필드 설치 효과 (해저드/스크린) -->
      <div class="sb-field-row">
        <span class="sb-field-label">내 필드</span>
        <div class="sb-tag-list">
          <span
            v-for="(cnt, name) in mineHazards"
            :key="'mh-' + name"
            class="sb-effect-tag"
          >{{ name }}{{ cnt > 1 ? ` x${cnt}` : '' }}</span>
          <span
            v-for="(val, name) in mineScreens"
            :key="'ms-' + name"
            class="sb-effect-tag"
          >{{ name }}({{ val.current }}/{{ val.total }})</span>
          <span
            v-if="!Object.keys(mineHazards).length && !Object.keys(mineScreens).length"
            class="sb-placeholder-small"
          >없음</span>
        </div>
      </div>
      <div class="sb-field-row">
        <span class="sb-field-label">상대 필드</span>
        <div class="sb-tag-list">
          <span
            v-for="(cnt, name) in oppHazards"
            :key="'oh-' + name"
            class="sb-effect-tag"
          >{{ name }}{{ cnt > 1 ? ` x${cnt}` : '' }}</span>
          <span
            v-for="(val, name) in oppScreens"
            :key="'os-' + name"
            class="sb-effect-tag"
          >{{ name }}({{ val.current }}/{{ val.total }})</span>
          <span
            v-if="!Object.keys(oppHazards).length && !Object.keys(oppScreens).length"
            class="sb-placeholder-small"
          >없음</span>
        </div>
      </div>

      <!-- 페어리록: 발동 중이면 양쪽 모두 교체 불가 -->
      <div
        v-if="fairyLockTurns > 0"
        class="sb-field-row"
      >
        <span class="sb-field-label">교체금지</span>
        <span class="sb-effect-tag">페어리록 ({{ fairyLockTurns }}턴 남음)</span>
      </div>

      <!-- 전체 배틀 턴 수 -->
      <div class="sb-battle-turn">
        현재 턴: {{ battleTurn }}
      </div>

      <!-- 스피드 비교 (내림차순 정렬, 내 스피드는 빨간색). "관찰" 입력은 중앙 하단 ③번 구역에서 한다 -->
      <div
        v-if="inferredOppSpeedBound"
        class="sb-speed-inferred"
      >
        추정: 상대 스피드 실능치(랭크 제외) {{ inferredOppSpeedBound.type === 'min' ? '최소' : '최대' }} {{ inferredOppSpeedBound.value }}
      </div>
      <div class="sb-speed-box">
        <div
          v-for="row in speedRows"
          :key="row.key"
          class="sb-speed-row"
          :class="{ 'sb-speed-row--mine': row.isMine, 'sb-speed-row--excluded': isSpeedRowExcluded(row) }"
        >
          <span>
            {{ row.label }}
            <span
              v-if="isSpeedRowExcluded(row)"
              class="sb-speed-excluded-tag"
            >(제외: 관찰 결과와 모순)</span>
          </span>
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
              :disabled="fairyLockTurns > 0"
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
              :disabled="fairyLockTurns > 0"
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
            v-if="oppScenarioEstimateText"
            class="sb-preview"
          >
            {{ oppScenarioEstimateText }}
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

      <!-- ① 설정값(내가 입력한 상대 노력치·상대가 사용한 기술) 기준 예상 흐름 -->
      <div
        v-if="turnOrderForecast.length"
        class="sb-forecast-block"
      >
        <h5 class="sb-forecast-title">
          ① 설정값 기준 예상 흐름
        </h5>
        <div
          v-for="(line, i) in turnOrderForecast"
          :key="'turn-order-' + i"
        >
          {{ line }}
        </div>
      </div>

      <!-- ② 상대 내구/스피드가 최소일 때, 최대일 때 각각의 예상 흐름 -->
      <div
        v-if="turnOrderScenarioFlows.length"
        class="sb-forecast-block sb-forecast-block--reference"
      >
        <h5 class="sb-forecast-title">
          ② 최소·최대 시나리오 예상 흐름
        </h5>
        <div
          v-for="flow in turnOrderScenarioFlows"
          :key="flow.title"
          class="sb-scenario-flow"
        >
          <div class="sb-scenario-flow-title">
            {{ flow.title }}
          </div>
          <div
            v-for="(line, i) in flow.lines"
            :key="flow.title + '-' + i"
          >
            {{ line }}
          </div>
        </div>
      </div>

      <!-- ③ 실제로 진행된 턴 흐름을 입력하는 곳: 이 값을 바탕으로 상대 스피드/내구를 역산해서
           위 스피드 비교 표·아래 목록에서 모순되는(불가능한) 값을 제외한다 -->
      <div class="sb-forecast-block sb-forecast-block--input">
        <h5 class="sb-forecast-title">
          ③ 실제 진행 결과 입력
        </h5>

        <div class="sb-observe-row">
          <span class="sb-input-label">선후공 관찰</span>
          <button
            type="button"
            class="sb-field-btn"
            :class="{ active: observedTurnOrder === 'mine' }"
            @click="toggleObservedTurnOrder('mine')"
          >
            내가 선공
          </button>
          <button
            type="button"
            class="sb-field-btn"
            :class="{ active: observedTurnOrder === 'opp' }"
            @click="toggleObservedTurnOrder('opp')"
          >
            상대가 선공
          </button>
          <span
            v-if="inferredOppSpeedBound"
            class="sb-preview"
          >
            → 상대 스피드(랭크 제외) {{ inferredOppSpeedBound.type === 'min' ? '최소' : '최대' }} {{ inferredOppSpeedBound.value }} (상단 스피드 표에 반영됨)
          </span>
        </div>

        <div class="sb-observe-row">
          <span class="sb-input-label">입힌 데미지(%) 기반 상대 내구 역산</span>
          <span
            v-if="mineScenarioEstimateText"
            class="sb-preview"
          >
            {{ mineScenarioEstimateText }}
          </span>
          <span
            v-else-if="Number(mineAction.dmgPercent)"
            class="sb-preview sb-preview--none"
          >
            일치하는 내구 시나리오 없음(급소이거나 다른 조건)
          </span>
          <span
            v-else
            class="sb-placeholder-small"
          >
            위 "내 행동 → 입힌 데미지(%)"를 입력하면 자동으로 표시됩니다
          </span>
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

// 쾌청/비바라기/모래바람/설경 기술을 사용하면 해당 날씨로 전환된다 (실제 적용은 applyFieldEffect에서 처리)
const WEATHER_MOVE_MAP = { 쾌청: '쾌청', 비바라기: '비', 모래바람: '모래바람', 설경: '눈' }

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
  if (prevMineIndex !== null && prevMineIndex !== idx) {
    clearWeatherIfSourceGone('mine', prevMineIndex)
    resetRanks(mineRanks) // 교체 시 랭크 변화는 초기화된다
    observedTurnOrder.value = 'unknown' // 매치업이 바뀌므로 이전 관찰 결과는 무효화
  }
  checkMegaFormWeather('mine', idx)
  checkAbilityWeather('mine', idx)
}
const selectOpp = (idx) => {
  if (isOppFainted(idx)) return
  ensureOppHpInit(idx)
  const prevOppIndex = activeOppIndex.value
  activeOppIndex.value = idx
  if (prevOppIndex !== null && prevOppIndex !== idx) {
    clearWeatherIfSourceGone('opp', prevOppIndex)
    resetRanks(oppRanks) // 교체 시 랭크 변화는 초기화된다
    observedTurnOrder.value = 'unknown' // 매치업이 바뀌므로 이전 관찰 결과는 무효화
  }
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

// ── 필드 설치 효과 (해저드/스크린) ─────────────
// 상대/사용자 필드에 설치되는 기술들(독압정/스텔스록/압정뿌리기/끈적끈적네트=해저드,
// 리플렉터/빛의장막/오로라베일/신비의부적/순풍/와이드가드/패스트가드=스크린)의 설치 상태.
// key는 moves.ts의 effects[].key(기술 자신의 이름)를 그대로 사용한다.
const mineHazards = reactive({}) // { 독압정: 1~2, 스텔스록: 1, ... } 내 필드에 깔린 해저드
const oppHazards = reactive({})  // 상대 필드에 깔린 해저드
const mineScreens = reactive({}) // { 리플렉터: {current, total}, ... } 내 필드의 스크린류
const oppScreens = reactive({})

const SCREEN_DEFAULT_TURNS = 5

// 페어리록: 이 값이 0보다 크면 양쪽 모두 교체가 불가능하다(발동한 턴 + 다음 턴 = 2)
const fairyLockTurns = ref(0)

// ── 스피드 비교 ─────────────
const mineSpeedStat = computed(() => {
  if (activeMineIndex.value === null) return 0
  const base = mineDisplayStats(activeMineIndex.value)?.S || 0
  return Math.floor(base * rankMultiplier(mineRanks.S))
})

const speedRows = computed(() => {
  if (activeMineIndex.value === null) return []
  const rows = [{ key: 'mine', label: '내 스피드', value: mineSpeedStat.value, isMine: true }]
  if (activeOppIndex.value !== null) {
    const name = oppSelectedPokemon.value[activeOppIndex.value]
    const data = name ? pokemonMap.value[name] : null
    const base = data?.stats?.S || 0
    const speedRankMult = rankMultiplier(oppRanks.S)
    // rawValue: 랭크(스테이지) 배율을 적용하지 않은, 노력치/성격/도구까지만 반영한 "기본 실능치".
    // 랭크는 일시적인 상태라서 관찰 기반 역산과 비교할 때는 이 값을 기준으로 삼아야 한다.
    const neutralBase = calculateStat('S', base, 0, '무보정', '', '')
    const semiBase = calculateStat('S', base, 32, '무보정', '', '')
    const maxBase = calculateStat('S', base, 32, findNatureBoosting('S'), '', '')
    const semiScarfBase = Math.floor(semiBase * 1.5)
    const maxScarfBase = Math.floor(maxBase * 1.5)
    rows.push(
      { key: 'neutral', label: '상대 무보정', value: Math.floor(neutralBase * speedRankMult), rawValue: neutralBase, isMine: false },
      { key: 'semi', label: '상대 준속', value: Math.floor(semiBase * speedRankMult), rawValue: semiBase, isMine: false },
      { key: 'max', label: '상대 최속', value: Math.floor(maxBase * speedRankMult), rawValue: maxBase, isMine: false },
      { key: 'semiScarf', label: '상대 준속 스카프', value: Math.floor(semiScarfBase * speedRankMult), rawValue: semiScarfBase, isMine: false },
      { key: 'maxScarf', label: '상대 최속 스카프', value: Math.floor(maxScarfBase * speedRankMult), rawValue: maxScarfBase, isMine: false },
    )
  }
  return rows.sort((a, b) => b.value - a.value)
})

// ── 관찰된 선후공 결과로 상대 스피드 역산 ─────────────
// 이번 턴 실제로 누가 먼저 움직였는지를 입력하면, 그 순간의 랭크 상태를 감안해서
// 상대의 "랭크를 제외한 기본 실능치"의 최소/최대 경계를 역산한다.
// 랭크가 걸린 상태에서 비교하면 매 순간 배율이 달라지므로 반드시 랭크를 나눠서
// 뒤로 돌린 기본 실능치 기준으로 판단해야 한다(랭크가 아닌 기본 실능치 기준).
const observedTurnOrder = ref('unknown') // 'unknown' | 'mine' | 'opp'
const toggleObservedTurnOrder = (v) => {
  observedTurnOrder.value = observedTurnOrder.value === v ? 'unknown' : v
}

const inferredOppSpeedBound = computed(() => {
  if (observedTurnOrder.value === 'unknown') return null
  if (activeMineIndex.value === null || activeOppIndex.value === null) return null
  const oppRankMult = rankMultiplier(oppRanks.S)
  const boundary = mineSpeedStat.value / oppRankMult
  if (observedTurnOrder.value === 'opp') {
    // 상대가 선공 → 상대의 (랭크 반영) 실효 스피드가 내 실효 스피드 이상이어야 하므로,
    // 상대 기본 실능치는 최소 이 값 이상이어야 한다.
    return { type: 'min', value: Math.ceil(boundary) }
  }
  // 내가 선공 → 상대 기본 실능치는 최대 이 값 이하여야 한다.
  return { type: 'max', value: Math.floor(boundary) }
})

// 관찰된 경계값과 모순되는 스피드 시나리오(예: 최소 스피드가 130인데 상대 무보정은 100인 경우)는
// "일어날 수 없는 경우"로 판단해 제외 표시한다.
const isSpeedRowExcluded = (row) => {
  if (row.isMine || !inferredOppSpeedBound.value || row.rawValue === undefined) return false
  if (inferredOppSpeedBound.value.type === 'min') return row.rawValue < inferredOppSpeedBound.value.value
  return row.rawValue > inferredOppSpeedBound.value.value
}

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

// ── 기술 사용 시 효과 자동 적용 (랭크 변화 / 필드 변화) ─────────────
// moves.ts의 effects 배열을 읽어서, 기술을 사용한 쪽(userSide: 'mine' | 'opp')을 기준으로
// 랭크 변화와 필드 설치 효과를 실제 배틀 상태에 반영한다.
// (상태이상/다단히트/반동/회복/흡수는 기존처럼 별도 UI로 처리하며 여기서는 다루지 않음)

const resetRanks = (target) => {
  Object.keys(target).forEach((k) => { target[k] = 0 })
}

const oppositeSide = (side) => (side === 'mine' ? 'opp' : 'mine')

// effect.target('self'|'opponent')을 실제 사용자 쪽 기준 side('mine'|'opp')로 변환해 랭크에 반영
const applyRankEffect = (effect, userSide) => {
  const side = effect.target === 'self' ? userSide : oppositeSide(userSide)
  const ranks = side === 'mine' ? mineRanks : oppRanks
  if (!(effect.stat in ranks)) return // 현재는 A/B/C/D/S만 추적(명중/회피/급소 랭크는 UI 미지원)
  ranks[effect.stat] = Math.min(6, Math.max(-6, ranks[effect.stat] + effect.amount))
}

// effect.scope('self'|'opponent'|'global')에 따라 날씨/필드/공간변화/해저드/스크린 상태를 갱신
const applyFieldEffect = (effect, userSide) => {
  if (effect.scope === 'global') {
    if (WEATHER_MOVE_MAP[effect.key] && weatherSource.side === null) {
      setWeather(WEATHER_MOVE_MAP[effect.key])
      return
    }
    if (roomOptions.includes(effect.key)) {
      activeRooms[effect.key] = { current: 0, total: 5 }
      return
    }
    if (fieldOptions.includes(effect.key)) {
      battleField.value = effect.key
      fieldTurn.current = 0
      fieldTurn.total = WEATHER_BASE_TOTAL
      return
    }
    if (effect.key === '썰렁개그') {
      // 날씨를 눈으로 바꾸고, 사용자는 공격 직후 곧바로 교체된다.
      // 같은 턴에 교체 대상까지 자동으로 고를 수는 없으므로,
      // 사용한 쪽의 다음 행동을 "교체"로 미리 선택해 둔다(다음 실행 시 대상만 고르면 됨).
      setWeather('눈')
      if (userSide === 'mine') mineAction.type = '교체'
      else oppAction.type = '교체'
      return
    }
    if (effect.key === '흑안개') {
      // 필드에 있는 모든 포켓몬(양쪽 다)의 랭크 변화를 초기화한다.
      resetRanks(mineRanks)
      resetRanks(oppRanks)
      return
    }
    if (effect.key === '페어리록') {
      // 발동한 턴과 다음 턴, 양쪽 모두 교체가 불가능해진다.
      fairyLockTurns.value = 2
      return
    }
    // 그 외 아직 전용 UI가 없는 필드 전체 효과는 추후 확장 지점으로 남겨둠
    return
  }

  const side = effect.scope === 'self' ? userSide : oppositeSide(userSide)
  if (effect.maxStack) {
    // 스택형 엔트리 해저드(독압정/스텔스록/압정뿌리기/끈적끈적네트)
    const hazards = side === 'mine' ? mineHazards : oppHazards
    hazards[effect.key] = Math.min(effect.maxStack, (hazards[effect.key] || 0) + 1)
  } else {
    // 스크린류(리플렉터/빛의장막/오로라베일/신비의부적/순풍/와이드가드/패스트가드)
    const screens = side === 'mine' ? mineScreens : oppScreens
    screens[effect.key] = { current: 0, total: SCREEN_DEFAULT_TURNS }
  }
}

// 실제로 사용된 기술 하나에 대해 rank/field 타입 effects를 전부 적용
const applyMoveEffectsForMove = (moveName, userSide) => {
  if (!moveName) return
  const move = getMoveData(moveName)
  if (!move?.effects?.length) return
  move.effects.forEach((effect) => {
    if (effect.type === 'rank') applyRankEffect(effect, userSide)
    else if (effect.type === 'field') applyFieldEffect(effect, userSide)
  })
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
      applyMoveEffectsForMove(selectedMoves.value[activeMineIndex.value]?.[mineAction.moveIndex], 'mine')
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
      applyMoveEffectsForMove(oppSelectedMoves.value[activeOppIndex.value]?.[oppAction.moveIndex], 'opp')
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
  Object.keys(mineScreens).forEach((name) => {
    advanceEffectTurn(mineScreens[name], () => { delete mineScreens[name] })
  })
  Object.keys(oppScreens).forEach((name) => {
    advanceEffectTurn(oppScreens[name], () => { delete oppScreens[name] })
  })
  if (fairyLockTurns.value > 0) {
    fairyLockTurns.value -= 1
  }

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
  { key: 'S', name: '스피드' },
]
const mineRanks = reactive({ A: 0, B: 0, C: 0, D: 0, S: 0 })
const oppRanks = reactive({ A: 0, B: 0, C: 0, D: 0, S: 0 })

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
const oppActiveSpeed = computed(() => {
  if (activeOppIndex.value === null) return 0
  const base = oppDisplayStats(activeOppIndex.value)?.S || 0
  return Math.floor(base * rankMultiplier(oppRanks.S))
})

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

  // 자신/상대가 같은 포켓몬을 선출할 수도 있으므로, 이름만으로는 구분이 안 되어
  // "자신의 OO" / "상대의 OO" 형태로 표기해 어느 쪽인지 항상 구분되도록 한다.
  const mineLabel = `자신의 ${mineDisplayName(activeMineIndex.value)}`
  const oppLabel = `상대의 ${oppDisplayName(activeOppIndex.value)}`
  const mineMoveName = selectedMoves.value[activeMineIndex.value]?.[mineAction.moveIndex] || '(기술 없음)'
  const oppMoveName = oppSelectedMoves.value[activeOppIndex.value]?.[oppAction.moveIndex] || '(기술 없음)'

  const minePreview = mineActionPreview.value
  const oppPreview = oppCellVsMine(oppAction.moveIndex, activeMineIndex.value, undefined, false)

  const mineHpNow = mineCurrentHp[activeMineIndex.value] ?? mineMaxHp.value
  const oppHpRangeNow = oppHpRange.value

  const describeAttack = (attackerLabel, moveName, preview) => (preview
    ? `${attackerLabel}이(가) ${moveName}(으)로 공격합니다 (예상 ${preview.dmgMin}~${preview.dmgMax}, ${preview.pctMin}~${preview.pctMax}%).`
    : `${attackerLabel}이(가) ${moveName}(으)로 공격합니다.`)

  const lines = []

  if (mineSpeedStat.value === oppActiveSpeed.value) {
    lines.push(`${mineLabel}과(와) ${oppLabel}의 스피드가 같아 선공 여부를 알 수 없습니다.`)
    return lines
  }

  const mineFirst = mineSpeedStat.value > oppActiveSpeed.value
  const firstLabel = mineFirst ? mineLabel : oppLabel
  const secondLabel = mineFirst ? oppLabel : mineLabel

  lines.push(`${firstLabel}이(가) 더 빨라 먼저 행동합니다.`)
  lines.push(describeAttack(firstLabel, mineFirst ? mineMoveName : oppMoveName, mineFirst ? minePreview : oppPreview))

  const firstPreview = mineFirst ? minePreview : oppPreview
  const koResult = firstPreview
    ? (mineFirst
      ? assessKo(firstPreview.dmgMin, firstPreview.dmgMax, oppHpRangeNow.min, oppHpRangeNow.max)
      : assessKo(firstPreview.dmgMin, firstPreview.dmgMax, mineHpNow, mineHpNow))
    : 'none'

  if (koResult === 'guaranteed') {
    lines.push(`이 공격으로 ${secondLabel}이(가) 반드시 쓰러져 행동할 수 없습니다.`)
  } else {
    if (koResult === 'possible') {
      // 이건 "내가 실제로 입력한 상대 노력치" 기준 판정일 뿐이다.
      // 다른 노력치(무보정/풀보정 등)에서는 결과가 다를 수 있으므로 ②번 구역을 별도로 확인해야 한다.
      lines.push(`이 공격은 확정 1타가 아니므로 ${secondLabel}이(가) 쓰러지지 않는 것으로 간주하고 진행합니다. (다른 노력치 기준은 아래 ②번 참고)`)
    } else {
      lines.push(`이 공격으로는 ${secondLabel}이(가) 쓰러지지 않습니다.`)
    }
    const secondPreview = mineFirst ? oppPreview : minePreview
    lines.push(`이어서 ${describeAttack(secondLabel, mineFirst ? oppMoveName : mineMoveName, secondPreview)}`)
  }

  return lines
})

// ② 상대의 내구/스피드가 "최소"(노력치 0·무보정) 또는 "최대"(노력치 32, 스피드는 최속 스카프까지)일 때
// 각각 어떤 흐름이 되는지 시나리오별로 서술한다. 좌측 상단 표·상단 스피드 표와 동일한 계산 로직을 그대로 재사용해서
// ①번(설정값 기준)과는 독립적인, 서로 다른 전제의 시나리오임을 명확히 분리해서 보여준다.
// 주의: 성격은 한 포켓몬당 하나만 적용되고 오직 한 스탯만 올릴 수 있다.
// "최대" 시나리오에서 스피드에 보정 성격(최속 스카프)을 쓴다고 가정했으므로,
// 내구까지 동시에 보정 성격(fullNature)을 받는 건 불가능하다 — 내구는 EV만 최대(full)로 잡는다.
const SCENARIO_FLOW_DEFS = [
  { key: 'min', label: '최소 시나리오 (상대 내구 무보정 · 스피드 무보정)', bulkScenario: 'neutral', speedRowKey: 'neutral' },
  { key: 'max', label: '최대 시나리오 (상대 내구 EV32·무보정 · 스피드 최속 스카프)', bulkScenario: 'full', speedRowKey: 'maxScarf' },
]

const turnOrderScenarioFlows = computed(() => {
  if (activeMineIndex.value === null || activeOppIndex.value === null) return []
  if (mineAction.type !== '기술사용') return []

  const mineLabel = `자신의 ${mineDisplayName(activeMineIndex.value)}`
  const oppLabel = `상대의 ${oppDisplayName(activeOppIndex.value)}`
  const moveName = selectedMoves.value[activeMineIndex.value]?.[mineAction.moveIndex]
  const move = moveName ? getMoveData(moveName) : null
  const mineMoveName = moveName || '(기술 없음)'

  return SCENARIO_FLOW_DEFS.map((def) => {
    const speedRow = speedRows.value.find((r) => r.key === def.speedRowKey)
    const oppScenarioSpeed = speedRow ? speedRow.value : 0
    const lines = []

    if (mineSpeedStat.value === oppScenarioSpeed) {
      lines.push(`${mineLabel}과(와) ${oppLabel}의 스피드가 같아(상대 ${oppScenarioSpeed}) 선공 여부를 알 수 없습니다.`)
      return { title: def.label, lines }
    }

    const mineFirst = mineSpeedStat.value > oppScenarioSpeed
    const firstLabel = mineFirst ? mineLabel : oppLabel
    lines.push(`${firstLabel}이(가) 더 빨라 먼저 행동합니다. (상대 스피드 ${oppScenarioSpeed})`)

    if (!mineFirst) {
      lines.push(`이 시나리오에서는 ${oppLabel}이(가) 먼저 행동하므로, 데미지 판정은 상대가 어떤 기술을 쓰는지에 달려 있습니다.`)
      return { title: def.label, lines }
    }

    if (!move || move.Category === '변화') {
      lines.push(`${mineMoveName}은(는) 데미지를 주는 기술이 아니라 이 시나리오에서 KO 여부를 판단할 수 없습니다.`)
      return { title: def.label, lines }
    }

    const cell = mineCellScenarioForIndex(activeMineIndex.value, mineAction.moveIndex, activeOppIndex.value, def.bulkScenario, false)
    const hp = scenarioHpValue(activeOppIndex.value, def.bulkScenario)
    if (!cell) {
      lines.push('이 시나리오에서는 데미지를 계산할 수 없습니다.')
    } else if (hp <= 0 || cell.dmgMin >= hp) {
      lines.push(`${mineMoveName}(으)로 이 시나리오에서는 확정 1타로 ${oppLabel}이(가) 쓰러집니다.`)
    } else if (cell.dmgMax >= hp) {
      lines.push(`${mineMoveName}(으)로 이 시나리오에서는 1타가 가능하지만 확정은 아닙니다 (${cell.pctMin}~${cell.pctMax}%).`)
    } else {
      lines.push(`${mineMoveName}(으)로는 이 시나리오에서 1타가 불가능합니다 (${cell.pctMin}~${cell.pctMax}%).`)
    }

    return { title: def.label, lines }
  })
})

// ③ 실제로 진행된 턴의 결과를 사용자가 직접 입력하는 구역.
//   - 선후공 관찰(observedTurnOrder) → 상대 스피드(랭크 제외 기본 실능치) 최소/최대 역산 (inferredOppSpeedBound, 위에서 정의)
//   - 입힌 데미지(%)(mineAction.dmgPercent, "내 행동" 입력란) → 상대 내구가 어느 시나리오와 일치하는지 역산
// 이렇게 역산된 값과 모순되는 경우는 자동으로 제외된다(스피드는 speedRows에서 취소선으로 표시).

// 시나리오 목록은 반드시 "값이 약함(데미지가 잘 들어감) → 강함(데미지가 덜 들어감)" 순서로 넘겨야 한다.
// 하나만 일치하면 그 라벨 그대로("~로 추정"), 여러 개가 겹쳐서 동시에 일치하면 실제 값은 그 사이 어딘가라는 뜻이므로
// "가장 약한 시나리오는 최대난수로 겨우 맞고, 가장 강한 시나리오는 최저난수로 겨우 맞는" 경계로 이해해
// "약한 시나리오 최대난수 ~ 강한 시나리오 최저난수 사이로 추정"처럼 구간으로 합쳐서 표현한다.
const formatScenarioEstimate = (matches) => {
  if (!matches.length) return ''
  if (matches.length === 1) return `${matches[0].label}로 추정`
  const weakest = matches[0]
  const strongest = matches[matches.length - 1]
  return `${weakest.label} 최대난수 ~ ${strongest.label} 최저난수 사이로 추정`
}

const mineScenarioMatches = computed(() => {
  const dmgPercent = Number(mineAction.dmgPercent)
  if (!dmgPercent || activeMineIndex.value === null || activeOppIndex.value === null) return []
  return scenarioKeys
    .map((sc) => ({ key: sc, label: scenarioLabel(sc), data: mineCellScenarioForIndex(activeMineIndex.value, mineAction.moveIndex, activeOppIndex.value, sc, false) }))
    .filter((s) => s.data && dmgPercent >= Number(s.data.pctMin) && dmgPercent <= Number(s.data.pctMax))
})
const mineScenarioEstimateText = computed(() => formatScenarioEstimate(mineScenarioMatches.value))

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

// attackerIdx를 명시적으로 받는 버전 — previewMineIndex 대신 임의의 공격자 인덱스로 계산 가능
// (좌상단 표는 previewMineIndex 기준, 중앙 하단 참고 정보는 activeMineIndex 기준으로 각각 사용)
const mineCellScenarioForIndex = (attackerIdx, moveIndex, oppIdx, scenario, useCrit) => {
  if (attackerIdx === null) return null
  if (!oppSelectedPokemon.value[oppIdx]) return null
  const moveName = selectedMoves.value[attackerIdx]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'

  const atkStats = mineDisplayStats(attackerIdx)
  // 랭크업은 실제 필드에 나와있는 포켓몬에게만 적용(벤치 미리보기 대상에는 적용 안 함)
  const atkRank = attackerIdx === activeMineIndex.value ? mineRanks[atkKey] : 0
  const attack = (atkStats?.[atkKey] || 0) * rankMultiplier(atkRank)
  const defRank = oppIdx === activeOppIndex.value ? oppRanks[defKey] : 0
  const defense = scenarioDefenseValue(oppIdx, defKey, scenario) * rankMultiplier(defRank)
  const defHp = scenarioHpValue(oppIdx, scenario)

  return buildCell(move, attack, defense, mineAbilityForCalc(attackerIdx), selectedTool.value[attackerIdx], defHp, useCrit)
}

const mineCellScenario = (moveIndex, oppIdx, scenario, useCrit) => mineCellScenarioForIndex(previewMineIndex.value, moveIndex, oppIdx, scenario, useCrit)

// ── 우하단 표: 받은 데미지 역산용 시나리오 ─────────────
const oppScenarioKeys = ['neutral', 'ev32', 'ev32Nature', 'itemBoost']

// 상대가 사용한 기술이 물리인지 특수인지에 따라 A32/C32처럼 실제 관여하는 스탯으로 표기한다.
const oppAtkKeyForCurrentMove = computed(() => {
  if (activeOppIndex.value === null) return null
  const moveName = oppSelectedMoves.value[activeOppIndex.value]?.[oppAction.moveIndex]
  const move = moveName ? getMoveData(moveName) : null
  if (!move || move.Category === '변화') return null
  return move.Category === '물리' ? 'A' : 'C'
})
const oppScenarioLabel = (sc) => {
  const atkKey = oppAtkKeyForCurrentMove.value || 'A/C'
  return {
    neutral: '무보정',
    ev32: `${atkKey}32`,
    ev32Nature: `${atkKey}32+성격`,
    itemBoost: '데미지업 도구(20%)',
  }[sc]
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
    .map((sc) => ({ key: sc, label: oppScenarioLabel(sc), data: oppDamageScenario(oppAction.moveIndex, sc, false) }))
    .filter((s) => s.data && dmg >= s.data.dmgMin && dmg <= s.data.dmgMax)
})
const oppScenarioEstimateText = computed(() => formatScenarioEstimate(oppScenarioMatches.value))
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
.sb-forecast-block { display:flex; flex-direction:column; gap:2px; font-size:10px; color:#81d4fa; border-top:1px solid #666; padding-top:6px; }
.sb-forecast-title { margin:0 0 2px 0; font-size:11px; color:#ffd54f; }
.sb-forecast-block--reference { color:#b0bec5; }
.sb-scenario-flow { margin-bottom:4px; padding-left:6px; border-left:2px solid #555; }
.sb-scenario-flow-title { color:#ffd54f; font-weight:bold; margin-bottom:2px; }
.sb-forecast-block--input { color:#e0e0e0; }
.sb-observe-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px; }

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

.sb-tag-list { display:flex; flex-wrap:wrap; gap:4px; }
.sb-effect-tag { font-size:9px; padding:1px 6px; border-radius:8px; background:#37474f; color:#fff; white-space:nowrap; }

.sb-speed-box { display:flex; flex-direction:column; gap:2px; border-top:1px solid #666; padding-top:6px; }
.sb-speed-row { display:flex; justify-content:space-between; font-size:11px; }
.sb-speed-row--mine { color:#ff5252; font-weight:bold; }
.sb-speed-row--excluded { opacity:0.4; text-decoration: line-through; }
.sb-speed-excluded-tag { font-size:8px; color:#ff8a65; margin-left:4px; text-decoration:none; }
.sb-speed-inferred { font-size:10px; color:#4fc3f7; font-weight:bold; }
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
/* 상태이상: 그룹(상태이상/멘탈허브/기타/교체불가)이 각각 한 행씩 세로로 쌓이고,
   그 행 안에서는 라벨+버튼들이 가로로 나란히 배치된다. */
.sb-status-conditions { display:flex; flex-direction:column; gap:4px; }
.sb-condition-row { display:flex; flex-direction:row; align-items:center; gap:6px; flex-wrap:wrap; }
.sb-condition-group-label { font-size:9px; color:#ccc; flex-shrink:0; }
.sb-condition-btn { font-size:9px; padding:2px 6px; border:1px solid #999; border-radius:10px; cursor:pointer; background:#444; color:#fff; white-space:nowrap; }
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