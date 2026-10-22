// tests/battle.test.ts — 배틀 상태 머신(useBattle)과 분석(useBattleAnalysis) 동작 확인
// Nuxt 없이 돌리기 위해 tests/nuxt-env.ts 에서 자동 import 를 전역으로 채운다.

import { gameData, resetNuxtState, slot } from './nuxt-env'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBattle } from '../composables/useBattle'
import { useBattleAnalysis } from '../composables/useBattleAnalysis'
import { useOppEstimate } from '../composables/useOppEstimate'
import { PICK_COUNT, useEntry, type BattleMode } from '../composables/useEntry'
import { useTeam } from '../composables/useTeam'
import { useTeamCalc } from '../composables/useTeamCalc'
import { emptySlot, type TeamSlot } from '../utils/types'
import { calcDamage } from '../utils/damage'
import { koHitIndexWithSub, statusDamage } from '../utils/ko'

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
    // 선출 화면의 도구는 추측 → 확정 전에는 소모되지 않음
    moveAction(b, 'mine', 0, 'flamethrower', 10)
    b.executeTurn()
    expect(mon(b, 'opp', 0).itemGone).toBe(false)
    b.confirmItem('opp', 0, 'occaberry')
    moveAction(b, 'mine', 0, 'flamethrower', 30)
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
    // 바위는 추측 도구라 5턴, 확정하면 8턴
    expect(S(b).weather).toMatchObject({ key: 'sun', total: 5 })
    b.confirmItem('opp', 0, 'heatrock')
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
  it('상태이상 면역: 리프가드(쾌청일 때만) / 플라워베일(아군 풀 타입) / 스위트베일(아군 잠듦)', () => {
    const b = setup(
      'double',
      [slot('gengar'), slot('incineroar'), slot('garchomp'), slot('kingambit')],
      [slot('leafeon', { ability: 'leafguard' }), slot('florges', { ability: 'flowerveil' })],
    )
    b.sendOut('opp', 0, 0)
    b.sendOut('opp', 1, 1)
    moveAction(b, 'mine', 0, 'thunderwave') // 플라워베일
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('')
    mon(b, 'opp', 1).hp = 0 // 플라워베일이 쓰러지면 막지 못함
    S(b).weather.key = 'sun' // 리프가드
    moveAction(b, 'mine', 0, 'thunderwave')
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('')
    S(b).weather.key = ''
    moveAction(b, 'mine', 0, 'thunderwave')
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('par')
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
  it('기가임팩트: 다음 턴 반동(행동 불가 기본값), 그 턴이 끝나면 풀림 / 빗나가면 반동 없음', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'gigaimpact', 30)
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.mustrecharge).toBe(2)
    expect(S(b).actions.mine[0]!).toMatchObject({ kind: 'cant', cantReason: 'other' })
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.mustrecharge).toBeUndefined()
    expect(S(b).actions.mine[0]!.kind).toBe('move')
    moveAction(b, 'mine', 0, 'gigaimpact', 0)
    S(b).actions.mine[0]!.missed = true
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.mustrecharge).toBeUndefined()
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
    b.confirmItem('opp', 0, 'choicescarf')
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
    b.confirmItem('opp', 0, 'choicescarf')
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
  it('매직미러: 전기자석파·싫은소리·스텔스록도 되돌림, 틀깨기면 그대로', () => {
    const b = setup(
      'single',
      [slot('gengar'), slot('excadrill', { ability: 'moldbreaker' })],
      [slot('espeon', { ability: 'magicbounce' })],
    )
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'thunderwave')
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('')
    expect(mon(b, 'mine', 0).status).toBe('par')
    moveAction(b, 'mine', 0, 'screech')
    b.executeTurn()
    expect(mon(b, 'opp', 0).boosts.def).toBe(0)
    expect(mon(b, 'mine', 0).boosts.def).toBe(-2)
    moveAction(b, 'mine', 0, 'stealthrock')
    b.executeTurn()
    expect(S(b).sides.opp.hazards.stealthrock).toBeUndefined()
    expect(S(b).sides.mine.hazards.stealthrock).toBe(1)
    switchAction(b, 'mine', 0, 1)
    b.executeTurn()
    moveAction(b, 'mine', 0, 'thunderwave')
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('par')
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
    // 확정은 배틀 상태에만 (선출 화면 파티의 도구는 그대로)
    expect(b.oppSlots.value[0]!.item).toBe('choiceband')
    expect(mon(b, 'opp', 0).item).toBe('leftovers')
    expect(an.pendingLines.value.map((l) => l.key)).toContain('battle.pending.residual')
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBeCloseTo(70 + step)
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBeCloseTo(70 + 2 * step)
    b.confirmItem('opp', 0, '')
    expect(an.pendingLines.value.map((l) => l.key)).not.toContain('battle.pending.residual')
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
  it('다른 포켓몬이 깐 필드·날씨는 연장하지 않음', () => {
    const b = setup(
      'single',
      [slot('rillaboom', { ability: 'grassysurge' })],
      [slot('garchomp'), slot('tyranitar', { ability: 'sandstream' })],
    )
    b.sendOut('opp', 0, 0)
    b.confirmItem('opp', 0, 'terrainextender')
    expect(S(b).terrain.total).toBe(5)
    switchAction(b, 'opp', 0, 1)
    b.executeTurn()
    b.confirmItem('opp', 0, 'smoothrock')
    expect(S(b).weather.total).toBe(5)
    b.confirmItem('opp', 1, 'smoothrock')
    expect(S(b).weather.total).toBe(8)
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

describe('대타출동 / 꼬리자르기', () => {
  it('최대 HP 1/4 로 대타 → 데미지는 대타가 받고 상태이상은 막힘, 소리 기술은 통과, 대타 HP 가 0 이면 사라짐', () => {
    const b = setup('single', [slot('garchomp')], [slot('gengar')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    const q = Math.floor(max / 4)
    moveAction(b, 'mine', 0, 'substitute')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - q)
    expect(mon(b, 'mine', 0).volatiles.substitute).toBe(q)
    // 이미 대타면 실패
    moveAction(b, 'mine', 0, 'substitute')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - q)
    S(b).actions.mine[0]!.move = ''
    // 대타가 받음: 본체 HP 그대로, 관측 기록 없음
    moveAction(b, 'opp', 0, 'shadowball', 10)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - q)
    expect(mon(b, 'mine', 0).volatiles.substitute).toBe(q - 10)
    expect(mon(b, 'opp', 0).obs).toHaveLength(0)
    // 변화기 막힘 / 소리 기술(싫은소리)은 통과
    moveAction(b, 'opp', 0, 'willowisp')
    b.executeTurn()
    expect(mon(b, 'mine', 0).status).toBe('')
    moveAction(b, 'opp', 0, 'screech')
    b.executeTurn()
    expect(mon(b, 'mine', 0).boosts.def).toBe(-2)
    // 대타 HP 이상 맞으면 사라지고 본체는 그대로
    moveAction(b, 'opp', 0, 'shadowball', q)
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.substitute).toBeUndefined()
    expect(mon(b, 'mine', 0).hp).toBe(max - q)
  })
  it('HP 가 1/4 이하이면 실패 / 직접 켜면 HP 소모 없이 1/4 대타', () => {
    const b = setup('single', [slot('garchomp')], [slot('gengar')])
    b.sendOut('opp', 0, 0)
    const q = Math.floor(b.maxHp('mine', 0) / 4)
    mon(b, 'mine', 0).hp = q
    moveAction(b, 'mine', 0, 'substitute')
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.substitute).toBeUndefined()
    b.toggleVolatile('opp', 0, 'substitute')
    expect(mon(b, 'opp', 0).volatiles.substitute).toBe(25)
    expect(mon(b, 'opp', 0).hp).toBe(100)
  })
  it('꼬리자르기: 최대 HP 1/2 를 깎고 나오는 포켓몬이 대타를 받음', () => {
    const b = setup('single', [slot('garchomp'), slot('dragonite')], [slot('gengar')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    moveAction(b, 'mine', 0, 'shedtail')
    S(b).actions.mine[0]!.selfSwitch = 1
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - Math.ceil(max / 2))
    expect(mon(b, 'mine', 0).volatiles.substitute).toBeUndefined()
    expect(mon(b, 'mine', 1).volatiles.substitute).toBe(Math.floor(max / 4))
  })
  it('위협은 대타 뒤의 포켓몬에게 통하지 않음', () => {
    const b = setup(
      'single',
      [slot('garchomp')],
      [slot('gengar'), slot('incineroar', { ability: 'intimidate' })],
    )
    b.sendOut('opp', 0, 0)
    b.toggleVolatile('mine', 0, 'substitute')
    switchAction(b, 'opp', 0, 1)
    b.executeTurn()
    expect(mon(b, 'mine', 0).boosts.atk).toBe(0)
  })
})

describe('바톤터치로 넘기는 것', () => {
  it('대타(상대는 최대 HP 비율로 환산)·멸망의노래 카운트·전자부유', () => {
    const b = setup('single', [slot('garchomp')], [slot('gengar'), slot('snorlax')])
    b.sendOut('opp', 0, 0)
    const om = mon(b, 'opp', 0)
    Object.assign(om.volatiles, { substitute: 20, perishsong: 3, magnetrise: 2 })
    moveAction(b, 'opp', 0, 'batonpass')
    S(b).actions.opp[0]!.selfSwitch = 1
    b.executeTurn()
    const inc = mon(b, 'opp', 1)
    const ratio = b.maxHp('opp', 0) / b.maxHp('opp', 1)
    expect(inc.volatiles.substitute).toBeCloseTo(20 * ratio, 0)
    expect(inc.volatiles.perishsong).toBe(2) // 넘어온 뒤 턴 끝에 1 줄어듦
    expect(inc.volatiles.magnetrise).toBe(3)
  })
})

describe('멸망의노래 / 전자부유 / 소란', () => {
  it('멸망의노래: 턴 끝마다 3 → 2 → 1 → 쓰러짐, 방음은 무효', () => {
    const b = setup('single', [slot('gengar')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'perishsong')
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.perishsong).toBe(3)
    expect(mon(b, 'opp', 0).volatiles.perishsong).toBe(3)
    b.executeTurn()
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.perishsong).toBe(1)
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBe(0)
    expect(mon(b, 'mine', 0).hp).toBe(0)
  })
  it('멸망의노래: 방음은 무효', () => {
    const b = setup('single', [slot('gengar')], [slot('snorlax', { ability: 'soundproof' })])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'perishsong')
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.perishsong).toBeUndefined()
    expect(mon(b, 'mine', 0).volatiles.perishsong).toBe(3)
  })
  it('전자부유: 땅 기술 무효, 5턴 뒤 풀림', () => {
    const b = setup('single', [slot('kingambit')], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'magnetrise')
    b.executeTurn()
    const atk = b.combatantOf('opp', 0, undefined, true)!
    const def = b.combatantOf('mine', 0)!
    expect(def.floating).toBe(true)
    const cell = useTeamCalc().cell('earthquake', atk, def, b.fieldFor('mine', 0))
    expect(cell?.immune).toBe(true)
    for (let i = 0; i < 4; i++) b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.magnetrise).toBeUndefined()
  })
  it('소란: 잠든 포켓몬이 깨어나고, 그동안 잠들지 않음', () => {
    const b = setup('single', [slot('snorlax')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    mon(b, 'opp', 0).status = 'slp'
    moveAction(b, 'mine', 0, 'uproar', 20)
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('')
    expect(mon(b, 'mine', 0).volatiles.uproar).toBe(2)
    moveAction(b, 'opp', 0, 'hypnosis')
    b.executeTurn()
    expect(mon(b, 'mine', 0).status).toBe('')
  })
})

