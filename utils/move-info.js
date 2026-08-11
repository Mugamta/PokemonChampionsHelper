import { moves } from '@/data/moves'

export const getMoveData = (moveName) => moves[moveName] || null

// 일반 기술: "위력 80/100%/불꽃/물리/PP 15"
// 변화 기술: "명중률 100%/에스퍼/PP 10 - 효과설명"
export const formatMoveInfo = (moveName) => {
  const move = getMoveData(moveName)
  if (!move) return ''

  const accuracy = move.Accuracy ?? '-'
  const type = move.Type || '-'
  const pp = move.PP ?? '-'

  if (move.Category === '변화') {
    const effect = move.Effect || '효과 정보 없음'
    return `명중률 ${accuracy}%/${type}/PP ${pp} - ${effect}`
  }

  const power = move.Power ?? '-'
  const category = move.Category || '-'

  return `위력 ${power}/${accuracy}%/${type}/${category}/PP ${pp}`
}