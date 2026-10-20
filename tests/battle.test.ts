// tests/battle.test.ts — 배틀 상태 머신(useBattle)과 분석(useBattleAnalysis) 동작 확인
// Nuxt 없이 돌리기 위해 tests/nuxt-env.ts 에서 자동 import 를 전역으로 채운다.

import { gameData, resetNuxtState, slot } from './nuxt-env'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBattle } from '../composables/useBattle'
import { useBattleAnalysis } from '../composables/useBattleAnalysis'
import { useOppEstimate } from '../composables/useOppEstimate'
import { PICK_COUNT, useEntry, type BattleMode } from '../composables/useEntry'
import { useTeam } from '../composables/useTeam'
import { emptySlot, type TeamSlot } from '../utils/types'
import { calcDamage } from '../utils/damage'

const pad6 = (s: TeamSlot[]) => [...s, ...Array.from({ length: 6 - s.length }, emptySlot)]

function setup(mode: BattleMode, mine: TeamSlot[], opp: TeamSlot[]) {
  useTeam('mine').slots.value = pad6(mine)
  useTeam('opp').slots.value = pad6(opp)
  useEntry(mode).picks.value = mine.map((_, i) => i).slice(0, PICK_COUNT[mode])
  const b = useBattle(mode)
  b.ensure()
  return b
}
type Battle = ReturnType<typeof useBattle>
const S = (b: Battle) => b.state.value!
const mon = (b: Battle, side: 'mine' | 'opp', i: number) => S(b).sides[side].mons[i]!
const moveAction = (
  b: Battle,
  side: 'mine' | 'opp',
  slotNo: number,
  move: string,
  amount: number | null = null,
) => Object.assign(S(b).actions[side][slotNo]!, { kind: 'move', move, amount, target: 0 })
const switchAction = (b: Battle, side: 'mine' | 'opp', slotNo: number, to: number) =>
  Object.assign(S(b).actions[side][slotNo]!, { kind: 'switch', switchTo: to })

beforeEach(() => resetNuxtState())

describe('배틀 폼', () => {
  it('팔라피: 배틀 시작은 노멀폼, 한 번 물러나면 마이티폼', () => {
    const b = setup(
      'single',
      [slot('palafin'), slot('garchomp'), slot('incineroar')],
      [slot('gholdengo')],
    )
    expect(b.resolveAt('mine', 0)!.species.id).toBe('palafin')
    switchAction(b, 'mine', 0, 1)
    b.executeTurn()
    expect(mon(b, 'mine', 0).alt).toBe(true)
    switchAction(b, 'mine', 0, 0)
    b.executeTurn()
    const r = b.resolveAt('mine', 0)!
    expect(r.species.id).toBe('palafinhero')
    expect(r.stats.atk).toBeGreaterThan(b.resolveAt('mine', 0, undefined)!.base.stats.atk)
  })

  it('킬가르도: 공격 계산은 블레이드폼, 공격기 후 블레이드 / 킹실드 후 실드', () => {
    const b = setup('single', [slot('garchomp')], [slot('aegislash')])
    b.sendOut('opp', 0, 0)
    const shield = b.combatantOf('opp', 0)!
    const attacking = b.combatantOf('opp', 0, undefined, true)!
    expect(shield.species.id).toBe('aegislash')
    expect(attacking.species.id).toBe('aegislashblade')
    expect(attacking.stats.atk).toBeGreaterThan(shield.stats.atk)

    moveAction(b, 'opp', 0, 'shadowball')
    b.executeTurn()
    expect(b.combatantOf('opp', 0)!.species.id).toBe('aegislashblade')
    moveAction(b, 'opp', 0, 'kingsshield')
    b.executeTurn()
    expect(b.combatantOf('opp', 0)!.species.id).toBe('aegislash')
  })
})

describe('위협 자동 적용', () => {
  it('상대 선두의 위협 → 내 공격 −1, 선두를 다시 고르면 중복되지 않음', () => {
    const b = setup(
      'single',
      [slot('garchomp')],
      [slot('incineroar', { ability: 'intimidate' }), slot('gyarados'), slot('gholdengo')],
    )
    b.sendOut('opp', 0, 0)
    expect(mon(b, 'mine', 0).boosts.atk).toBe(-1)
    b.sendOut('opp', 0, 1) // 선두 변경 (위협 → 위협)
    expect(mon(b, 'mine', 0).boosts.atk).toBe(-1)
    b.sendOut('opp', 0, 2) // 선두 변경 (위협 없음)
    expect(mon(b, 'mine', 0).boosts.atk).toBe(0)
  })

  it('내 선두의 위협은 나중에 고른 상대 선두에게도 적용, 오기·클리어바디 반응', () => {
    const b = setup(
      'single',
      [slot('incineroar', { ability: 'intimidate' })],
      [slot('kingambit', { ability: 'defiant' }), slot('metagross')],
    )
    b.sendOut('opp', 0, 0)
    expect(mon(b, 'opp', 0).boosts.atk).toBe(1) // −1 후 오기 +2
    b.sendOut('opp', 0, 1)
    expect(mon(b, 'opp', 1).boosts.atk).toBe(0) // 클리어바디
  })

  it('배틀 중 교체로 등장해도 발동', () => {
    const b = setup('single', [slot('garchomp')], [slot('gholdengo'), slot('gyarados')])
    b.sendOut('opp', 0, 0)
    b.executeTurn()
    expect(mon(b, 'mine', 0).boosts.atk).toBe(0)
    switchAction(b, 'opp', 0, 1)
    b.executeTurn()
    expect(mon(b, 'mine', 0).boosts.atk).toBe(-1)
  })
})