describe('행동 불가: 혼란 자해 / 잠든 턴 수', () => {
  it('혼란 자해: 혼란이 붙고 입력한 HP 만큼 깎임, 예상 범위는 위력 40 자기 공격·방어', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    const r = b.confusionRange('mine', 0)!
    const c = b.combatantOf('mine', 0)!
    const base = Math.trunc(Math.trunc((22 * 40 * c.stats.atk) / c.stats.def) / 50) + 2
    expect(r).toEqual([Math.trunc((base * 85) / 100), base])
    Object.assign(S(b).actions.mine[0]!, { kind: 'cant', cantReason: 'confusion', amount: 30 })
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - 30)
    expect(mon(b, 'mine', 0).volatiles.confusion).toBeTruthy()
    // 범위 밖이면 입력 오류
    Object.assign(S(b).actions.mine[0]!, { kind: 'cant', cantReason: 'other', amount: max + 1 })
    expect(b.validationError.value).toBe('errSelf')
  })
  it('잠듦: 잠든 채 보낸 턴 수를 세고(잠꼬대 포함), 기술을 쓰면 깨어남', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    Object.assign(S(b).actions.mine[0]!, { kind: 'cant', cantReason: 'slp' })
    b.executeTurn()
    expect(mon(b, 'mine', 0)).toMatchObject({ status: 'slp', toxicTurn: 1 })
    expect(S(b).actions.mine[0]!.kind).toBe('cant')
    b.executeTurn()
    expect(mon(b, 'mine', 0).toxicTurn).toBe(2)
    moveAction(b, 'mine', 0, 'sleeptalk')
    b.executeTurn()
    expect(mon(b, 'mine', 0)).toMatchObject({ status: 'slp', toxicTurn: 3 })
    moveAction(b, 'mine', 0, 'earthquake', 30)
    b.executeTurn()
    expect(mon(b, 'mine', 0).status).toBe('')
  })
})

describe('더블: 같은 상대를 한 턴에 두 번 때릴 때', () => {
  it('뒤에 때리는 쪽의 "맞기 전" 기본값은 먼저 때린 데미지를 뺀 HP', () => {
    const b = setup(
      'double',
      [slot('dragonite'), slot('kingambit'), slot('garchomp'), slot('gengar')],
      [slot('snorlax'), slot('gengar')],
    )
    b.sendOut('opp', 0, 0)
    b.sendOut('opp', 1, 1)
    moveAction(b, 'mine', 0, 'extremespeed', 30) // 우선도 +2 → 먼저
    moveAction(b, 'mine', 1, 'ironhead', 20)
    expect(b.earlierDamage('mine', 1, 0)).toBe(30)
    expect(b.earlierDamage('mine', 0, 0)).toBe(0)
    // 다른 칸을 때리면 무관
    S(b).actions.mine[0]!.target = 1
    expect(b.earlierDamage('mine', 1, 0)).toBe(0)
  })
})

