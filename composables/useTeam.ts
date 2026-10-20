// composables/useTeam.ts
// 파티 6슬롯 상태 (내 파티 'mine' / 상대 파티 'opp'). 둘 다 localStorage 에 자동 저장된다.
// 슬롯 구조는 utils/types.ts TeamSlot — 모든 값은 영어 id.
//
// 예전 버전(한글 이름 저장, 키 'pokemon-champions-my-party')에서 저장한 내 파티가 있으면
// 게임 데이터 로드 후 migrateLegacyTeam() 이 한국어 이름표로 id 를 찾아 새 형식으로 옮긴다.

import { emptySlot, STAT_KEYS, type TeamSlot } from '~/utils/types'

export type Side = 'mine' | 'opp'

const STORAGE_KEY: Record<Side, string> = { mine: 'pch-team-mine-v2', opp: 'pch-team-opp-v2' }
const LEGACY_KEY = 'pokemon-champions-my-party'
const hydrated: Record<Side, boolean> = { mine: false, opp: false }

const freshTeam = () => Array.from({ length: 6 }, emptySlot)

function readStorage(key: string) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useTeam(side: Side) {
  const slots = useState<TeamSlot[]>(`team-${side}`, freshTeam)
  // 메가스톤을 들고 있을 때 메가진화 상태로 계산할지 (슬롯별 미리보기 토글)
  const megaOn = useState<boolean[]>(`team-${side}-mega`, () => Array(6).fill(true))
  // 배틀 폼(킬가르도 블레이드폼 / 돌핀맨 마이티폼 / 모르페코 배고픈모양)으로 계산할지. null = 기본값 (useTeamCalc DEFAULT_ALT)
  const altOn = useState<(boolean | null)[]>(`team-${side}-alt`, () => Array(6).fill(null))

  if (import.meta.client && !hydrated[side]) {
    hydrated[side] = true
    const saved = readStorage(STORAGE_KEY[side])
    if (Array.isArray(saved?.slots) && saved.slots.length === 6) {
      slots.value = saved.slots.map((s: Partial<TeamSlot>) => ({ ...emptySlot(), ...s }))
      if (Array.isArray(saved.megaOn)) megaOn.value = saved.megaOn
      if (Array.isArray(saved.altOn) && saved.altOn.length === 6) altOn.value = saved.altOn
    }
    watch(
      [slots, megaOn, altOn],
      () => {
        try {
          localStorage.setItem(
            STORAGE_KEY[side],
            JSON.stringify({ slots: slots.value, megaOn: megaOn.value, altOn: altOn.value }),
          )
        } catch {
          // 저장 실패(용량 초과/차단)는 무시
        }
      },
      { deep: true },
    )
  }

  const reset = () => {
    slots.value = freshTeam()
    megaOn.value = Array(6).fill(true)
    altOn.value = Array(6).fill(null)
  }

  // 6마리 모두 정하고 각자 기술이 1개 이상
  const isComplete = computed(() => slots.value.every((s) => s.species && s.moves.some(Boolean)))
  const filled = computed(() => slots.value.filter((s) => s.species).length)

  return { slots, megaOn, altOn, reset, isComplete, filled }
}

// 예전 한글 이름 저장분 → 새 형식. 내 파티가 비어 있을 때만 1회 실행.
// await 이후에는 composable 을 호출할 수 없으므로 setup 에서 만든 gd / team 을 넘겨받는다.
export async function migrateLegacyTeam(
  gd: ReturnType<typeof useGameData>,
  team: ReturnType<typeof useTeam>,
) {
  if (!import.meta.client) return
  const legacy = readStorage(LEGACY_KEY)
  if (!legacy?.selectedPokemon) return
  const { slots } = team
  if (slots.value.some((s) => s.species)) return

  await gd.loadLocale('ko')
  const ko = gd.names.value.ko
  if (!ko || !gd.data.value) return
  const reverse = (table: Record<string, string>) => {
    const m: Record<string, string> = {}
    for (const [id, name] of Object.entries(table)) m[name.replace(/\s/g, '')] ??= id
    // "에써르 (수컷의 모습)"처럼 기본 폼에 괄호 이름이 붙은 경우 예전 저장분("에써르")도 찾도록
    for (const [id, name] of Object.entries(table))
      m[name.replace(/\s*\(.*\)$/, '').replace(/\s/g, '')] ??= id
    return m
  }
  const rev = {
    pokemon: reverse(
      Object.fromEntries(
        Object.entries(ko.pokemon).filter(([id]) => !gd.data.value!.pokemon[id]?.forme),
      ),
    ),
    abilities: reverse(ko.abilities),
    items: reverse(ko.items),
    moves: reverse(ko.moves),
    natures: reverse(ko.natures),
  }
  const find = (kind: keyof typeof rev, name?: string) =>
    name ? rev[kind][name.replace(/\s/g, '')] || '' : ''
  const LEGACY_STAT = { hp: 'H', atk: 'A', def: 'B', spa: 'C', spd: 'D', spe: 'S' } as const

  slots.value = Array.from({ length: 6 }, (_, i) => {
    const s = emptySlot()
    s.species = find('pokemon', legacy.selectedPokemon[i])
    if (!s.species) return s
    s.ability =
      find('abilities', legacy.selectedAbility?.[i]) || gd.pokemon(s.species)?.abilities[0] || ''
    s.nature =
      find('natures', String(legacy.selectedNature?.[i] || '').replace(/\(.*\)/, '')) || 'serious'
    s.item = find('items', legacy.selectedTool?.[i])
    const moves = (legacy.selectedMoves?.[i] || []).map((m: string) => find('moves', m))
    s.moves = [moves[0] || '', moves[1] || '', moves[2] || '', moves[3] || '']
    for (const k of STAT_KEYS) s.sp[k] = Number(legacy.inputStats?.[i]?.[LEGACY_STAT[k]]) || 0
    return s
  })
  // 이전 완료 후 예전 키 삭제 (파티를 초기화했을 때 다시 가져오지 않도록)
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // 무시
  }
}
