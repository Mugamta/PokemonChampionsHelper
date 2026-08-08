import { moves } from '@/data/moves'

export const getMoveData = (moveName) => moves[moveName] || null

// "위력 80/100%/불꽃/물리/PP 15" 형식
export const formatMoveInfo = (moveName) => {
  const move = getMoveData(moveName)
  if (!move) return ''

  const power = move.Power ?? '-'
  const accuracy = move.Accuracy ?? '-'
  const type = move.Type || '-'
  const category = move.Category || '-'
  const pp = move.PP ?? '-'

  return `위력 ${power}/${accuracy}%/${type}/${category}/PP ${pp}`
}