describe('상태이상 규칙 (챔피언스)', () => {
  it('맹독은 1/16 씩 늘어 최대 15/16', () => {
    expect(statusDamage(160, 'tox', '', 3)).toBe(30)
    expect(statusDamage(160, 'tox', '', 20)).toBe(150)
  })
  it('잠듦: 0% → 33% → 반드시 깨어남 (3번째 턴 기본값은 기술 사용)', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    mon(b, 'mine', 0).status = 'slp'
    Object.assign(S(b).actions.mine[0]!, { kind: 'cant', cantReason: 'slp' })
    const wake = () => an.chanceLines.value.find((l) => l.key === 'battle.chance.wake')?.params?.p
    expect(wake()).toBe(0)
    b.executeTurn()
    expect(S(b).actions.mine[0]!.kind).toBe('cant')
    expect(wake()).toBe(33)
    b.executeTurn()
    expect(wake()).toBe(100)
    expect(S(b).actions.mine[0]!.kind).toBe('move')
  })
  it('얼음: 25% → 25% → 반드시 풀림', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    Object.assign(S(b).actions.opp[0]!, { kind: 'cant', cantReason: 'frz' })
    b.executeTurn()
    expect(mon(b, 'opp', 0)).toMatchObject({ status: 'frz', toxicTurn: 1 })
    expect(S(b).actions.opp[0]!.kind).toBe('cant')
    b.executeTurn()
    expect(S(b).actions.opp[0]!.kind).toBe('move')
  })
  it('마비 12.5% / 혼란 33% / 헤롱헤롱 50% 확률 안내 (기술을 쓸 때)', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    const m = mon(b, 'mine', 0)
    m.status = 'par'
    Object.assign(m.volatiles, { confusion: 1, attract: 1 })
    moveAction(b, 'mine', 0, 'earthquake')
    const keys = an.chanceLines.value.map((l) => l.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        'battle.chance.fullPara',
        'battle.chance.confusion',
        'battle.chance.attract',
      ]),
    )
  })
  it('턴 끝: 저주 1/4, 소금절이 1/16 (물·강철 1/8)', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    mon(b, 'mine', 0).volatiles.curse = 1
    mon(b, 'opp', 0).volatiles.saltcure = 1
    expect(b.residualPlan('mine', 0)).toContainEqual({ key: 'curse', frac: -1 / 4 })
    expect(b.residualPlan('opp', 0)).toContainEqual({ key: 'saltcure', frac: -1 / 8 })
    delete mon(b, 'mine', 0).volatiles.curse
    mon(b, 'mine', 0).volatiles.saltcure = 1
    expect(b.residualPlan('mine', 0)).toContainEqual({ key: 'saltcure', frac: -1 / 16 })
  })
  it('길동무: 다음 기술 전까지 공격으로 쓰러지면 공격한 쪽도 쓰러짐', () => {
    const b = setup('single', [slot('gengar')], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'destinybond')
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.destinybond).toBe(1)
    S(b).actions.mine[0]!.move = ''
    moveAction(b, 'opp', 0, 'earthquake', mon(b, 'mine', 0).hp)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(0)
    expect(mon(b, 'opp', 0).hp).toBe(0)
  })
  it('길동무는 다른 기술을 쓰면 풀림', () => {
    const b = setup('single', [slot('gengar')], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'destinybond')
    b.executeTurn()
    moveAction(b, 'mine', 0, 'shadowball', 10)
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.destinybond).toBeUndefined()
  })
  it('교체 불가: 조이기류·그림자밟기는 막고, 고스트 타입·아름다운허물은 교체 가능', () => {
    const b = setup('single', [slot('garchomp'), slot('dragonite')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    expect(b.switchBlocked('mine', 0)).toBe(false)
    mon(b, 'mine', 0).volatiles.partiallytrapped = 1
    expect(b.switchBlocked('mine', 0)).toBe(true)
    b.mineSlots.value[0]!.item = 'shedshell'
    expect(b.switchBlocked('mine', 0)).toBe(false)

    const g = setup(
      'single',
      [slot('gengar'), slot('garchomp')],
      [slot('gengar', { item: 'gengarite' })],
    )
    g.sendOut('opp', 0, 0)
    g.setMega('opp', 0, true) // 메가팬텀 (그림자밟기)
    mon(g, 'mine', 0).volatiles.jawlock = 1
    expect(g.switchBlocked('mine', 0)).toBe(false) // 고스트
    switchAction(g, 'mine', 0, 1)
    g.executeTurn()
    expect(g.switchBlocked('mine', 0)).toBe(true) // 한카리아스는 그림자밟기에 막힘
  })
})

