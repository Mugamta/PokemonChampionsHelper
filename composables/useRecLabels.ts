// composables/useRecLabels.ts
// 추천 플레이 화면 문구: 내 선택지·상대 선택지 이름 (RecommendPanel · RecommendLog 공용)

import type { useBattle } from '~/composables/useBattle'
import type { MineOption, OppOption } from '~/composables/useRecommend'
import type { RecPick } from '~/utils/battleState'

export function useRecLabels(b: ReturnType<typeof useBattle>) {
  const { t } = useI18n()
  const gd = useGameData()
  const mineName = (idx: number) => gd.name('pokemon', b.resolveAt('mine', idx)?.species.id)
  // 상대 포켓몬 이름 (아직 안 나온 포켓몬이면 "미공개" 표시)
  const oppName = (idx: number) => {
    const name = gd.name('pokemon', b.resolveAt('opp', idx)?.species.id)
    return b.state.value?.sides.opp.revealed.includes(idx) ? name : t('battle.rec.unseen', { name })
  }
  const oppLabel = (o: OppOption) => {
    if (o.kind === 'switch') return t('battle.rec.switchTo', { name: oppName(o.to) })
    let name = gd.name('moves', o.move)
    if (o.pivotTo != null) name = t('battle.rec.pivot', { move: name, name: oppName(o.pivotTo) })
    return o.noMega ? t('battle.rec.noMega', { move: name }) : name
  }
  const planLabel = (o: MineOption | RecPick) => {
    if (o.kind === 'switch') return t('battle.rec.switchTo', { name: mineName(o.to) })
    let name = gd.name('moves', o.move)
    if (o.pivotTo != null) name = t('battle.rec.pivot', { move: name, name: mineName(o.pivotTo) })
    return o.mega ? t('battle.rec.mega', { move: name }) : name
  }
  // 점수 표시 (HP 비율 → 정수, 부호)
  const signed = (v: number) => {
    const n = Math.round(v * 100)
    return n > 0 ? `+${n}` : String(n)
  }
  return { mineName, oppName, oppLabel, planLabel, signed }
}
