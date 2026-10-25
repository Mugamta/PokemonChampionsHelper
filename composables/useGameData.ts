// composables/useGameData.ts
// public/data/*.json (scripts/build-data.mjs 가 생성) 을 앱 전역에서 한 번만 로드해서 공유한다.
// 키는 전부 영어 id (Showdown id: 'garchompmegaz', 'thunderbolt', 'choicescarf' ...).
// 화면에 보이는 이름/설명은 현재 언어의 names.{locale}.json / texts.{locale}.json 에서 조회한다.

import type { GameData, NameTable, TextTable, Pokemon, Move } from '~/utils/types'
import { usageFile, type UsageIndex, type UsageKind, type UsageTable } from '~/utils/autoSet'

type Kind = keyof NameTable

// 받는 중인 사용률 표 (같은 파일을 두 번 받지 않게)
const usageLoading = new Map<string, Promise<UsageTable | undefined>>()

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
  const usageIndex = useState<UsageIndex | null>('gd-usage-index', () => null)
  const usageTables = useState<Record<string, UsageTable | null>>('gd-usage', () => ({}))
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
    names.value = { ...names.value, [lang]: markRaw(n) }
    texts.value = { ...texts.value, [lang]: markRaw(t) }
  }

  // 앱 시작 시 1회 (AppHeader 의 onMounted 에서 호출)
  const load = async () => {
    if (data.value || loading.value) return
    loading.value = true
    // 언어를 바꾸면 그 언어 이름표 로드. 여기서 한 번만 등록 (useGameData 는 스프라이트 등 컴포넌트마다 불려서
    // 부를 때마다 감시자를 만들면 목록 화면에서 수백 개가 됨)
    watch(locale, (lang) => {
      if (data.value) loadLocale(lang)
    })
    try {
      const [parts, index] = await Promise.all([
        Promise.all(CORE_FILES.map((f) => fetchJson(`${f}.json`))),
        // 사용률 통계 목록 (작은 파일). 없어도 동작 (자동 배치가 규칙만 씀). 표는 usageTable 이 필요할 때 받는다
        fetchJson<UsageIndex>('usage/index.json').catch(
          (): UsageIndex => ({ single: {}, double: {} }),
        ),
      ])
      usageIndex.value = markRaw({ single: index.single ?? {}, double: index.double ?? {} })
      const core = Object.fromEntries(
        CORE_FILES.map((f, i) => [f, parts[i]]),
      ) as unknown as GameData
      await loadLocale(locale.value)
      // 게임 데이터는 바뀌지 않으므로 반응형 프록시로 감싸지 않는다 (깊은 반응형이면 모든 조회가 프록시를 거치고
      // 계산 하나에 의존성 추적이 수천 개씩 걸려 화면 전환이 느려짐). 바뀌는 건 data.value 교체뿐
      data.value = markRaw(core)
    } finally {
      loading.value = false
    }
  }

  const ready = computed(() => !!data.value && !!names.value[locale.value])

  // ── 사용률 통계 ─────────────
  // 표는 종류(싱글/더블) × 레귤레이션마다 따로 받는다 (전부 합치면 1MB 넘음). usageTable 은 아직 없으면 받기 시작하고
  // undefined 를 돌려주며, 받으면 다시 계산된다 (usageTables 가 반응형). null = 받기 실패 / 파일 없음
  const usageMeta = (kind: UsageKind) => usageIndex.value?.[kind] ?? {}
  const loadUsage = (kind: UsageKind, reg: string | null | undefined) => {
    if (!reg || !usageIndex.value?.[kind]?.[reg]) return Promise.resolve(undefined)
    const key = usageFile(kind, reg)
    if (key in usageTables.value) return Promise.resolve(usageTables.value[key] ?? undefined)
    let p = usageLoading.get(key)
    if (!p) {
      p = fetchJson<UsageTable>(key)
        .then((t) => markRaw(t))
        .catch(() => null)
        .then((t) => {
          usageTables.value = { ...usageTables.value, [key]: t }
          usageLoading.delete(key)
          return t ?? undefined
        })
      usageLoading.set(key, p)
    }
    return p
  }
  const usageTable = (kind: UsageKind, reg: string | null | undefined) => {
    if (!reg) return undefined
    const t = usageTables.value[usageFile(kind, reg)]
    if (t === undefined) void loadUsage(kind, reg)
    return t ?? undefined
  }

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

  return {
    data,
    names,
    ready,
    loading,
    load,
    loadLocale,
    usageMeta,
    usageTable,
    loadUsage,
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