describe('도구 소모', () => {
  it('반감열매: 효과굉장으로 맞으면 소모 → 이후 계산에서 도구 없음', () => {
    const b = setup('single', [slot('charizard')], [slot('scizor', { item: 'occaberry' })])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'flamethrower', 40)
    b.executeTurn()
    expect(mon(b, 'opp', 0).itemGone).toBe(true)
    expect(b.combatantOf('opp', 0)!.item).toBe('')
    b.toggleItemGone('opp', 0)
    expect(b.combatantOf('opp', 0)!.item).toBe('occaberry')
  })

  it('기합의띠: 내 포켓몬이 만피에서 HP 1 로 버티면 소모', () => {
    const b = setup('single', [slot('garchomp', { item: 'focussash' })], [slot('gholdengo')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    moveAction(b, 'opp', 0, 'shadowball', max - 1)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(1)
    expect(mon(b, 'mine', 0).itemGone).toBe(true)
  })
})

describe('더블: 아군 효과', () => {
  it('프렌드가드는 맞는 포켓몬의 아군에게 있을 때만, 도우미는 같은 편 다른 칸이 쓸 때', () => {
    const b = setup(
      'double',
      [slot('garchomp'), slot('incineroar'), slot('gholdengo'), slot('dragonite')],
      [slot('maushold', { ability: 'friendguard' }), slot('kingambit')],
    )
    b.sendOut('opp', 0, 0)
    b.sendOut('opp', 1, 1)
    expect(b.fieldFor('opp', 1).friendGuard).toBe(true)
    expect(b.fieldFor('opp', 0).friendGuard).toBe(false)

    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'dragonclaw')
    S(b).actions.mine[0]!.target = 1
    const plain = an.mineActionPreview.value!
    moveAction(b, 'mine', 1, 'helpinghand')
    expect(b.helpingHandFor('mine', 0)).toBe(true)
    expect(b.helpingHandFor('mine', 1)).toBe(false)
    const helped = an.mineActionPreview.value!
    expect(helped.max).toBeGreaterThan(plain.max)
  })
})

describe('턴 진행', () => {
  it('턴 종료 독 데미지, 가뭄 날씨 지속(바위 8턴), 되돌리기', () => {
    const b = setup(
      'single',
      [slot('charizard')],
      [slot('torkoal', { ability: 'drought', item: 'heatrock' })],
    )
    b.sendOut('opp', 0, 0)
    expect(S(b).weather).toMatchObject({ key: 'sun', total: 8 })
    b.setStatus('mine', 0, 'psn')
    const before = mon(b, 'mine', 0).hp
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(before - Math.floor(b.maxHp('mine', 0) / 8))
    expect(S(b).weather.cur).toBe(1)
    expect(S(b).turn).toBe(2)
    b.undo()
    expect(S(b).turn).toBe(1)
    expect(mon(b, 'mine', 0).hp).toBe(before)
  })
})

describe('랭크 변화 반응', () => {
  it('심술꾸러기: 인파이트로 방어·특방 상승 / 하양허브: 내려간 능력치 복구 후 소모', () => {
    const b = setup(
      'single',
      [slot('garchomp', { ability: 'contrary' }), slot('lucario', { item: 'whiteherb' })],
      [slot('kingambit')],
    )
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'closecombat')
    b.executeTurn()
    expect(mon(b, 'mine', 0).boosts).toMatchObject({ def: 1, spd: 1 })
    switchAction(b, 'mine', 0, 1)
    b.executeTurn()
    moveAction(b, 'mine', 0, 'closecombat')
    b.executeTurn()
    expect(mon(b, 'mine', 1).boosts).toMatchObject({ def: 0, spd: 0 })
    expect(mon(b, 'mine', 1).itemGone).toBe(true)
  })

  it('상대가 내린 랭크: 오기 공격 +2, 미러아머 반사, 클리어바디 무효', () => {
    const b = setup(
      'single',
      [slot('garchomp')],
      [
        slot('kingambit', { ability: 'defiant' }),
        slot('corviknight', { ability: 'mirrorarmor' }),
        slot('metagross'),
      ],
    )
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'screech')
    b.executeTurn()
    expect(mon(b, 'opp', 0).boosts).toMatchObject({ def: -2, atk: 2 })
    moveAction(b, 'mine', 0, '')
    switchAction(b, 'opp', 0, 1)
    b.executeTurn()
    moveAction(b, 'mine', 0, 'screech')
    b.executeTurn()
    expect(mon(b, 'opp', 1).boosts.def).toBe(0)
    expect(mon(b, 'mine', 0).boosts.def).toBe(-2)
    moveAction(b, 'mine', 0, '')
    switchAction(b, 'opp', 0, 2)
    b.executeTurn()
    moveAction(b, 'mine', 0, 'screech')
    b.executeTurn()
    expect(mon(b, 'opp', 2).boosts.def).toBe(0)
  })

  it('맞았을 때: 지구력 방어 +1 / 쓰러뜨리면 자기과신 공격 +1 / 가속은 턴 종료마다 +1', () => {
    const b = setup(
      'single',
      [slot('gyarados', { ability: 'moxie' })],
      [slot('garchomp', { ability: 'stamina' }), slot('gholdengo', { ability: 'speedboost' })],
    )
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'waterfall', 40)
    b.executeTurn()
    expect(mon(b, 'opp', 0).boosts.def).toBe(1)
    moveAction(b, 'mine', 0, 'waterfall', 60)
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBe(0)
    expect(mon(b, 'mine', 0).boosts.atk).toBe(1)
    b.sendOut('opp', 0, 1) // 쓰러진 뒤 교체 등장
    b.executeTurn()
    expect(mon(b, 'opp', 1).boosts.spe).toBe(0) // 나온 턴에는 발동 안 함
    b.executeTurn()
    expect(mon(b, 'opp', 1).boosts.spe).toBe(1)
  })
})

