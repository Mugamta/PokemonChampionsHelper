import { moves } from '@/data/moves'

export const getMoveData = (moveName) => moves[moveName] || null

// 일반 기술: "위력 80/100%/불꽃/물리/PP 15"
// 변화 기술(명중률 있음): "명중률 100%/에스퍼/PP 10 - 효과설명"
// 변화 기술(명중률 없음, 스텔스록 등): "에스퍼/PP 10 - 효과설명"
export const formatMoveInfo = (moveName) => {
  const move = getMoveData(moveName)
  if (!move) return ''

  const type = move.Type || '-'
  const pp = move.PP ?? '-'
  const hasAccuracy = move.Accuracy !== null && move.Accuracy !== undefined

  if (move.Category === '변화') {
    const effect = move.Effect || '효과 정보 없음'
    const accuracyPart = hasAccuracy ? `명중률 ${move.Accuracy}%/` : ''
    return `${accuracyPart}${type}/PP ${pp} - ${effect}`
  }

  const power = move.Power ?? '-'
  const category = move.Category || '-'
  const accuracy = hasAccuracy ? `${move.Accuracy}%` : '-'

  return `위력 ${power}/${accuracy}/${type}/${category}/PP ${pp}`
}