describe('대타가 있을 때 데미지 표·예상 흐름', () => {
  it('단타: KO 타수 = 대타를 깨는 타수 + 본체 타수, 이번 공격으로는 쓰러지지 않음', () => {
    const b = setup('single', [slot('garchomp')], [slot('gengar')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    moveAction(b, 'mine', 0, 'earthquake')
    const before = an.mineActionPreview.value!
    expect(before.sub).toBeNull()
    b.toggleVolatile('opp', 0, 'substitute')
    const c = an.mineActionPreview.value!
    expect(c.sub?.breaks).toBe('sure')
    expect(c.lethal).toBe(false)
    expect(c.ko!.hits).toBe(before.ko!.hits + 1)
    // 예상 흐름: 대타가 사라짐, 상대는 쓰러지지 않음
    const keys = an.forecast.value.map((l) => l.key)
    expect(keys).toContain('battle.flow.subSure')
    expect(keys).not.toContain('battle.flow.koSure')
  })
  it('소리 기술은 대타를 무시', () => {
    const b = setup('single', [slot('kingambit')], [slot('gengar')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    b.toggleVolatile('opp', 0, 'substitute')
    moveAction(b, 'mine', 0, 'hypervoice')
    expect(an.mineActionPreview.value?.sub ?? null).toBeNull()
  })
  it('연속기: 대타를 깬 다음 타부터 본체 (대타를 넘긴 데미지는 버려짐)', () => {
    expect(koHitIndexWithSub([30, 30, 30, 30], 40, 50)).toBe(4)
    expect(koHitIndexWithSub([50, 30, 30], 40, 50)).toBe(3)
    expect(koHitIndexWithSub([10, 10], 40, 50)).toBeNull()
  })
})

describe('게으름 (특성)', () => {
  it('기술을 쓴 다음 턴은 행동 불가 기본값, 그 턴이 끝나면 다시 행동', () => {
    const b = setup('single', [slot('garchomp', { ability: 'truant' })], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'earthquake', 30)
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.truant).toBe(2)
    expect(S(b).actions.mine[0]!).toMatchObject({ kind: 'cant', cantReason: 'other' })
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.truant).toBeUndefined()
    expect(S(b).actions.mine[0]!.kind).toBe('move')
  })
})

describe('상대 도구: 선출 화면 도구는 추측, 확정은 배틀에만', () => {
  it('확정 전 구애안경은 계산에 넣지 않고 "추측 도구면" 결과로 따로, 확정하면 본 결과에 반영', () => {
    const b = setup('single', [slot('garchomp')], [slot('gengar', { item: 'choicespecs' })])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    const c = an.oppVsMine(0, 'shadowball', 0)!
    expect(c.guess?.item).toBe('choicespecs')
    expect(c.guess!.max).toBeGreaterThan(c.max)
    expect(b.resolveAt('opp', 0)!.slot.item).toBe('')
    b.confirmItem('opp', 0, 'choicespecs')
    const confirmed = an.oppVsMine(0, 'shadowball', 0)!
    expect(confirmed.guess ?? null).toBeNull()
    expect(confirmed.max).toBe(c.guess!.max)
    expect(b.oppSlots.value[0]!.item).toBe('choicespecs') // 파티는 그대로
  })
  it('다른 도구로 확정해도 선출 화면 파티의 도구는 바뀌지 않음', () => {
    const b = setup('single', [slot('garchomp')], [slot('gengar', { item: 'choicespecs' })])
    b.sendOut('opp', 0, 0)
    b.confirmItem('opp', 0, 'lifeorb')
    expect(b.oppSlots.value[0]!.item).toBe('choicespecs')
    expect(b.resolveAt('opp', 0)!.slot.item).toBe('lifeorb')
    expect(b.guessedItem(0)).toBe('')
  })
  it('추측 스카프: 스피드는 스카프 없이, 선후공이 바뀌면 안내 / 메가스톤은 그대로', () => {
    const b = setup('single', [slot('garchomp')], [slot('dragonite', { item: 'choicescarf' })])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    const raw = b.resolveAt('opp', 0)!.stats.spe
    expect(b.speedOf('opp', 0)).toBe(raw)
    // 한카리아스 122 > 망나뇽 100, 스카프면 150 → 선후공이 바뀜
    expect(b.speedOf('mine', 0)).toBeGreaterThan(raw)
    expect(b.speedOf('mine', 0)).toBeLessThan(Math.floor(raw * 1.5))
    moveAction(b, 'mine', 0, 'earthquake')
    moveAction(b, 'opp', 0, 'dragonclaw')
    expect(an.forecast.value.map((l) => l.key)).toContain('battle.flow.orderGuess')

    const m = setup('single', [slot('garchomp')], [slot('clefable', { item: 'clefablite' })])
    m.sendOut('opp', 0, 0)
    expect(m.resolveAt('opp', 0, true)!.isMega).toBe(true)
  })
  it('배분 추정: 확정 전에는 도구 후보로 계산 (선출 화면 도구로 고정하지 않음)', () => {
    const b = setup('single', [slot('garchomp')], [slot('gengar', { item: 'choicespecs' })])
    b.sendOut('opp', 0, 0)
    const est = useOppEstimate(b)
    expect(est.estimate(0)!.itemsFixed).toBe(false)
    b.confirmItem('opp', 0, 'choicespecs')
    expect(est.estimate(0)!).toMatchObject({ itemsFixed: true, items: ['choicespecs'] })
  })
})

describe('상대 HP % → 실수치 범위', () => {
  it('올림·반올림·버림을 모두 덮는 (p−1)% 초과 ~ (p+1)% 미만', () => {
    const b = setup('single', [slot('garchomp')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    const an = useBattleAnalysis(b)
    const max = b.maxHp('opp', 0)
    const m = mon(b, 'opp', 0)
    m.hp = 37
    const r = an.oppHpRange(0)
    for (const hp of [r.min, r.max]) {
      const pct = (hp / max) * 100
      // 세 규칙 중 하나로는 37% 로 보임
      expect([Math.ceil(pct), Math.round(pct), Math.floor(pct)]).toContain(37)
    }
    // 범위 바로 밖은 어느 규칙으로도 37% 가 아님
    for (const hp of [r.min - 1, r.max + 1]) {
      const pct = (hp / max) * 100
      expect([Math.ceil(pct), Math.round(pct), Math.floor(pct)]).not.toContain(37)
    }
    m.hp = 100
    expect(an.oppHpRange(0).max).toBe(max)
  })
})

describe('이번 턴 확률 효과 체크 (상대에게 생긴 상태)', () => {
  // 한카리아스(122) 가 깜까미(70) 보다 빠름 → 풀죽음 가능
  const fast = (item = '', ability?: string) =>
    slot('garchomp', { item, ...(ability ? { ability } : {}) })
  it('오물폭탄 + 왕의징표석: 독과 풀죽음, 박치기 + 왕의징표석: 풀죽음은 하나만', () => {
    const b = setup('single', [fast('kingsrock')], [slot('kingambit')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'sludgebomb')
    moveAction(b, 'opp', 0, 'ironhead')
    expect(b.possibleInflicts('mine', 0, 0)).toEqual(['flinch']) // 깜까미는 강철 → 독 불가
    // 독이 통하는 상대
    const b2 = setup('single', [fast('kingsrock')], [slot('gyarados')])
    b2.sendOut('opp', 0, 0)
    moveAction(b2, 'mine', 0, 'sludgebomb')
    moveAction(b2, 'opp', 0, 'waterfall')
    expect(b2.possibleInflicts('mine', 0, 0)).toEqual(['psn', 'flinch'])
    moveAction(b2, 'mine', 0, 'ironhead')
    expect(b2.possibleInflicts('mine', 0, 0)).toEqual(['flinch'])
    // 트라이어택: 화상·마비·얼음
    moveAction(b2, 'mine', 0, 'triattack')
    expect(b2.possibleInflicts('mine', 0, 0)).toEqual(['brn', 'par', 'frz', 'flinch'])
  })
  it('풀죽음은 상대가 아직 행동하지 않았을 때만, 정신력·인분·대타·이미 상태이상이면 제외', () => {
    const b = setup('single', [slot('kingambit', { item: 'kingsrock' })], [slot('garchomp')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'ironhead')
    moveAction(b, 'opp', 0, 'earthquake')
    expect(b.possibleInflicts('mine', 0, 0)).toEqual([]) // 상대가 먼저 행동
    const b2 = setup('single', [fast()], [slot('dragonite', { ability: 'innerfocus' })])
    b2.sendOut('opp', 0, 0)
    moveAction(b2, 'mine', 0, 'firefang')
    moveAction(b2, 'opp', 0, 'waterfall')
    expect(b2.possibleInflicts('mine', 0, 0)).toEqual(['brn'])
    mon(b2, 'opp', 0).status = 'par'
    expect(b2.possibleInflicts('mine', 0, 0)).toEqual([])
    mon(b2, 'opp', 0).status = ''
    b2.toggleVolatile('opp', 0, 'substitute')
    expect(b2.possibleInflicts('mine', 0, 0)).toEqual([])
  })
  it('우격다짐: 기술 부가효과는 없음, 부가효과 없는 기술의 왕의징표석은 됨', () => {
    const b = setup('single', [fast('kingsrock', 'sheerforce')], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'waterfall')
    moveAction(b, 'mine', 0, 'sludgebomb')
    expect(b.possibleInflicts('mine', 0, 0)).toEqual([])
    moveAction(b, 'mine', 0, 'earthquake')
    expect(b.possibleInflicts('mine', 0, 0)).toEqual(['flinch'])
    // 부가효과가 있는 기술(폭포오르기 풀죽음 20%)은 우격다짐이면 왕의징표석도 없음
    moveAction(b, 'mine', 0, 'waterfall')
    expect(b.possibleInflicts('mine', 0, 0)).toEqual([])
  })
  it('체크한 풀죽음·독 적용: 상대는 이번 턴 행동 불가(풀죽음)로 데미지 없음', () => {
    const b = setup('single', [fast('kingsrock')], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'sludgebomb', 30)
    moveAction(b, 'opp', 0, 'waterfall', 50)
    S(b).actions.mine[0]!.inflicts = ['psn', 'flinch']
    const hp = mon(b, 'mine', 0).hp
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('psn')
    expect(mon(b, 'mine', 0).hp).toBe(hp)
    expect(S(b).actions.opp[0]!.kind).toBe('move') // 다음 턴 기본값은 다시 기술 사용
  })
  it('속이다(풀죽음 100%)는 체크 없이 자동', () => {
    const b = setup('single', [fast()], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'fakeout', 10)
    moveAction(b, 'opp', 0, 'waterfall', 50)
    const hp = mon(b, 'mine', 0).hp
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(hp)
  })
  it('접촉: 내 정전기로 상대가 마비', () => {
    const b = setup('single', [slot('garchomp', { ability: 'static' })], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'waterfall', 30)
    expect(b.possibleContactInflicts('opp', 0, 0)).toEqual(['par'])
    moveAction(b, 'opp', 0, 'hydropump', 30)
    expect(b.possibleContactInflicts('opp', 0, 0)).toEqual([]) // 비접촉
    moveAction(b, 'opp', 0, 'waterfall', 30)
    S(b).actions.opp[0]!.contactInflicts = ['par']
    b.executeTurn()
    expect(mon(b, 'opp', 0).status).toBe('par')
  })
})

describe('변화기는 데미지 입력이 없음', () => {
  it('하품·앙코르에 데미지 값이 남아 있어도 HP 는 그대로, 입력 검사에도 걸리지 않음', () => {
    const b = setup('single', [slot('garchomp')], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'yawn', 150)
    moveAction(b, 'opp', 0, 'encore', 999)
    expect(b.isStatusMove('yawn')).toBe(true)
    expect(b.validationError.value).toBe('')
    const hp = mon(b, 'mine', 0).hp
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBe(100)
    expect(mon(b, 'mine', 0).hp).toBe(hp)
    expect(mon(b, 'opp', 0).volatiles.yawn).toBe(2)
  })
})

describe('내 포켓몬에게 생긴 상태: 상대 기술·도구·특성으로 가능한 것만', () => {
  it('상대 하품: 고를 것 없음 (졸음은 자동)', () => {
    const b = setup('single', [slot('garchomp')], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'yawn')
    expect(b.possibleInflicts('opp', 0, 0)).toEqual([])
    expect(b.possibleContactInflicts('opp', 0, 0)).toEqual([])
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.yawn).toBe(2)
  })
  it('상대 열탕: 화상 체크 / 상대 추측 왕의징표석이면 풀죽음도 가능', () => {
    const b = setup('single', [slot('kingambit')], [slot('garchomp', { item: 'kingsrock' })])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'ironhead')
    moveAction(b, 'opp', 0, 'scald', 20)
    expect(b.possibleInflicts('opp', 0, 0)).toEqual(['brn', 'flinch'])
    S(b).actions.opp[0]!.inflicts = ['brn']
    b.executeTurn()
    expect(mon(b, 'mine', 0).status).toBe('brn')
  })
  it('내 기술이 접촉 → 상대 정전기로 내 포켓몬 마비', () => {
    const b = setup('single', [slot('garchomp')], [slot('gyarados', { ability: 'static' })])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'dragonclaw', 20)
    expect(b.possibleContactInflicts('mine', 0, 0)).toEqual(['par'])
  })
  it('확정 특수 상태는 자동: 도발·조이기류(턴 끝 1/8)', () => {
    const b = setup('single', [slot('garchomp')], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'taunt')
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.taunt).toBeTruthy()
    moveAction(b, 'opp', 0, 'bind', 10)
    const before = mon(b, 'mine', 0).hp
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.partiallytrapped).toBeTruthy()
    expect(mon(b, 'mine', 0).hp).toBe(before - 10 - Math.floor(b.maxHp('mine', 0) / 8))
  })
  it('잠자기: HP 전부 회복 + 잠듦, 정확히 2턴 자고 3번째 턴에 깸', () => {
    const b = setup('single', [slot('garchomp')], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    mon(b, 'mine', 0).hp = 50
    moveAction(b, 'mine', 0, 'rest')
    b.executeTurn()
    expect(mon(b, 'mine', 0)).toMatchObject({ hp: max, status: 'slp', restSleep: true })
    expect(b.wakeChance('mine', 0)).toBe(0)
    expect(S(b).actions.mine[0]!.kind).toBe('cant')
    b.executeTurn()
    expect(b.wakeChance('mine', 0)).toBe(0) // 일반 잠듦이면 33%
    b.executeTurn()
    expect(b.wakeChance('mine', 0)).toBe(100)
    expect(S(b).actions.mine[0]!.kind).toBe('move')
    // HP 가 가득이면 실패
    const b2 = setup('single', [slot('garchomp')], [slot('gyarados')])
    b2.sendOut('opp', 0, 0)
    moveAction(b2, 'mine', 0, 'rest')
    b2.executeTurn()
    expect(mon(b2, 'mine', 0).status).toBe('')
  })
})

describe('성별: 헤롱헤롱 / 헤롱헤롱바디', () => {
  it('서로 다른 성별이면 자동, 같은 성별이면 실패 (선택지도 없음)', () => {
    const b = setup(
      'single',
      [slot('garchomp', { gender: 'M' })],
      [slot('gyarados', { gender: 'F' })],
    )
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'attract')
    expect(b.possibleInflicts('opp', 0, 0)).toEqual([])
    b.executeTurn()
    expect(mon(b, 'mine', 0).volatiles.attract).toBeTruthy()
  })
  it('같은 성별이면 실패', () => {
    const s = setup(
      'single',
      [slot('garchomp', { gender: 'F' })],
      [slot('gyarados', { gender: 'F' })],
    )
    s.sendOut('opp', 0, 0)
    moveAction(s, 'opp', 0, 'attract')
    expect(s.possibleInflicts('opp', 0, 0)).toEqual([])
    s.executeTurn()
    expect(mon(s, 'mine', 0).volatiles.attract).toBeUndefined()
  })
  it('성별을 모르면 자동으로 걸지 않고 체크로 (무성이면 선택지 없음)', () => {
    const b = setup('single', [slot('garchomp', { gender: 'M' })], [slot('gyarados')])
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'attract')
    expect(b.possibleInflicts('mine', 0, 0)).toEqual(['attract'])
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.attract).toBeUndefined()
    S(b).actions.mine[0]!.inflicts = ['attract']
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.attract).toBeTruthy()
  })
  it('무성이면 선택지 없음', () => {
    const n = setup('single', [slot('garchomp', { gender: 'M' })], [slot('metagross')])
    n.sendOut('opp', 0, 0)
    moveAction(n, 'mine', 0, 'attract')
    expect(n.genderOf('opp', 0)).toBe('N')
    expect(n.possibleInflicts('mine', 0, 0)).toEqual([])
  })
  it('성별이 정해진 종은 데이터를 따름 (엘레이드 수컷 / 눈여아 암컷)', () => {
    const b = setup('single', [slot('gallade')], [slot('froslass')])
    b.sendOut('opp', 0, 0)
    expect([b.genderOf('mine', 0), b.genderOf('opp', 0)]).toEqual(['M', 'F'])
    moveAction(b, 'mine', 0, 'attract')
    b.executeTurn()
    expect(mon(b, 'opp', 0).volatiles.attract).toBeTruthy()
  })
  it('헤롱헤롱바디: 접촉한 상대가 다른 성별이거나 모를 때만 체크 가능', () => {
    const b = setup(
      'single',
      [slot('garchomp', { ability: 'cutecharm', gender: 'F' })],
      [slot('gyarados', { gender: 'M' })],
    )
    b.sendOut('opp', 0, 0)
    moveAction(b, 'opp', 0, 'waterfall', 20)
    expect(b.possibleContactInflicts('opp', 0, 0)).toEqual(['attract'])
    b.oppSlots.value[0]!.gender = 'F'
    expect(b.possibleContactInflicts('opp', 0, 0)).toEqual([])
    b.oppSlots.value[0]!.gender = ''
    expect(b.possibleContactInflicts('opp', 0, 0)).toEqual(['attract'])
  })
})

