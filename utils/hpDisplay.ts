// utils/hpDisplay.ts — 상대 HP % 표시 규칙 (포켓몬 챔피언스: 버림)
//
// 화면의 p% = floor(실제 HP × 100 / 최대 HP). 실제 HP 는 최대 HP 의 [p%, (p+1)%) 안 (100% 는 가득 찬 것뿐).
// 상대 HP 는 배틀 상태에 화면 % 로 저장하고, 실수치가 필요하면 아래 함수로 범위·대푯값을 구한다.

import { statusDamage } from './ko'

// 실제 HP → 화면 %
export const shownPct = (hp: number, maxHp: number) =>
  maxHp > 0 ? Math.floor((Math.max(0, Math.min(hp, maxHp)) * 100) / maxHp) : 0

// 화면 % → 그렇게 보이는 실제 HP 범위 (정수). pct 가 소수면 버린 값 기준. 0% 는 쓰러짐(0), 살아 있는 0% 는 없다고 본다
export function hpRangeOfPct(pct: number, maxHp: number): { min: number; max: number } {
  const p = Math.floor(pct + 1e-9)
  if (p <= 0 || maxHp <= 0) return { min: 0, max: 0 }
  if (p >= 100) return { min: maxHp, max: maxHp }
  // h × 100 ≥ p × M  그리고  h × 100 < (p+1) × M
  const min = Math.max(1, Math.ceil((p * maxHp) / 100 - 1e-9))
  const max = Math.min(maxHp - 1, Math.ceil(((p + 1) * maxHp) / 100 - 1e-9) - 1)
  return { min, max: Math.max(min, max) }
}

// 화면 % → 계산에 쓸 실제 HP 하나 (범위의 가운데, 가득 차 있으면 최대 HP)
export function hpOfPct(pct: number, maxHp: number) {
  const r = hpRangeOfPct(pct, maxHp)
  return Math.round((r.min + r.max) / 2)
}

// 화면 % 두 개(맞기 전 before → 맞은 뒤 after)로 본 실제 데미지(HP) 범위. after 가 소수면(데미지 직접 입력)
// 위·아래 정수 % 를 모두 덮는다. after ≤ 0 이면 쓰러뜨림 → 맞기 전 남은 HP 만큼
export function dealtHpRange(before: number, after: number, maxHp: number) {
  const b = hpRangeOfPct(before, maxHp)
  if (after <= 0) return b
  const lo = hpRangeOfPct(Math.floor(after + 1e-9), maxHp)
  const hi = hpRangeOfPct(Math.ceil(after - 1e-9), maxHp)
  return {
    min: Math.max(0, b.min - Math.max(lo.max, hi.max)),
    max: b.max - Math.min(lo.min, hi.min),
  }
}

// ── 턴 끝 HP 관측 ─────────────
// 턴 끝에 최대 HP 비율로 바뀌는 HP (모래바람·먹다남은음식·씨뿌리기 등 frac, 상태이상 데미지)는 최대 HP 에 따라 결과 % 가
// 달라진다 → 게임 화면의 결과 % 를 알면 그렇게 될 수 있는 최대 HP 만 남길 수 있다.
//   frac: 최대 HP × |frac| (버림, 최소 1) 만큼 회복(+) / 데미지(−)  — useBattle.changeHpFrac 과 같은 계산
//   status: utils/ko.statusDamage 와 같은 계산
export type HpStep = { frac: number } | { status: string; ability: string; toxicTurn: number }
export interface HpObservation {
  start: number // 턴 끝 HP 변화 직전 화면 % (100 = 가득 = 실제 최대 HP)
  steps: HpStep[]
  shown: number // 게임 화면의 결과 %
}

// 최대 HP maxHp 일 때 start% 에서 steps 를 거쳐 화면 shown% 가 될 수 있는지
export function hpStepsMatch(maxHp: number, o: HpObservation): boolean {
  if (maxHp <= 0) return false
  const r = hpRangeOfPct(o.start, maxHp)
  for (let h0 = r.min; h0 <= r.max; h0++) {
    let h = h0
    for (const st of o.steps) {
      if (h <= 0) break
      const d =
        'frac' in st
          ? Math.sign(st.frac) * Math.max(1, Math.floor(maxHp * Math.abs(st.frac)))
          : -statusDamage(maxHp, st.status, st.ability, st.toxicTurn)
      h = Math.max(0, Math.min(maxHp, h + d))
    }
    // 살아 있으면 최소 1% 로 본다 (배틀 상태와 같은 규칙)
    const shown = h <= 0 ? 0 : Math.max(1, shownPct(h, maxHp))
    if (shown === o.shown) return true
  }
  return false
}

// 턴 끝에 예상한 결과 (useBattle 이 턴 적용 때 저장). 다음 턴 적용 전에 사용자가 상대 HP 를 게임 화면 값으로
// 고쳤으면 그 값이 관측이 된다
export interface HpCheck {
  turn: number // 이 턴(턴 적용 후의 턴 번호) 동안만 유효
  start: number
  steps: HpStep[]
  predicted: number // 앱이 계산한 결과 화면 %
}
// 예상과 다른 정수 % 로 고쳤으면 관측. 2%p 넘게 다르면 턴 끝 계산 차이가 아니라 다른 입력을 고친 것으로 보고 무시
export const HP_CORRECTION_MAX = 2
export function hpCorrection(
  c: HpCheck | null | undefined,
  hp: number,
  turn: number,
): HpObservation | null {
  if (!c || c.turn !== turn || hp === c.predicted || !Number.isInteger(hp)) return null
  if (Math.abs(hp - c.predicted) > HP_CORRECTION_MAX) return null
  return { start: c.start, steps: c.steps, shown: hp }
}
