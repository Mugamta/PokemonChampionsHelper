// tests/autoSet.test.ts — 상대 포켓몬 자동 배치 (utils/autoSet.ts)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  autoSet,
  exclusiveMoves,
  formItemUsage,
  pickUsageTable,
  topUsage,
  usageSet,
  type UsageData,
  type UsageTable,
} from '../utils/autoSet'
import type { Move, Nature, Pokemon } from '../utils/types'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const pokemon = load('pokemon') as Record<string, Pokemon>
const moves = load('moves') as Record<string, Move>
const natures = load('natures') as Record<string, Nature>
const EXCLUSIVE = exclusiveMoves(pokemon)

// 선출 화면과 같은 입력: 메가가 있으면 첫 메가스톤
const build = (id: string) => {
  const base = pokemon[id]!
  const megaId = base.megas?.[0]
  const mega = megaId ? pokemon[megaId] : undefined
  const item = mega?.mega?.item ?? ''
  const form = mega ?? base
  const ls = (base.learnset ?? []).map((m) => moves[m]).filter((m): m is Move => !!m)
  return autoSet({
    base,
    form,
    atkForm: form,
    item,
    moves: ls,
    natures,
    exclusive: EXCLUSIVE.get(base.base || base.id),
  })
}

describe('자동 배치', () => {
  it('메가진화가 있으면 메가스톤, 메가 폼 능력치·특성으로 계산', () => {
    const r = build('garchomp')
    expect(r.item).toBe('garchompite')
    expect(r.ability).toBe(pokemon.garchomp!.abilities[0]) // 슬롯에는 원종 특성
    expect(build('corviknight').item).toBe('')
  })

  it('딜러형: 높은 공격 능력치 상승·낮은 쪽 하락 성격, 그 능력치 32 + S32 + H2', () => {
    const r = build('garchomp')
    expect(r.role).toBe('attacker')
    expect(r.nature).toBe('adamant')
    expect(r.sp).toEqual({ hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 })
    const g = build('gholdengo')
    expect(g.role).toBe('attacker')
    expect(g.nature).toBe('modest')
    expect(g.sp.spa).toBe(32)
  })

  it('내구형: 높은 방어 능력치 상승·공격 능력치 중 낮은 쪽 하락, H32 + 그 능력치 32 + 다른 쪽 2', () => {
    const r = build('corviknight')
    expect(r.role).toBe('defender')
    expect(r.nature).toBe('impish') // 방어 ↑ 특공 ↓
    expect(r.sp).toEqual({ hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 })
  })

  it('내구형 기술: 지원기 우선순위 3개 + 최고 결정력 기술', () => {
    // 하마돈: 스텔스록 → 하품 → 날려버리기(울부짖기보다 앞) → 지진
    expect(build('hippowdon').moves.slice(0, 3)).toEqual(['stealthrock', 'yawn', 'whirlwind'])
    expect(build('hippowdon').moves[3]).toBe('earthquake')
    // 아머까오: 도발·날개쉬기 2개뿐 → 브레이브버드 → 교체기(유턴)
    expect(build('corviknight').moves).toEqual(['taunt', 'roost', 'bravebird', 'uturn'])
  })

  it('딜러형 기술: 최고 결정력 2개(서로 다른 타입) → 스피드 상승기(공격도 오르면 결정력 상승기 생략) → 자속 보충', () => {
    // 한카리아스: 역린(드래곤) 다음은 드래곤다이브가 아니라 다른 타입인 지진
    const c = build('garchomp')
    expect(c.moves.slice(0, 2)).toEqual(['outrage', 'earthquake'])
    const g = build('gyarados')
    expect(g.moves).toContain('dragondance')
    // 철제광선(HP 소모)은 고르지 않고, 고스트 자속 기술이 없으면 섀도볼을 넣는다
    const h = build('gholdengo')
    expect(h.moves).not.toContain('steelbeam')
    expect(h.moves).toContain('nastyplot')
    expect(h.moves).toContain('shadowball')
  })

  it('분류: 결정력 지수(÷3만) ÷ 내구 지수(÷7만) — 1.05 이상 딜러, 0.85 미만 내구, 그 사이 딜포터', () => {
    expect(build('garchomp').role).toBe('attacker') // 메가한카리아스 1.46 / 1.29
    expect(build('absol').role).toBe('attacker') // 메가앱솔 0.89 / 0.74
    expect(build('corviknight').role).toBe('defender') // 0.91 / 1.15
    expect(build('bellibolt').role).toBe('hybrid') // 1.02 / 1.14
    // 내구형 비율이어도 공격 종족값 130 이상이면 딜포터 (대도각참 0.87 / 1.22)
    expect(build('kingambit').role).toBe('hybrid')
  })

  it('딜포터형: 주력 상승 성격, H32 + 주력 32 + 높은 방어 2, 스피드 상승기 대신 회복기, 선공기보다 교체기', () => {
    const k = build('kingambit')
    expect(k.nature).toBe('adamant')
    expect(k.sp).toEqual({ hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 })
    // 찌리배리: 기습(선공기) 대신 회복기
    const b = build('bellibolt')
    expect(b.moves).not.toContain('suckerpunch')
    expect(b.moves).toContain('slackoff')
  })

  it('주력 공격 능력치는 특성 반영: 천하장사 마릴리는 공격형 물리', () => {
    const r = build('azumarill')
    expect(r.ability).toBe('hugepower')
    expect(r.nature).toBe('adamant')
    expect(r.sp.atk).toBe(32)
  })

  it('결정력 상승기: 랭크 합 2 이상 변화기 또는 공격기, 합이 큰 것 우선 (공격·특공 동시 상승은 하나로)', () => {
    // 메가리자몽X: 용의춤(공격+1 스피드+1 = 2)이 스피드·결정력 상승기를 겸해 칼춤은 넣지 않음
    const c = build('charizard')
    expect(c.moves).toContain('dragondance')
    expect(c.moves).not.toContain('swordsdance')
    // 메가요가램: 고속이동 다음 벌크업(공격+1 방어+1 = 2)
    expect(build('medicham').moves).toContain('bulkup')
    // 아보크: 똬리틀기(공격·방어·명중 +1 = 3)
    expect(build('arbok').moves).toContain('coil')
  })

  it('스피드 상승기: 스피드는 1랭크로 쳐서 고속이동보다 공격기 우선, 변화기는 주력 공격 능력치 쪽만', () => {
    const a = build('arcanine')
    expect(a.moves).toContain('flamecharge')
    expect(a.moves).not.toContain('agility')
    // 특수형 메가할비롱: 용의춤(공격+1)은 넣지 않음
    expect(build('drampa').moves).not.toContain('dragondance')
    // 특수형인데 물리 스피드 상승기(개척하기)만 있지 않으면 고속이동 (메가썬더볼트)
    const m = build('manectric')
    expect(m.moves).toContain('agility')
    expect(m.moves).not.toContain('trailblaze')
    // 특수형 스트린더: 기어체인지(공격+1 스피드+2)는 넣지 않음
    expect(build('toxtricity').moves).not.toContain('shiftgear')
  })

  it('기선제압·페인트는 넣지 않음', () => {
    expect(build('conkeldurr').moves).not.toContain('upperhand')
    expect(build('goodra').moves).not.toContain('feint')
  })

  it('자속 최고 기술(한 턴 휴식 포함) 전에 선공기', () => {
    const r = build('squawkabilly')
    expect(r.moves).toContain('quickattack')
    expect(r.moves).not.toContain('gigaimpact')
  })

  it('① 최고 결정력 기술은 기술 자체의 명중 90 이상만 (특성 보정 전)', () => {
    // 램펄드: 양날박치기(명중 80)는 ①에서 고르지 않음
    expect(build('rampardos').moves.slice(0, 2)).not.toContain('headsmash')
    // 시비꼬(의욕): 의욕 보정 전 명중 100인 브레이브버드는 그대로
    expect(build('squawkabilly').moves).toContain('bravebird')
  })

  it('스피드형(HS): 결정력·내구 둘 다 낮고 스피드 100 이상인 딜포터·내구형', () => {
    const w = build('whimsicott')
    expect(w.role).toBe('speedy')
    expect(w.nature).toBe('timid')
    expect(w.sp).toEqual({ hp: 32, atk: 0, def: 2, spa: 0, spd: 0, spe: 32 })
    expect(w.moves.slice(0, 2)).toEqual(['encore', 'taunt'])
  })

  it('반피 회복기가 없고 잠자기·잠꼬대·일격기를 모두 배우면 세트로 (딜포터는 최고 결정력 기술 + 세트)', () => {
    expect(build('snorlax').moves).toEqual(['doubleedge', 'rest', 'sleeptalk', 'fissure'])
    // 일격기를 못 배우면 잠자기 세트 없음 (메가메타그로스)
    expect(build('metagross').moves).not.toContain('rest')
  })

  it('지원기를 1개 이하로 배우는 내구형은 빛의장막·리플렉터·전기자석파·희생기도 고려', () => {
    expect(build('klefki').moves).toContain('lightscreen')
    // 아머까오(도발·날개쉬기 2개)는 해당 없음
    expect(build('corviknight').moves).not.toContain('lightscreen')
  })

  it('전용기: 한 종만 배우는 기술', () => {
    expect(EXCLUSIVE.get('kingambit')?.has('kowtowcleave')).toBe(true)
    expect(EXCLUSIVE.get('wyrdeer')?.has('psyshieldbash')).toBe(true)
    expect(build('wyrdeer').moves).toContain('psyshieldbash')
  })

  it('결정력이 같으면 명중 100·페널티 없음·부가효과 있음에 많이 해당하는 기술 우선', () => {
    // 메가펜드라: 이판사판태클·흡혈·독찌르기·시저크로스 모두 같은 결정력 → 독찌르기(독 30%)가 먼저
    expect(build('scolipede').moves[0]).toBe('poisonjab')
  })

  it('메가진화 전·후 특성에 가속이 있으면 스피드 상승기를 쓰지 않음', () => {
    expect(build('blaziken').moves).not.toContain('flamecharge') // 메가번치코
    expect(build('scolipede').moves).not.toContain('trailblaze') // 펜드라 숨겨진 특성 가속
  })

  it('그래도 칸이 남으면 배우는 기술 순서대로 (메타몽 = 변신)', () => {
    expect(build('ditto').moves[0]).toBe('transform')
  })

  it('모든 포켓몬: 배우는 기술만, 중복 없음, 능력 포인트 합 66 이하', () => {
    for (const p of Object.values(pokemon)) {
      if (p.mega || p.battleForm?.from || !p.learnset?.length) continue
      const r = build(p.id)
      const ids = r.moves.filter(Boolean)
      expect(new Set(ids).size).toBe(ids.length)
      for (const m of ids) expect(p.learnset).toContain(m)
      expect(Object.values(r.sp).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(66)
      expect(natures[r.nature]).toBeTruthy()
    }
  })
})

describe('사용률 통계 우선', () => {
  const table: UsageTable = {
    format: 'test',
    month: '2026-09',
    battles: 1000,
    pokemon: {
      garchomp: {
        count: 300,
        moves: ['earthquake', 'swordsdance'],
        nature: 'jolly',
        sp: [2, 32, 0, 0, 0, 32],
        ability: 'roughskin',
        items: ['choicescarf', 'lifeorb'],
      },
      garchompmega: {
        count: 500,
        moves: ['earthquake', 'scaleshot', 'stealthrock', 'rocktomb'],
        nature: 'adamant',
        sp: [2, 32, 0, 0, 0, 32],
        ability: 'sandforce',
        items: ['garchompite'],
      },
    },
  }
  const rules = build('garchomp')

  it('원종·메가 중 많이 쓴 폼, 메가면 메가스톤 + 원종 특성', () => {
    const r = usageSet(pokemon.garchomp!, table, pokemon, rules)!
    expect(r.source).toBe('usage')
    expect(r.item).toBe('garchompite')
    expect(r.ability).toBe('roughskin') // 원종 통계의 특성
    expect(r.moves).toEqual(['earthquake', 'scaleshot', 'stealthrock', 'rocktomb'])
    expect(r.nature).toBe('adamant')
    expect(r.sp).toEqual({ hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 })
  })

  it('원종이 더 많으면 원종 도구, 같은 파티가 쓴 도구는 다음 순위, 기술이 모자라면 규칙으로 채움', () => {
    const t: UsageTable = {
      ...table,
      pokemon: { ...table.pokemon, garchompmega: { ...table.pokemon.garchompmega!, count: 100 } },
    }
    const r = usageSet(pokemon.garchomp!, t, pokemon, rules, ['choicescarf'])!
    expect(r.item).toBe('lifeorb')
    expect(r.nature).toBe('jolly')
    expect(r.moves.slice(0, 2)).toEqual(['earthquake', 'swordsdance'])
    expect(r.moves.filter(Boolean)).toHaveLength(4)
  })

  it('도구 채용률은 원종 + 메가 폼을 사용 수로 합침 (메가스톤 = 메가 폼 비율)', () => {
    const t: UsageTable = {
      ...table,
      pokemon: {
        garchomp: { ...table.pokemon.garchomp!, itemUsage: { choicescarf: 0.6, lifeorb: 0.4 } },
        garchompmega: { ...table.pokemon.garchompmega!, itemUsage: { garchompite: 1 } },
      },
    }
    const u = formItemUsage(pokemon.garchomp!, t)!
    expect(u.garchompite).toBeCloseTo(500 / 800)
    expect(u.choicescarf).toBeCloseTo((0.6 * 300) / 800)
    expect(formItemUsage(pokemon.corviknight!, t)).toBeUndefined()
  })

  it('통계가 없으면 null (규칙 배치를 씀)', () => {
    expect(usageSet(pokemon.garchomp!, undefined, pokemon, rules)).toBeNull()
    expect(usageSet(pokemon.corviknight!, table, pokemon, build('corviknight'))).toBeNull()
  })

  it('생성된 usage.json: 싱글·더블 모두, 기술은 배우는 것만, 능력 포인트 합 66 이하', () => {
    const usage = load('usage') as UsageData
    expect(Object.keys(usage.single).length).toBeGreaterThan(0)
    expect(Object.keys(usage.double).length).toBeGreaterThan(0)
    for (const t of [...Object.values(usage.single), ...Object.values(usage.double)])
      for (const [id, u] of Object.entries(t.pokemon)) {
        const p = pokemon[id]!
        const learn = p.learnset ?? pokemon[p.mega?.from ?? '']?.learnset ?? []
        for (const m of [...u.moves, ...Object.keys(u.moveUsage ?? {})]) expect(learn).toContain(m)
        if (u.sp) expect(u.sp.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(66)
      }
  })
})

describe('사용률 상위 (첫 화면)', () => {
  const mk = (month: string, mons: UsageTable['pokemon']): UsageTable => ({
    format: 'f',
    month,
    battles: 1,
    pokemon: mons,
  })
  const set = (count: number, usage?: number) => ({
    count,
    usage,
    moves: [],
    ability: '',
    items: [],
  })
  const tables = {
    'M-A': mk('2026-06', {}),
    'M-B': mk('2026-09', {}),
    'M-C': mk('2026-09', {}),
  }

  it('현재 레귤레이션 표, 없으면 가장 최근 달 (같으면 뒤 레귤레이션)', () => {
    expect(pickUsageTable(tables, 'M-A')?.reg).toBe('M-A')
    expect(pickUsageTable(tables, 'M-D')?.reg).toBe('M-C')
    expect(pickUsageTable(tables, null)?.reg).toBe('M-C')
    expect(pickUsageTable(undefined, 'M-A')).toBeNull()
  })

  it('채용률 순, 같으면 사용 수 순', () => {
    const t = mk('2026-09', {
      a: set(100, 0.1),
      b: set(50, 0.3),
      c: set(200, 0.1),
      d: set(10, 0.05),
    })
    expect(topUsage(t, 3).map((u) => u.id)).toEqual(['b', 'c', 'a'])
  })
})