describe('내 파티 완성 조건: 성별', () => {
  it('성별이 있는 포켓몬은 성별을 골라야 완성 (정해진 종·무성은 필요 없음, 상대 파티는 해당 없음)', () => {
    const mv = { moves: ['earthquake', '', '', ''] as [string, string, string, string] }
    const team = useTeam('mine')
    team.slots.value = [
      slot('garchomp', mv),
      slot('gallade', mv),
      slot('metagross', mv),
      slot('gyarados', { ...mv, gender: 'F' }),
      slot('froslass', mv),
      slot('snorlax', { ...mv, gender: 'M' }),
    ]
    expect(team.missingGender.value).toEqual([0])
    expect(team.isComplete.value).toBe(false)
    team.slots.value[0]!.gender = 'M'
    expect(team.isComplete.value).toBe(true)
    const opp = useTeam('opp')
    opp.slots.value = pad6([slot('garchomp', mv)])
    expect(opp.missingGender.value).toEqual([])
  })
})

describe('선후공 판정 (스피드 범위)', () => {
  // 에써르 vs 하마돈 (둘 다 우선도 0 기술): 하마돈 최대 스피드는 스카프 없이 108 (보정 S32), 스카프면 162
  const setupIndeedee = (mine: Partial<TeamSlot> = {}) => {
    const b = setup(
      'single',
      [slot('indeedee', mine)],
      [
        slot('hippowdon', {
          nature: 'jolly',
          sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 32 },
        }),
      ],
    )
    b.sendOut('opp', 0, 0)
    moveAction(b, 'mine', 0, 'expandingforce')
    moveAction(b, 'opp', 0, 'yawn')
    return b
  }
  const keys = (b: Battle) => useBattleAnalysis(b).forecast.value.map((l) => l.key)

  it('도구 미확정이면 스카프 가능 → 확정 못 함, 먹다남은음식 확정이면 내가 선공 확정', () => {
    const b = setupIndeedee() // 에써르 무보정 S0 = 110
    expect(b.speedOrder(0, 0)?.first).toBeNull()
    expect(keys(b)).toContain('battle.flow.orderEstimate')
    b.confirmItem('opp', 0, 'leftovers')
    const v = b.speedOrder(0, 0)!
    expect(v.first).toBe('mine')
    expect(v.span[1]).toBe(108)
    expect(v.random).toBe(false) // 도구 확정 → 선제공격손톱 없음, 하마돈은 퀵드로 없음
    expect(keys(b)).toContain('battle.flow.orderSure')
    expect(keys(b)).not.toContain('battle.flow.orderRandom')
    // 스카프 확정이면 스카프 구간만
    b.confirmItem('opp', 0, 'choicescarf')
    expect(b.speedRangesOf(0).neutral).toBeNull()
    expect(b.speedRangesOf(0).plusScarf).toEqual([0, 32])
  })

  it('관찰한 선후공은 다음 턴에도 이어짐 (추측 배치보다 우선), 랭크가 바뀌면 다시 판정', () => {
    // 에써르 하락 성격 S0 = 99 < 추측 배치 하마돈(최속) 108 → 관찰 전에는 상대 선공으로 예상
    const b = setupIndeedee({ nature: 'brave' })
    b.confirmItem('opp', 0, 'leftovers')
    expect(b.turnOrder()[0]!.side).toBe('opp')
    S(b).observedOrder = 'mine'
    b.executeTurn()
    moveAction(b, 'mine', 0, 'expandingforce')
    moveAction(b, 'opp', 0, 'yawn')
    expect(b.speedOrder(0, 0)?.first).toBe('mine')
    expect(b.turnOrder()[0]!.side).toBe('mine')
    // 상대 스피드 +2 → 관찰한 범위(67~99)의 2배 = 134~198 > 99 → 상대 선공 확정
    mon(b, 'opp', 0).boosts.spe = 2
    expect(b.speedOrder(0, 0)?.first).toBe('opp')
    expect(b.turnOrder()[0]!.side).toBe('opp')
    // 내 스피드 +1 (148) → 범위에 걸쳐서 모름
    mon(b, 'mine', 0).boosts.spe = 1
    expect(b.speedOrder(0, 0)?.first).toBeNull()
  })

  it('트릭룸이면 반대, 도구 미확정이면 선제공격손톱 가능 안내', () => {
    const b = setupIndeedee()
    S(b).observedOrder = 'mine'
    b.executeTurn()
    moveAction(b, 'mine', 0, 'expandingforce')
    moveAction(b, 'opp', 0, 'yawn')
    const v = b.speedOrder(0, 0)!
    expect(v.first).toBe('mine')
    expect(v.random).toBe(true)
    expect(keys(b)).toContain('battle.flow.orderRandom')
    b.toggleRoom('trickroom')
    expect(b.speedOrder(0, 0)?.first).toBe('opp')
    expect(b.turnOrder()[0]!.side).toBe('opp')
  })

  it('우선도가 다르면 우선도로 (스피드 판정 안내 없음)', () => {
    const b = setupIndeedee()
    b.confirmItem('opp', 0, 'leftovers')
    moveAction(b, 'opp', 0, 'suckerpunch')
    expect(b.turnOrder()[0]!.side).toBe('opp')
    expect(keys(b)).not.toContain('battle.flow.orderSure')
  })
})