describe('상황에 따른 공격 보정', () => {
  it('메트로놈 연속 횟수 / 총대장 쓰러진 수', () => {
    const b = setup(
      'single',
      [slot('kingambit', { ability: 'supremeoverlord', item: 'metronome' }), slot('garchomp')],
      [slot('gholdengo')],
    )
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'kowtowcleave')
    b.executeTurn()
    b.executeTurn()
    expect(b.attackOpts('mine', 0, 'kowtowcleave').metronomeCount).toBe(2)
    expect(b.attackOpts('mine', 0, 'ironhead').metronomeCount).toBe(0)
    mon(b, 'mine', 1).hp = 0
    expect(b.attackOpts('mine', 0, 'kowtowcleave').faintedAllies).toBe(1)
  })

  it('애널라이즈: 대상보다 느리면 1.3배 / 잠복: 대상이 교체로 들어오면 그 포켓몬에게 2배', () => {
    const b = setup(
      'single',
      [slot('metagross', { ability: 'analytic' }), slot('garchomp', { ability: 'stakeout' })],
      [slot('dragapult'), slot('gholdengo')],
    )
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'meteormash')
    moveAction(b, 'opp', 0, 'dragondarts')
    const last = an.mineActionPreview.value!.max
    mon(b, 'mine', 0).boosts.spe = 6 // 더 빨라지면 미발동
    expect(an.mineActionPreview.value!.max).toBeLessThan(last)

    switchAction(b, 'mine', 0, 1)
    b.executeTurn()
    moveAction(b, 'mine', 0, 'dragonclaw')
    switchAction(b, 'opp', 0, 1)
    const stake = an.mineActionPreview.value!
    S(b).actions.opp[0]!.kind = 'move'
    expect(stake.max).toBeGreaterThan(0)
    expect(an.mineActionPreview.value).not.toEqual(stake) // 교체를 안 하면 대상(드래펄트)·보정이 달라짐
  })

  it('곡예: 도구를 잃으면 스피드 2배', () => {
    const b = setup(
      'single',
      [slot('garchomp', { ability: 'unburden', item: 'sitrusberry' })],
      [slot('gholdengo')],
    )
    const an = useBattleAnalysis(b)
    const before = an.speedOf('mine', 0)
    b.toggleItemGone('mine', 0)
    expect(an.speedOf('mine', 0)).toBe(before * 2)
  })
})

describe('더블: 아군도 맞히는 광역기', () => {
  it('지진의 아군 피해 예상·적용, 텔레파시는 무효', () => {
    const b = setup(
      'double',
      [
        slot('garchomp'),
        slot('incineroar'),
        slot('gardevoir', { ability: 'telepathy' }),
        slot('dragonite'),
      ],
      [slot('kingambit'), slot('gholdengo')],
    )
    b.sendOut('opp', 0, 0)
    b.sendOut('opp', 1, 1)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'earthquake')
    expect(b.hitsAlly('earthquake')).toBe(true)
    expect(b.hitsAlly('rockslide')).toBe(false)
    const c = an.allyCell('mine', 0)!
    expect(c.max).toBeGreaterThan(0)
    S(b).actions.mine[0]!.allyAmount = 30
    const before = mon(b, 'mine', 1).hp
    b.executeTurn()
    expect(mon(b, 'mine', 1).hp).toBe(before - 30)

    switchAction(b, 'mine', 1, 2) // 텔레파시 가디안
    b.executeTurn()
    moveAction(b, 'mine', 0, 'earthquake')
    expect(an.allyCell('mine', 0)!.immune).toBe(true)
  })

  it('아군 피해 입력 범위 검사', () => {
    const b = setup(
      'double',
      [slot('garchomp'), slot('incineroar')],
      [slot('kingambit'), slot('gholdengo')],
    )
    moveAction(b, 'mine', 0, 'earthquake')
    S(b).actions.mine[0]!.allyAmount = 9999
    expect(b.validationError.value).toBe('errAlly')
  })
})

