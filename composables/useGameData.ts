// composables/useGameData.ts
// public/data/*.json (scripts/build-data.mjs 가 생성) 을 앱 전역에서 한 번만 로드해서 공유한다.
// 키는 전부 영어 id (Showdown id: 'garchompmegaz', 'thunderbolt', 'choicescarf' ...).
// 화면에 보이는 이름/설명은 현재 언어의 names.{locale}.json / texts.{locale}.json 에서 조회한다.

import type { GameData, NameTable, TextTable, Pokemon, Move } from '~/utils/types'

type Kind = keyof NameTable

const CORE_FILES = [
  'pokemon',
  'moves',
  'abilities',
  'items',
  'natures',
  'types',
  'regulations',
] as const

export function useGameData() {
  const data = useState<GameData | null>('gd-core', () => null)
  const names = useState<Record<string, NameTable>>('gd-names', () => ({}))
  const texts = useState<Record<string, TextTable>>('gd-texts', () => ({}))
  const loading = useState('gd-loading', () => false)
  const { locale } = useI18n()
  const { asset } = usePublicAsset()
  const buildId = useRuntimeConfig().public.buildId as string | undefined

  // ?v=빌드 id: 배포가 바뀌면 다른 주소라 캐시된 예전 데이터를 쓰지 않음
  const fetchJson = async <T>(file: string): Promise<T> => {
    const res = await fetch(asset(`data/${file}`) + (buildId ? `?v=${buildId}` : ''))
    if (!res.ok) throw new Error(`${file}: ${res.status}`)
    return res.json()
  }

  const loadLocale = async (lang: string) => {
    if (names.value[lang]) return
    const [n, t] = await Promise.all([
      fetchJson<NameTable>(`names.${lang}.json`),
      fetchJson<TextTable>(`texts.${lang}.json`),
    ])
    names.value = { ...names.value, [lang]: n }
    texts.value = { ...texts.value, [lang]: t }
  }

  // 앱 시작 시 1회 (AppHeader 의 onMounted 에서 호출)
  const load = async () => {
    if (data.value || loading.value) return
    loading.value = true
    try {
      const [parts, usage] = await Promise.all([
        Promise.all(CORE_FILES.map((f) => fetchJson(`${f}.json`))),
        // 사용률 통계는 없어도 동작 (자동 배치가 규칙만 씀)
        fetchJson<Record<string, unknown>>('usage.json')
          .then((u): GameData['usage'] =>
            // 예전 형식(레귤레이션 → 표, 싱글만)이면 싱글로
            'single' in u || 'double' in u
              ? { single: {}, double: {}, ...(u as GameData['usage']) }
              : { single: u as NonNullable<GameData['usage']>['single'], double: {} },
          )
          .catch(() => ({ single: {}, double: {} })),
      ])
      const core = {
        ...Object.fromEntries(CORE_FILES.map((f, i) => [f, parts[i]])),
        usage,
      } as unknown as GameData
      await loadLocale(locale.value)
      data.value = core
    } finally {
      loading.value = false
    }
  }

  const ready = computed(() => !!data.value && !!names.value[locale.value])

  // 이름 조회: 현재 언어 → 영어 → id 순으로 대체
  const name = (kind: Kind, id: string | null | undefined) => {
    if (!id) return ''
    return names.value[locale.value]?.[kind]?.[id] || names.value.en?.[kind]?.[id] || id
  }
  const text = (kind: keyof TextTable, id: string | null | undefined) => {
    if (!id) return ''
    return texts.value[locale.value]?.[kind]?.[id] || ''
  }

  const pokemon = (id: string | null | undefined): Pokemon | null =>
    id ? (data.value?.pokemon[id] ?? null) : null
  const move = (id: string | null | undefined): Move | null =>
    id ? (data.value?.moves[id] ?? null) : null

  // 메가진화의 습득 기술은 원종 것을 그대로 쓴다
  const learnset = (id: string | null | undefined): string[] => {
    const p = pokemon(id)
    if (!p) return []
    return p.learnset ?? pokemon(p.mega?.from ?? p.battleForm?.from)?.learnset ?? []
  }

  // 지닌 도구로 메가진화하는 경우 그 메가 폼 id (없으면 null)
  const megaFor = (
    id: string | null | undefined,
    itemId: string | null | undefined,
  ): string | null => {
    if (!id || !itemId) return null
    const stone = data.value?.items[itemId]?.megaStone
    return stone?.[id] ?? null
  }

  // 배틀 폼(마이티폼 등)은 스프라이트가 없어서 원래 폼 이미지를 쓴다
  const pokemonSprite = (id: string | null | undefined) =>
    id ? asset(`sprites/pokemon/${pokemon(id)?.battleForm?.from ?? id}.png`) : ''
  const itemSprite = (id: string | null | undefined) => (id ? asset(`sprites/items/${id}.png`) : '')

  // 이름 기준 정렬된 선택지 목록 (v-autocomplete 용)
  const options = (kind: Kind, ids: string[]) =>
    ids
      .map((id) => ({ value: id, title: name(kind, id) }))
      .sort((a, b) => a.title.localeCompare(b.title, locale.value))

  watch(locale, (lang) => {
    if (data.value) loadLocale(lang)
  })

  return {
    data,
    names,
    ready,
    loading,
    load,
    loadLocale,
    name,
    text,
    pokemon,
    move,
    learnset,
    megaFor,
    pokemonSprite,
    itemSprite,
    options,
  }
}