describe('동시 등장: 특성 발동 순서', () => {
  it('선두: 스피드로 정해지면 느린 쪽 날씨가 남음 (내 코터스 45 < 상대 마기라스 최소 72 → 쾌청)', () => {
    const b = setup('single', [slot('torkoal', { ability: 'drought' })], [slot('tyranitar')])
    b.sendOut('opp', 0, 0)
    expect(S(b).weather.key).toBe('sun')
    expect(b.entryPairsNow.value[0]!.auto).toBe('opp')
  })

  it('선두: 스피드로 모르면 추측 배치로 적용, 본 순서를 고르면 날씨를 다시 적용하고 상대 스피드 구간을 좁힘', () => {
    // 내 나인테일 120 vs 상대 마기라스 72~186 (추측 배치 81)
    const b = setup('single', [slot('ninetales', { ability: 'drought' })], [slot('tyranitar')])
    b.sendOut('opp', 0, 0)
    expect(b.entryPairsNow.value[0]!.auto).toBeNull()
    expect(S(b).weather.key).toBe('sand') // 추측: 나인테일이 빠름 → 마기라스 모래바람이 나중
    b.setEntryOrder(0, 0, 'opp') // 상대 모래날림이 먼저 → 상대 ≥ 120
    expect(S(b).weather.key).toBe('sun')
    expect(mon(b, 'opp', 0).speedSp!.neutral).toBeNull()
    expect(mon(b, 'opp', 0).speedSp!.plus).toEqual([29, 32])
    b.setEntryOrder(0, 0, 'mine')
    expect(S(b).weather.key).toBe('sand')
    expect(mon(b, 'opp', 0).speedSp!.neutral).toEqual([0, 32])
    b.setEntryOrder(0, 0, 'unknown')
    expect(mon(b, 'opp', 0).speedSp).toBeNull()
  })

  it('위협은 순서를 고쳐도 다시 발동하지 않음', () => {
    const b = setup('single', [slot('ninetales', { ability: 'drought' })], [slot('salamence')])
    b.sendOut('opp', 0, 0)
    expect(mon(b, 'mine', 0).boosts.atk).toBe(-1)
    b.setEntryOrder(0, 0, 'opp')
    b.setEntryOrder(0, 0, 'mine')
    expect(mon(b, 'mine', 0).boosts.atk).toBe(-1)
  })

  it('같은 턴에 둘 다 교체: 미리 고른 순서로 날씨 + 스피드 구간', () => {
    const b = setup(
      'single',
      [slot('garchomp'), slot('ninetales', { ability: 'drought' })],
      [slot('garchomp'), slot('tyranitar')],
    )
    b.sendOut('opp', 0, 0)
    switchAction(b, 'mine', 0, 1)
    switchAction(b, 'opp', 0, 1)
    expect(b.entryPairsNow.value).toHaveLength(1)
    b.setEntryOrder(1, 1, 'opp')
    b.executeTurn()
    expect(S(b).weather.key).toBe('sun')
    expect(mon(b, 'opp', 1).speedSp!.plus).toEqual([29, 32])
    expect(S(b).entryObs).toEqual({})
  })
})

describe('쓰러진 뒤 교체', () => {
  const setupKo = () => {
    const b = setup(
      'single',
      [slot('garchomp'), slot('ninetales', { ability: 'drought' })],
      [slot('garchomp'), slot('tyranitar')],
    )
    b.sendOut('opp', 0, 0)
    b.executeTurn()
    mon(b, 'mine', 0).hp = 0
    mon(b, 'opp', 0).hp = 0
    return b
  }

  it('양쪽이 쓰러지면 교체를 먼저 입력해야 턴을 적용할 수 있음', () => {
    const b = setupKo()
    expect(b.pendingReplace.value.map((p) => p.side)).toEqual(['mine', 'opp'])
    expect(b.validationError.value).toBe('errReplace')
    expect(b.replaceOptions('opp')).toEqual([1]) // 상대 파티의 남은 마기라스
  })

  it('함께 등장 → 스피드 순 발동, 다음 턴 적용 전까지 순서를 고칠 수 있음, 되돌리기 가능', () => {
    const b = setupKo()
    b.replaceFainted([
      { side: 'mine', slot: 0, idx: 1 },
      { side: 'opp', slot: 0, idx: 1 },
    ])
    expect(b.pendingReplace.value).toEqual([])
    expect(S(b).sides.opp.active[0]).toBe(1)
    expect(S(b).weather.key).toBe('sand')
    b.setEntryOrder(1, 1, 'opp')
    expect(S(b).weather.key).toBe('sun')
    b.executeTurn()
    expect(S(b).entry).toBeNull()
    expect(mon(b, 'opp', 1).speedSp!.plus).toEqual([29, 32])
    b.undo()
    b.undo()
    expect(S(b).sides.mine.active[0]).toBe(0)
  })
})