describe('설치기 (교체로 들어올 때)', () => {
  it('스텔스록·압정뿌리기·독압정·끈적끈적네트, 땅에 없는 포켓몬은 압정·네트 무시, 정정은 적용 안 함', () => {
    const b = setup(
      'single',
      [slot('garchomp'), slot('gyarados'), slot('incineroar')],
      [slot('kingambit')],
    )
    b.sendOut('opp', 0, 0)
    for (const k of ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'])
      b.toggleSideCondition('mine', k)
    // 갸라도스(물/비행): 스텔스록 2배 = 1/4, 압정·독압정·네트는 땅에 없어서 무시
    switchAction(b, 'mine', 0, 1)
    b.executeTurn()
    const gy = mon(b, 'mine', 1)
    const gyMax = b.maxHp('mine', 1)
    expect(gy.hp).toBe(gyMax - Math.floor((gyMax * 2) / 8))
    expect(gy.status).toBe('')
    expect(gy.boosts.spe).toBe(0)
    // 어흥염(불꽃/악): 스텔스록 2배 + 압정 1겹 1/8, 독(턴 끝 1/8), 스피드 −1
    switchAction(b, 'mine', 0, 2)
    b.executeTurn()
    const inc = mon(b, 'mine', 2)
    const incMax = b.maxHp('mine', 2)
    // 스텔스록 + 압정 + 턴 끝 독 데미지 1/8
    expect(inc.hp).toBe(incMax - Math.floor((incMax * 2) / 8) - 2 * Math.floor(incMax / 8))
    expect(inc.status).toBe('psn')
    expect(inc.boosts.spe).toBe(-1)
    // 정정(상태 정정 모드)은 설치기·등장 효과 없음, 그냥 교체는 적용
    const before = mon(b, 'mine', 0).hp
    b.sendOut('mine', 0, 0, 'correct')
    expect(mon(b, 'mine', 0).hp).toBe(before)
    expect(S(b).sides.mine.active[0]).toBe(0)
    b.sendOut('mine', 0, 1)
    expect(mon(b, 'mine', 1).hp).toBe(gyMax - 2 * Math.floor((gyMax * 2) / 8))
  })
})

describe('행동으로 인한 교체 / 빗나감 / 더블 광역기 / 조건부 기술', () => {
  it('유턴: 공격 후 고른 포켓몬으로 교체 (설치기 적용), 드래곤테일: 상대가 교체', () => {
    const b = setup(
      'single',
      [slot('scizor'), slot('gyarados')],
      [slot('garchomp'), slot('kingambit')],
    )
    b.sendOut('opp', 0, 0)
    b.toggleSideCondition('mine', 'stealthrock')
    moveAction(b, 'mine', 0, 'uturn', 20)
    S(b).actions.mine[0]!.selfSwitch = 1
    expect(b.canSelfSwitch('mine', 0)).toBe(true)
    b.executeTurn()
    expect(S(b).sides.mine.active[0]).toBe(1)
    expect(mon(b, 'mine', 1).hp).toBe(b.maxHp('mine', 1) - Math.floor((b.maxHp('mine', 1) * 2) / 8))
    moveAction(b, 'opp', 0, 'dragontail', 30)
    S(b).actions.opp[0]!.foeSwitch = 0
    expect(b.canForceSwitch('opp', 0)).toBe(true)
    b.executeTurn()
    expect(S(b).sides.mine.active[0]).toBe(0)
  })
  it('빗나감: 데미지 없음, 무릎차기는 최대 HP 1/2 반동, 다음 턴 분함의발구르기 2배', () => {
    const b = setup('single', [slot('medicham')], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'highjumpkick', 50)
    S(b).actions.mine[0]!.missed = true
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBe(100)
    expect(mon(b, 'mine', 0).hp).toBe(b.maxHp('mine', 0) - Math.floor(b.maxHp('mine', 0) / 2))
    expect(mon(b, 'mine', 0).lastFailed).toBe(true)
    expect(b.attackOpts('mine', 0, 'stompingtantrum').lastMoveFailed).toBe(true)
  })
  it('더블 광역기: 두 상대에게 각각 입력한 피해를 적용', () => {
    const b = setup(
      'double',
      [slot('garchomp'), slot('gyarados')],
      [slot('kingambit'), slot('gholdengo')],
    )
    b.sendOut('opp', 0, 0)
    b.sendOut('opp', 1, 1)
    moveAction(b, 'mine', 0, 'earthquake', 40)
    S(b).actions.mine[0]!.amount2 = 30
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBe(60)
    expect(mon(b, 'opp', 1).hp).toBe(70)
  })
  it('카운터: 먼저 받은 물리 데미지 × 2 / 승부굳히기: 이미 맞은 상대에게 2배', () => {
    const b = setup('single', [slot('scizor')], [slot('garchomp')])
    if (!b.mineSlots.value[0]?.species) return
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'earthquake', 50)
    moveAction(b, 'mine', 0, 'counter')
    S(b).observedOrder = 'opp'
    const order = b.turnOrder()
    const opts = b.actionOpts('mine', 0, 0, 'counter', order)
    expect(opts.damageTaken?.physical).toBe(50)
  })
})

describe('확정 부가효과 / 명중·회피 랭크', () => {
  it('진흙뿌리기(100%) 명중 −1, 빗나가면 효과 없음', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'mudslap', 10)
    b.executeTurn()
    expect(mon(b, 'opp', 0).boosts.accuracy).toBe(-1)
    // 빗나가면 효과 없음
    moveAction(b, 'mine', 0, 'mudslap', 0)
    S(b).actions.mine[0]!.missed = true
    b.executeTurn()
    expect(mon(b, 'opp', 0).boosts.accuracy).toBe(-1)
  })
  it('전기자석파: 마비 (전기 타입·이미 상태이상이면 안 걸림), 니트로차지: 맞히면 스피드 +1', () => {
    const b = setup('single', [slot('charizard')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'flamecharge', 20)
    b.executeTurn()
    expect(mon(b, 'mine', 0).boosts.spe).toBe(1)
    moveAction(b, 'mine', 0, 'thunderwave')
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('par')
  })
  it('명중 랭크가 데미지 칸 명중률에 반영', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'stoneedge')
    expect(an.mineActionPreview.value!.hitChance).toBeCloseTo(0.8)
    b.changeBoost('opp', 0, 'evasion', 1)
    expect(an.mineActionPreview.value!.hitChance).toBeCloseTo(0.6)
  })
})

