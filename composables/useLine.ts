// composables/useLine.ts
// useBattleAnalysis 가 돌려주는 문구 { key, params } 를 현재 언어로 렌더링.
// params 값이 '@키' 또는 '@키|이름' 이면 그 값도 번역한다 (예: '@status.brn', '@battle.flow.mineLabel|한카리아스').

import type { Line } from '~/composables/useBattleAnalysis'

export function useLine() {
  const { t } = useI18n()
  const param = (v: string | number): string | number => {
    if (typeof v !== 'string' || !v.startsWith('@')) return v
    const [key, name] = v.slice(1).split('|')
    return name !== undefined ? t(key!, { name }) : t(key!)
  }
  return (line: Line) =>
    t(line.key, Object.fromEntries(Object.entries(line.params || {}).map(([k, v]) => [k, param(v)])))
}