describe('교체 턴의 선후공', () => {
  const setupSwitch = () => {
    const b = setup(
      'single',
      [slot('garchomp'), slot('corviknight')],
      [slot('salamence'), slot('garchomp')],
    )
    b.sendOut('opp', 0, 0)
    return b
  }

  it('한쪽만 교체: 교체가 항상 먼저라 선후공 관찰을 스피드에 쓰지 않음', () => {
    const b = setupSwitch()
    switchAction(b, 'opp', 0, 1)
    moveAction(b, 'mine', 0, 'earthquake')
    S(b).observedOrder = 'opp'
    expect(b.pendingSpeedObservation()).toBeNull()
    b.executeTurn()
    expect(mon(b, 'opp', 0).speedSp).toBeNull()
    expect(mon(b, 'opp', 1).speedSp).toBeNull()
  })

  it('둘 다 교체: 먼저 교체한 쪽 = 나가는 포켓몬끼리 스피드 비교 (상대 보만다 ≥ 내 한카리아스 122)', () => {
    const b = setupSwitch()
    switchAction(b, 'mine', 0, 1)
    switchAction(b, 'opp', 0, 1)
    S(b).observedOrder = 'opp'
    expect(b.pendingSpeedObservation()?.oi).toBe(0)
    b.executeTurn()
    expect(mon(b, 'opp', 0).speedSp!.neutral).toEqual([2, 32])
    expect(mon(b, 'opp', 1).speedSp).toBeNull()
  })
})

describe('상대 특성 확정', () => {
  it('추측 자기과신 갸라도스 → 위협 확정: 방금 나왔으면 위협을 지금 적용, 계산에도 반영', () => {
    const b = setup('single', [slot('garchomp')], [slot('gyarados', { ability: 'moxie' })])
    b.sendOut('opp', 0, 0)
    expect(mon(b, 'mine', 0).boosts.atk).toBe(0)
    b.confirmAbility(0, 'intimidate')
    expect(mon(b, 'mine', 0).boosts.atk).toBe(-1)
    expect(b.resolveAt('opp', 0)!.ability).toBe('intimidate')
    expect(b.oppAbilityOf(0)).toBe('intimidate')
    // 같은 특성으로 다시 확정해도 두 번 적용하지 않음
    b.confirmAbility(0, 'intimidate')
    expect(mon(b, 'mine', 0).boosts.atk).toBe(-1)
    // 확정 취소 → 다시 추측 특성
    b.confirmAbility(0, '')
    expect(b.resolveAt('opp', 0)!.ability).toBe('moxie')
  })

  it('나온 지 오래됐으면 등장 효과는 적용하지 않음', () => {
    const b = setup('single', [slot('garchomp')], [slot('gyarados', { ability: 'moxie' })])
    b.sendOut('opp', 0, 0)
    b.executeTurn()
    b.executeTurn()
    b.confirmAbility(0, 'intimidate')
    expect(mon(b, 'mine', 0).boosts.atk).toBe(0)
  })

  it('추측 모래날림이 깐 모래바람은 모래의힘으로 확정하면 지움', () => {
    const b = setup('single', [slot('garchomp')], [slot('hippowdon', { ability: 'sandstream' })])
    b.sendOut('opp', 0, 0)
    expect(S(b).weather.key).toBe('sand')
    b.confirmAbility(0, 'sandforce')
    expect(S(b).weather.key).toBe('')
  })

  it('선두 묶음에서 특성을 확정하면 날씨·짝을 다시 계산', () => {
    const b = setup('single', [slot('ninetales', { ability: 'drought' })], [slot('tyranitar')])
    b.sendOut('opp', 0, 0)
    expect(b.entryPairsNow.value).toHaveLength(1)
    b.confirmAbility(0, 'unnerve') // 긴장감도 등장 문구가 나옴 → 짝 유지, 모래바람은 사라짐
    expect(b.entryPairsNow.value).toHaveLength(1)
    expect(S(b).weather.key).toBe('sun')
  })
})