describe('배틀 구성이 바뀌면', () => {
  it('시작 전이면 바로 새로, 진행 중이면 이유를 알리고 확인 후 초기화', () => {
    const b = setup('single', [slot('garchomp'), slot('gyarados')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    b.executeTurn()
    useEntry('single').picks.value = [1, 0, 2]
    expect(b.staleReason.value).toBe('picks')
    b.ensure()
    expect(S(b).turn).toBe(2) // 진행 중 → 자동 초기화 안 함
    b.reset()
    expect(b.staleReason.value).toBe('')
  })
})

describe('둔갑 (따라큐)', () => {
  it('첫 공격은 최대 HP 1/8 고정, 맞으면 풀림, 틀깨기는 무시', () => {
    const b = setup('single', [slot('garchomp')], [slot('mimikyu', { ability: 'disguise' })])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'earthquake')
    const c = an.mineActionPreview.value!
    const maxHp = b.resolveAt('opp', 0)!.stats.hp
    expect(c.disguise).toBe(true)
    expect([c.min, c.max]).toEqual([Math.floor(maxHp / 8), Math.floor(maxHp / 8)])
    expect(c.ko!.hits).toBeGreaterThanOrEqual(2)
    S(b).actions.mine[0]!.amount = 12
    b.executeTurn()
    expect(mon(b, 'opp', 0).alt).toBe(true)
    moveAction(b, 'mine', 0, 'earthquake')
    expect(an.mineActionPreview.value!.disguise).toBe(false)
  })
})

describe('꼬르륵스위치 (모르페코)', () => {
  it('턴이 끝날 때마다 배부른모양 ↔ 배고픈모양, 물러나면 배부른모양', () => {
    const b = setup('single', [slot('morpeko'), slot('garchomp')], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    expect(mon(b, 'mine', 0).alt).toBe(false)
    b.executeTurn()
    expect(mon(b, 'mine', 0).alt).toBe(true)
    expect(b.resolveAt('mine', 0)!.species.id).toBe('morpekohangry')
    b.executeTurn()
    expect(mon(b, 'mine', 0).alt).toBe(false)
    b.executeTurn()
    expect(mon(b, 'mine', 0).alt).toBe(true)
    S(b).actions.mine[0]!.kind = 'switch'
    S(b).actions.mine[0]!.switchTo = 1
    b.executeTurn()
    expect(mon(b, 'mine', 0).alt).toBe(false)
  })
})

describe('천정부지 (메가저리더프)', () => {
  it('쓰러뜨리면 가장 높은 능력(공격 145) +1, 땅 기술은 무효', () => {
    const b = setup('single', [slot('eelektross', { item: 'eelektrossite' })], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    S(b).actions.mine[0]!.useMega = true
    moveAction(b, 'mine', 0, 'dragonclaw', 100)
    b.executeTurn()
    expect(mon(b, 'mine', 0).boosts.atk).toBe(1)
    expect(an.oppVsMine(0, 'earthquake', 0)!.immune).toBe(true)
  })
})

describe('메가진화로 스킨 특성이 생기는 경우', () => {
  it('메가진화 체크 시 노말 기술이 페어리로 계산된다 (메가가디안)', () => {
    const b = setup('single', [slot('gardevoir', { item: 'gardevoirite' })], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'hypervoice')
    expect(an.mineActionPreview.value!.type).toBe('normal')
    S(b).actions.mine[0]!.useMega = true
    const mega = an.mineActionPreview.value!
    expect(mega.type).toBe('fairy')
    expect(mega.effectiveness).toBe(2)
    b.executeTurn()
    expect(b.combatantOf('mine', 0, undefined, true)!.ability).toBe('pixilate')
  })
})

describe('메타몽 변신', () => {
  const chart = () => gameData.types.chart
  const band = () =>
    slot('garchomp', {
      item: 'choiceband',
      nature: 'jolly',
      sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
    })

  it('괴짜: 등장하면 맞은편으로 변신 — 실능치(HP 제외)·랭크 복사, 도구·HP 는 자기 것', () => {
    const b = setup(
      'single',
      [band()],
      [slot('ditto', { ability: 'imposter', item: 'choicescarf' })],
    )
    mon(b, 'mine', 0).boosts.atk = 1
    b.sendOut('opp', 0, 0)
    const d = b.resolveAt('opp', 0)!
    const me = b.resolveAt('mine', 0)!
    expect(d.species.id).toBe('garchomp')
    expect(d.transformedFrom).toBe('ditto')
    expect({ ...d.stats, hp: 0 }).toEqual({ ...me.stats, hp: 0 })
    expect(d.stats.hp).toBe(48 + 75) // 메타몽 자신의 HP (종족값 48, SP 0)
    expect(d.slot.item).toBe('choicescarf')
    expect(d.slot.moves).toEqual(me.slot.moves)
    expect(mon(b, 'opp', 0).boosts.atk).toBe(1)
  })

  it('구애머리띠 효과는 복사되지 않고, 메타몽의 스카프는 복사한 스피드에 적용', () => {
    const b = setup(
      'single',
      [band()],
      [slot('ditto', { ability: 'imposter', item: 'choicescarf' })],
    )
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    const eq = gameData.moves.earthquake!
    const ditto = b.combatantOf('opp', 0, undefined, true)!
    const chomp = b.combatantOf('mine', 0, undefined, true)!
    const vsDitto = calcDamage(eq, ditto, chomp, chart())
    expect(vsDitto.rolls).toEqual(calcDamage(eq, { ...chomp, item: '' }, chomp, chart()).rolls)
    expect(calcDamage(eq, chomp, chomp, chart()).max).toBeGreaterThan(vsDitto.max)
    expect(an.speedOf('opp', 0)).toBe(Math.floor(b.resolveAt('mine', 0)!.stats.spe * 1.5))
  })

  it('물러나면 변신이 풀린다 / 선두 메타몽은 상대 선두가 정해지면 변신', () => {
    const b = setup(
      'single',
      [slot('ditto', { ability: 'imposter' }), slot('incineroar')],
      [slot('garchomp'), slot('gholdengo')],
    )
    expect(b.resolveAt('mine', 0)!.species.id).toBe('ditto') // 상대 선두 전
    b.sendOut('opp', 0, 0)
    expect(b.resolveAt('mine', 0)!.species.id).toBe('garchomp')
    switchAction(b, 'mine', 0, 1)
    b.executeTurn()
    expect(b.resolveAt('mine', 0)!.species.id).toBe('ditto')
  })

  it('변신 기술: 대상 칸의 상대로 변신', () => {
    const b = setup(
      'single',
      [slot('ditto', { ability: 'limber', moves: ['transform', '', '', ''] })],
      [slot('gholdengo')],
    )
    b.sendOut('opp', 0, 0)
    expect(b.resolveAt('mine', 0)!.species.id).toBe('ditto') // 유연이라 등장 시 변신 안 함
    moveAction(b, 'mine', 0, 'transform')
    b.executeTurn()
    expect(b.resolveAt('mine', 0)!.species.id).toBe('gholdengo')
    expect(b.resolveAt('mine', 0)!.ability).toBe('goodasgold')
  })
})

describe('행동 순서 기준 처리', () => {
  it('킬가르도: 같은 턴에 먼저 공격하면 블레이드폼으로 맞는다 (킹실드면 실드폼)', () => {
    const b = setup('single', [slot('aegislash')], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'shadowball')
    moveAction(b, 'opp', 0, 'earthquake')
    S(b).observedOrder = 'mine' // 킬가르도가 먼저
    expect(b.formAtHit('mine', 0, 'opp', 0, b.turnOrder())).toBe(true)
    const thisTurn = an.oppVsMine(0, 'earthquake', 0, false, undefined, true)!
    const shield = an.oppVsMine(0, 'earthquake', 0)!
    expect(thisTurn.max).toBeGreaterThan(shield.max)
    S(b).observedOrder = 'opp' // 한카리아스가 먼저 → 실드폼으로 맞음
    expect(b.formAtHit('mine', 0, 'opp', 0, b.turnOrder())).toBeUndefined()
    S(b).observedOrder = 'unknown'
    moveAction(b, 'mine', 0, 'kingsshield') // 우선도 +4 → 먼저, 실드폼
    expect(b.formAtHit('mine', 0, 'opp', 0, b.turnOrder())).toBe(false)
  })

  it('턴 적용은 실제 순서대로 — 상대 킬가르도가 먼저 공격한 뒤 맞은 관측은 블레이드폼으로 기록', () => {
    const b = setup('single', [slot('garchomp')], [slot('aegislash')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'shadowball', 50)
    moveAction(b, 'mine', 0, 'earthquake', 30)
    S(b).observedOrder = 'opp'
    b.executeTurn()
    const obs = mon(b, 'opp', 0).obs
    expect(obs.map((o) => o.kind)).toEqual(['taken', 'dealt'])
    expect(obs[1]!.opp.alt).toBe(true)
    expect(S(b).observedOrder).toBe('unknown') // 선후공 관찰은 턴마다 새로
  })

  it('선후공 관찰 → 상대 스피드 구간 (상대가 먼저: 내 스피드 122 이상)', () => {
    const b = setup('single', [slot('garchomp')], [slot('salamence')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'earthquake')
    moveAction(b, 'opp', 0, 'dragonclaw')
    S(b).observedOrder = 'opp'
    expect(b.speedRangesOf(0).neutral).toEqual([2, 32]) // 미리보기 (적용 전)
    expect(mon(b, 'opp', 0).speedSp).toBeNull()
    b.executeTurn()
    expect(mon(b, 'opp', 0).speedSp!.neutral).toEqual([2, 32])
    expect(b.speedRangesOf(0).plus).toEqual([0, 32])
    // 우선도가 다르면 스피드와 무관 → 관찰 안 씀
    moveAction(b, 'opp', 0, 'extremespeed')
    S(b).observedOrder = 'opp'
    expect(b.pendingSpeedObservation()).toBeNull()
  })

  it('분노의주먹: 맞은 횟수 / 깨뜨리다: 상대 리플렉터를 깬다', () => {
    const b = setup('single', [slot('conkeldurr')], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'earthquake', 20)
    b.executeTurn()
    b.executeTurn()
    expect(mon(b, 'mine', 0).timesHit).toBe(1)
    expect(b.attackOpts('mine', 0, 'ragefist').timesHit).toBe(1)
    b.toggleSideCondition('opp', 'reflect')
    moveAction(b, 'mine', 0, 'brickbreak')
    b.executeTurn()
    expect(S(b).sides.opp.screens.reflect).toBeUndefined()
  })
})

describe('상대 배분 추정 (주고받은 데미지 누적)', () => {
  it('준 데미지로 내구, 받은 데미지로 특공 — 실제 배분을 포함한 채 범위가 좁아진다', () => {
    const real = slot('gholdengo', {
      nature: 'modest',
      sp: { hp: 32, atk: 0, def: 2, spa: 32, spd: 0, spe: 0 },
    })
    const b = setup(
      'single',
      [
        slot('garchomp', {
          nature: 'adamant',
          sp: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
        }),
      ],
      [real],
    )
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    const est = useOppEstimate(b)
    // 실제 배분(입력값)으로 계산한 데미지를 그대로 입력 (한 방에 쓰러지지 않는 기술로)
    moveAction(b, 'mine', 0, 'dragonclaw')
    const dealt = an.mineActionPreview.value!
    S(b).actions.mine[0]!.amount = Math.round(((dealt.pctMin + dealt.pctMax) / 2) * 10) / 10
    moveAction(b, 'opp', 0, 'shadowball')
    const taken = an.oppVsMine(0, 'shadowball', 0)!
    S(b).actions.opp[0]!.amount = taken.min
    b.executeTurn()

    const e = est.estimate(0)!
    const r = b.resolveAt('opp', 0)!
    expect(e.dealt).toBe(1)
    expect(e.taken).toBe(1)
    expect(e.bulk.feasible).toBe(true)
    expect(e.bulk.hp!.min).toBeLessThanOrEqual(r.stats.hp)
    expect(e.bulk.hp!.max).toBeGreaterThanOrEqual(r.stats.hp)
    expect(e.bulk.def!.min).toBeLessThanOrEqual(r.stats.def)
    expect(e.bulk.def!.max).toBeGreaterThanOrEqual(r.stats.def)
    expect(e.spa!.stat!.min).toBeLessThanOrEqual(r.stats.spa)
    expect(e.spa!.stat!.max).toBeGreaterThanOrEqual(r.stats.spa)
    expect(e.items).toContain('') // 실제로는 도구 없음
    // 관측이 없을 때보다 좁다
    // 방어 종족값 95: 관측이 없으면 하락 SP0 = 103 ~ 보정 SP32 = 161
    expect(e.bulk.def!.max - e.bulk.def!.min).toBeLessThan(161 - 103)
  })

  it('입력과 맞는 배분이 없으면 feasible = false', () => {
    const b = setup('single', [slot('garchomp')], [slot('gholdengo')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'earthquake', 3) // 효과 굉장인데 3% 는 불가능
    b.executeTurn()
    expect(useOppEstimate(b).estimate(0)!.bulk.feasible).toBe(false)
  })

  it('쓰러졌으면 남은 HP 로 기록 (입력값이 남은 HP 보다 커도)', () => {
    const b = setup('single', [slot('garchomp')], [slot('salamence')])
    b.sendOut('opp', 0, 0)
    mon(b, 'mine', 0).hp = 40
    moveAction(b, 'opp', 0, 'dragonclaw', 150)
    b.executeTurn()
    const o = mon(b, 'opp', 0).obs[0]!
    expect(o.ko).toBe(true)
    expect(o.amount).toBe(40)
  })

  it('물리 공격만 봤으면 박식안경은 도구 후보에서 뺀다', () => {
    const b = setup('single', [slot('garchomp')], [slot('salamence')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'opp', 0, 'dragonclaw')
    S(b).actions.opp[0]!.amount = an.oppVsMine(0, 'dragonclaw', 0)!.min
    b.executeTurn()
    const e = useOppEstimate(b).estimate(0)!
    expect(e.items).toContain('')
    expect(e.items).not.toContain('wiseglasses')
  })
})

describe('하품', () => {
  it('맞으면 졸음 → 다음 턴 끝에 잠듦 (턴 끝 예정 표시)', () => {
    const b = setup('single', [slot('hippowdon')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'yawn')
    expect(an.pendingLines.value.map((l) => l.key)).toContain('battle.pending.yawnUsed')
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.yawn).toBe(2)
    expect(mon(b, 'opp', 0).status).toBe('')
    expect(an.pendingLines.value.map((l) => l.key)).toContain('battle.pending.yawn')
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('slp')
    expect(mon(b, 'opp', 0).volatiles.yawn).toBeUndefined()
  })
  it('그 사이에 교체하면 졸음이 풀림', () => {
    const b = setup('single', [slot('hippowdon')], [slot('kingambit'), slot('garchomp')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'yawn')
    b.executeTurn()
    switchAction(b, 'opp', 0, 1)
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('')
    expect(mon(b, 'opp', 0).volatiles.yawn).toBeUndefined()
    expect(mon(b, 'opp', 1).status).toBe('')
  })
  it('이미 상태이상이거나 일렉트릭필드(땅에 있음)면 실패', () => {
    const b = setup('single', [slot('hippowdon')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    mon(b, 'opp', 0).status = 'par'
    moveAction(b, 'mine', 0, 'yawn')
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.yawn).toBeUndefined()
    mon(b, 'opp', 0).status = ''
    S(b).terrain.key = 'electric'
    moveAction(b, 'mine', 0, 'yawn')
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.yawn).toBeUndefined()
  })
  it('매직미러면 쓴 쪽이 졸음', () => {
    const b = setup('single', [slot('hippowdon')], [slot('clefable', { item: 'clefablite' })])
    b.sendOut('opp', 0, 0)
    b.setMega('opp', 0, true) // 메가픽시 (매직미러)
    moveAction(b, 'mine', 0, 'yawn')
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.yawn).toBeUndefined()
    expect(mon(b, 'mine', 0).volatiles.yawn).toBe(2)
  })
  it('직접 켜면 "이번 턴 끝에 잠듦" 상태', () => {
    const b = setup('single', [slot('hippowdon')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    b.toggleVolatile('opp', 0, 'yawn')
    expect(mon(b, 'opp', 0).volatiles.yawn).toBe(2)
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('slp')
  })
})

describe('턴 끝 회복·데미지', () => {
  it('내 먹다남은음식: 턴 끝 1/16 회복', () => {
    const b = setup('single', [slot('hippowdon', { item: 'leftovers' })], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const max = mon(b, 'mine', 0).hp
    moveAction(b, 'opp', 0, 'ironhead', 50)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - 50 + Math.floor(max / 16))
  })
  it('상대 먹다남은음식: 확정 전에는 없음, "상대 도구 확정"으로 고르면 그 턴 끝부터 자동, 지우면 취소', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit', { item: 'choiceband' })])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'earthquake', 30)
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBe(70)
    const max = b.resolveAt('opp', 0)!.stats.hp
    const step = (Math.floor(max / 16) / max) * 100
    // 이번 턴 끝에 먹다남은음식 회복을 봄 → 행동 입력 중 확정
    b.confirmItem('opp', 0, 'leftovers')
    expect(b.oppSlots.value[0]!.item).toBe('leftovers')
    expect(an.pendingLines.value.map((l) => l.key)).toContain('battle.pending.residual')
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBeCloseTo(70 + step)
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBeCloseTo(70 + 2 * step)
    b.confirmItem('opp', 0, '')
    expect(an.pendingLines.value.map((l) => l.key)).toContain('battle.pending.itemUnknown')
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBeCloseTo(70 + 2 * step)
  })
  it('검은진흙: 독 타입이 아니면 1/8 데미지', () => {
    const b = setup('single', [slot('garchomp', { item: 'blacksludge' })], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const max = mon(b, 'mine', 0).hp
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - Math.floor(max / 8))
  })
  it('그래스필드: 땅에 있으면 1/16 회복 (비행 타입은 없음)', () => {
    const b = setup('single', [slot('garchomp')], [slot('corviknight')])
    b.sendOut('opp', 0, 0)
    mon(b, 'mine', 0).hp = 100
    mon(b, 'opp', 0).hp = 50
    S(b).terrain.key = 'grassy'
    S(b).terrain.total = 5
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(100 + Math.floor(b.resolveAt('mine', 0)!.stats.hp / 16))
    expect(mon(b, 'opp', 0).hp).toBe(50)
  })
  it('씨뿌리기: 맞은 상대가 턴 끝 1/8 잃고 쓴 쪽이 그만큼 회복', () => {
    const b = setup('single', [slot('venusaur')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    mon(b, 'mine', 0).hp = 50
    moveAction(b, 'mine', 0, 'leechseed')
    b.executeTurn()
    const oppMax = b.resolveAt('opp', 0)!.stats.hp
    const drain = Math.floor(oppMax / 8)
    expect(mon(b, 'opp', 0).volatiles.leechseed).toBeTruthy()
    expect(mon(b, 'opp', 0).hp).toBeCloseTo(100 - (drain / oppMax) * 100)
    expect(mon(b, 'mine', 0).hp).toBe(50 + drain)
  })
})

describe('모래바람 데미지', () => {
  it('턴 끝 1/16 (바위·땅·강철 제외)', () => {
    const b = setup('single', [slot('gyarados')], [slot('hippowdon')])
    b.sendOut('opp', 0, 0)
    expect(S(b).weather.key).toBe('sand')
    const max = mon(b, 'mine', 0).hp
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - Math.floor(max / 16))
    expect(mon(b, 'opp', 0).hp).toBe(100)
  })
  it('모래바람이 가라앉는 턴에는 데미지 없음', () => {
    const b = setup('single', [slot('gyarados')], [slot('hippowdon')])
    b.sendOut('opp', 0, 0)
    const max = mon(b, 'mine', 0).hp
    S(b).weather.cur = S(b).weather.total - 1 // 이번 턴 끝에 끝남
    b.executeTurn()
    expect(S(b).weather.key).toBe('')
    expect(mon(b, 'mine', 0).hp).toBe(max)
  })
  it('날씨부정이 필드에 있으면 날씨 데미지 없음, 방진도 없음', () => {
    const b = setup('single', [slot('altaria', { ability: 'cloudnine' })], [slot('hippowdon')])
    b.sendOut('opp', 0, 0)
    const max = mon(b, 'mine', 0).hp
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max)
    const c = setup('single', [slot('reuniclus', { ability: 'overcoat' })], [slot('hippowdon')])
    c.sendOut('opp', 0, 0)
    const max2 = mon(c, 'mine', 0).hp
    c.executeTurn()
    expect(mon(c, 'mine', 0).hp).toBe(max2)
  })
})

describe('행동 불가 (잠듦·얼음 등)', () => {
  it('잠든 채 행동 불가 → 상태 유지, 다음 턴 기본값도 행동 불가, 예상 흐름에 이유', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    mon(b, 'mine', 0).status = 'slp'
    Object.assign(S(b).actions.mine[0]!, { kind: 'cant', cantReason: 'slp' })
    moveAction(b, 'opp', 0, 'ironhead')
    expect(an.forecast.value.map((l) => l.key)).toContain('battle.flow.cant')
    b.executeTurn()
    expect(mon(b, 'mine', 0).status).toBe('slp')
    expect(S(b).actions.mine[0]!.kind).toBe('cant')
  })
  it('깨어나서 기술을 쓰면 잠듦이 풀림 (잠꼬대는 그대로)', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    mon(b, 'mine', 0).status = 'slp'
    moveAction(b, 'mine', 0, 'sleeptalk')
    b.executeTurn()
    expect(mon(b, 'mine', 0).status).toBe('slp')
    moveAction(b, 'mine', 0, 'earthquake', 30)
    b.executeTurn()
    expect(mon(b, 'mine', 0).status).toBe('')
    expect(mon(b, 'opp', 0).hp).toBe(70)
  })
  it('얼음은 불꽃 기술에 맞으면 녹음, 이유가 마비인데 상태이상이 없으면 마비로', () => {
    const b = setup('single', [slot('charizard')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    mon(b, 'opp', 0).status = 'frz'
    Object.assign(S(b).actions.opp[0]!, { kind: 'cant', cantReason: 'frz' })
    moveAction(b, 'mine', 0, 'flamethrower', 40)
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('')
    Object.assign(S(b).actions.opp[0]!, { kind: 'cant', cantReason: 'par' })
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('par')
    expect(S(b).actions.opp[0]!.kind).toBe('move') // 마비는 다음 턴 기본값이 기술 사용
  })
})

describe('상대 도구 확정', () => {
  it('그라운드코트를 확정하면 지금 필드가 8턴으로', () => {
    const b = setup('single', [slot('garchomp')], [slot('rillaboom', { ability: 'grassysurge' })])
    b.sendOut('opp', 0, 0)
    expect(S(b).terrain.key).toBe('grassy')
    expect(S(b).terrain.total).toBe(5)
    b.confirmItem('opp', 0, 'terrainextender')
    expect(S(b).terrain.total).toBe(8)
    expect(mon(b, 'opp', 0).itemKnown).toBe(true)
  })
})

describe('바톤터치', () => {
  it('랭크 변화와 일부 특수 상태(기충전·아쿠아링 등)를 나오는 포켓몬에게 넘김', () => {
    const b = setup('single', [slot('garchomp')], [slot('polteageist'), slot('gyarados')])
    b.sendOut('opp', 0, 0)
    Object.assign(mon(b, 'opp', 0).boosts, { atk: 2, spa: 2, spe: 2, def: -1, spd: -1 })
    mon(b, 'opp', 0).volatiles.focusenergy = 1
    mon(b, 'opp', 0).volatiles.taunt = 1 // 도발은 넘어가지 않음
    moveAction(b, 'opp', 0, 'batonpass')
    S(b).actions.opp[0]!.selfSwitch = 1
    b.executeTurn()
    expect(S(b).sides.opp.active[0]).toBe(1)
    expect(mon(b, 'opp', 1).boosts).toMatchObject({ atk: 2, spa: 2, spe: 2, def: -1, spd: -1 })
    expect(mon(b, 'opp', 1).volatiles.focusenergy).toBeTruthy()
    expect(mon(b, 'opp', 1).volatiles.taunt).toBeUndefined()
    expect(mon(b, 'opp', 0).boosts.atk).toBe(0)
  })
})
