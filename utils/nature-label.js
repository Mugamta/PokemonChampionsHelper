import { Nature, NatureMap } from '@/data/nature'

const STAT_LABELS = { A: '공격', B: '방어', C: '특수공격', D: '특수방어', S: '스피드' }
const FULL_SPACE = '\u3000'
const padFull = (str, width) => str + FULL_SPACE.repeat(Math.max(0, width - str.length))

export const natureOptions = [
  '무보정',
  ...Nature.filter((n) => {
    const effect = NatureMap[n]
    return effect && effect.up && effect.down
  }),
]

export const natureLabel = (natureName) => {
  const paddedName = padFull(natureName, 5)
  const effect = NatureMap[natureName]
  if (!effect || !effect.up || !effect.down) return paddedName

  const upLabel = padFull(STAT_LABELS[effect.up], 4)
  const downLabel = padFull(STAT_LABELS[effect.down], 4)
  return `${paddedName}(${upLabel}↑ ${downLabel}↓)`
}