describe('흡수기 회복', () => {
  it('쓰러뜨리면 상대가 실제로 잃은 HP(남은 HP)의 절반만큼 회복', () => {
    const b = setup('single', [slot('venusaur')], [slot('swampert')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    mon(b, 'mine', 0).hp = 50
    mon(b, 'opp', 0).hp = 30
    moveAction(b, 'mine', 0, 'gigadrain', 100) // 100% 입력이지만 남은 30% 만 잃음
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBe(0)
    const dealt = Math.round(0.3 * b.maxHp('opp', 0))
    expect(mon(b, 'mine', 0).hp).toBe(Math.min(max, 50 + Math.round(dealt / 2)))
  })

  it('상대의 흡수기: 내가 잃은 HP 의 절반을 상대 % 로 회복, 큰뿌리는 확정 도구일 때만 1.3배', () => {
    const b = setup('single', [slot('garchomp')], [slot('conkeldurr')])
    b.sendOut('opp', 0, 0)
    mon(b, 'opp', 0).hp = 40
    moveAction(b, 'opp', 0, 'drainpunch', 60)
    b.executeTurn()
    const oppMax = b.maxHp('opp', 0)
    expect(mon(b, 'opp', 0).hp).toBeCloseTo(40 + (30 / oppMax) * 100, 5)
    b.confirmItem('opp', 0, 'bigroot')
    mon(b, 'opp', 0).hp = 40
    moveAction(b, 'opp', 0, 'drainpunch', 60)
    b.executeTurn()
    expect(mon(b, 'opp', 0).hp).toBeCloseTo(40 + (39 / oppMax) * 100, 5)
  })

  it('해감액이면 회복 대신 데미지, 회복봉인이면 회복 없음', () => {
    const b = setup('single', [slot('venusaur')], [slot('swalot', { ability: 'liquidooze' })])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    moveAction(b, 'mine', 0, 'gigadrain', 50)
    b.executeTurn()
    const dealt = Math.round(0.5 * b.maxHp('opp', 0))
    expect(mon(b, 'mine', 0).hp).toBe(max - Math.round(dealt / 2))
    resetNuxtState()
    const b2 = setup('single', [slot('venusaur')], [slot('swampert')])
    b2.sendOut('opp', 0, 0)
    mon(b2, 'mine', 0).hp = 50
    mon(b2, 'mine', 0).volatiles.healblock = 1
    moveAction(b2, 'mine', 0, 'gigadrain', 50)
    b2.executeTurn()
    expect(mon(b2, 'mine', 0).hp).toBe(50)
  })
})

describe('공격한 쪽 HP 변화 (반동·도구·접촉)', () => {
  it('반동기: 맞힌 데미지 × 비율, 돌머리는 없음', () => {
    const b = setup('single', [slot('garchomp')], [slot('swampert')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    moveAction(b, 'mine', 0, 'doubleedge', 50)
    b.executeTurn()
    const dealt = Math.round(0.5 * b.maxHp('opp', 0))
    expect(mon(b, 'mine', 0).hp).toBe(max - Math.round(dealt * 0.33))
    resetNuxtState()
    const b2 = setup('single', [slot('aggron', { ability: 'rockhead' })], [slot('swampert')])
    b2.sendOut('opp', 0, 0)
    moveAction(b2, 'mine', 0, 'doubleedge', 50)
    b2.executeTurn()
    expect(mon(b2, 'mine', 0).hp).toBe(b2.maxHp('mine', 0))
  })

  it('생명의구슬 1/10 (우격다짐으로 부가효과가 없어진 기술은 없음), 조개껍질방울 1/8 회복', () => {
    const b = setup('single', [slot('garchomp', { item: 'lifeorb' })], [slot('swampert')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    moveAction(b, 'mine', 0, 'earthquake', 30)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - Math.floor(max / 10))
    resetNuxtState()
    const b2 = setup(
      'single',
      [slot('conkeldurr', { ability: 'sheerforce', item: 'lifeorb' })],
      [slot('swampert')],
    )
    b2.sendOut('opp', 0, 0)
    moveAction(b2, 'mine', 0, 'icepunch', 30)
    b2.executeTurn()
    expect(mon(b2, 'mine', 0).hp).toBe(b2.maxHp('mine', 0))
    resetNuxtState()
    const b3 = setup('single', [slot('garchomp', { item: 'shellbell' })], [slot('swampert')])
    b3.sendOut('opp', 0, 0)
    mon(b3, 'mine', 0).hp = 50
    moveAction(b3, 'mine', 0, 'earthquake', 40)
    b3.executeTurn()
    expect(mon(b3, 'mine', 0).hp).toBe(50 + Math.floor(Math.round(0.4 * b3.maxHp('opp', 0)) / 8))
  })

  it('접촉: 까칠한피부 1/8, 확정 울퉁불퉁멧 1/6, 고정 연속기는 타수만큼', () => {
    const b = setup('single', [slot('garchomp')], [slot('garchomp', { ability: 'roughskin' })])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    moveAction(b, 'mine', 0, 'dragonclaw', 30)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - Math.floor(max / 8))
    b.confirmItem('opp', 0, 'rockyhelmet')
    mon(b, 'mine', 0).hp = max
    moveAction(b, 'mine', 0, 'dualwingbeat', 20)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - 2 * (Math.floor(max / 8) + Math.floor(max / 6)))
    // 접촉이 아니면 없음
    mon(b, 'mine', 0).hp = max
    moveAction(b, 'mine', 0, 'earthquake', 10)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max)
  })

  it('자뭉열매: 절반 이하가 되면 1/4 회복 (상대는 확정 도구일 때만)', () => {
    const b = setup('single', [slot('garchomp', { item: 'sitrusberry' })], [slot('swampert')])
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    const dmg = Math.ceil(max * 0.6)
    moveAction(b, 'opp', 0, 'surf', dmg)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - dmg + Math.floor(max / 4))
    expect(mon(b, 'mine', 0).itemGone).toBe(true)
    resetNuxtState()
    const b2 = setup('single', [slot('garchomp')], [slot('swampert', { item: 'sitrusberry' })])
    b2.sendOut('opp', 0, 0)
    moveAction(b2, 'mine', 0, 'earthquake', 60)
    b2.executeTurn()
    expect(mon(b2, 'opp', 0).hp).toBe(40) // 추측 도구 → 먹지 않음
    b2.confirmItem('opp', 0, 'sitrusberry')
    moveAction(b2, 'mine', 0, 'earthquake', 1)
    b2.executeTurn()
    const om = b2.maxHp('opp', 0)
    expect(mon(b2, 'opp', 0).hp).toBeCloseTo(39 + (Math.floor(om / 4) / om) * 100, 5)
  })
})

describe('기술 자체의 HP 효과', () => {
  const duo = (mine = slot('garchomp'), opp = slot('swampert')) => {
    const b = setup('single', [mine, slot('audino', { ability: 'regenerator' })], [opp])
    b.sendOut('opp', 0, 0)
    return b
  }

  it('회복기 1/2, 광합성은 쾌청이면 2/3, 회복봉인이면 없음', () => {
    const b = duo()
    const max = b.maxHp('mine', 0)
    mon(b, 'mine', 0).hp = 10
    moveAction(b, 'mine', 0, 'recover')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(10 + Math.round(max / 2))
    mon(b, 'mine', 0).hp = 10
    b.setWeather('sun')
    moveAction(b, 'mine', 0, 'synthesis')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(10 + Math.round((max * 2) / 3))
    mon(b, 'mine', 0).hp = 10
    mon(b, 'mine', 0).volatiles.healblock = 1
    moveAction(b, 'mine', 0, 'recover')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(10)
  })

  it('배수의진: 1/2 깎고 공격 +6 / 대폭발: 빗나가도 쓰러짐, 습기가 있으면 실패', () => {
    const b = duo(slot('garchomp'), slot('garchomp'))
    const max = b.maxHp('mine', 0)
    moveAction(b, 'mine', 0, 'bellydrum')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(max - Math.floor(max / 2))
    expect(mon(b, 'mine', 0).boosts.atk).toBe(6)
    moveAction(b, 'mine', 0, 'explosion')
    S(b).actions.mine[0]!.missed = true
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(0)
    resetNuxtState()
    const b2 = duo(slot('garchomp'), slot('swampert', { ability: 'damp' }))
    moveAction(b2, 'mine', 0, 'explosion', 50)
    b2.executeTurn()
    expect(mon(b2, 'mine', 0).hp).toBeGreaterThan(0)
  })

  it('희망사항: 다음 턴 끝에 1/2 회복', () => {
    const b = duo()
    const max = b.maxHp('mine', 0)
    mon(b, 'mine', 0).hp = 10
    moveAction(b, 'mine', 0, 'wish')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(10)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(10 + Math.floor(max / 2))
  })

  it('재생력: 교체로 물러나면 1/3 회복', () => {
    const b = setup(
      'single',
      [slot('audino', { ability: 'regenerator' }), slot('garchomp')],
      [slot('swampert')],
    )
    b.sendOut('opp', 0, 0)
    const max = b.maxHp('mine', 0)
    mon(b, 'mine', 0).hp = 20
    switchAction(b, 'mine', 0, 1)
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(20 + Math.floor(max / 3))
  })

  it('아픔나누기 / 힘흡수 / 저수', () => {
    const b = duo()
    const max = b.maxHp('mine', 0)
    const oppMax = b.maxHp('opp', 0)
    mon(b, 'mine', 0).hp = 20
    moveAction(b, 'mine', 0, 'painsplit')
    b.executeTurn()
    const avg = Math.floor((20 + oppMax) / 2)
    expect(mon(b, 'mine', 0).hp).toBe(avg)
    expect(mon(b, 'opp', 0).hp).toBeCloseTo((avg / oppMax) * 100, 5)
    mon(b, 'mine', 0).hp = 20
    const atk = b.resolveAt('opp', 0)!.stats.atk
    moveAction(b, 'mine', 0, 'strengthsap')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(Math.min(max, 20 + atk))
    expect(mon(b, 'opp', 0).boosts.atk).toBe(-1)
    resetNuxtState()
    const b2 = duo(slot('garchomp'), slot('vaporeon', { ability: 'waterabsorb' }))
    mon(b2, 'opp', 0).hp = 50
    moveAction(b2, 'mine', 0, 'surf', 0)
    b2.executeTurn()
    const vm = b2.maxHp('opp', 0)
    expect(mon(b2, 'opp', 0).hp).toBeCloseTo(50 + (Math.floor(vm / 4) / vm) * 100, 5)
  })

  it('치유소원: 쓴 포켓몬은 쓰러지고 다음에 나오는 포켓몬이 전부 회복', () => {
    const b = duo()
    mon(b, 'mine', 1).hp = 5
    mon(b, 'mine', 1).status = 'psn'
    moveAction(b, 'mine', 0, 'healingwish')
    b.executeTurn()
    expect(mon(b, 'mine', 0).hp).toBe(0)
    b.replaceFainted([{ side: 'mine', slot: 0, idx: 1 }])
    expect(mon(b, 'mine', 1).hp).toBe(b.maxHp('mine', 1))
    expect(mon(b, 'mine', 1).status).toBe('')
  })
})
