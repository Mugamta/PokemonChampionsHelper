// 결정력 계산
export const calculateBaseDamage = (
        power: number, 
        attack: number, 
        STAB: boolean, 
        type: string, 
        category: string,
        ability?: string, 
        weather?: string, 
        item?: string,
        status?: string,
        field?: string) => 
    {
    // (물리/특수 공격 실능치) * (기술 위력) * 자속 보정 * 특성 보정 * 날씨 보정 * 도구 보정

    // 실능치 * 기술 위력 * 자속 보정(STAB) 계산
    let result = attack * power * (STAB ? 1.5 : 1)

    // 특성 보정
    if (ability === '천하장사') result *= 1.5

    // 특성 [근성] + 화상/마비 상태 보정 (1.5배)
    if (ability === '근성' && (status === '화상' || status === '마비')) {
      result *= 1.5
    }

    // 날씨 보정: 날씨부정/에어록 특성이면 날씨 효과 전부 무효화, 그 외엔 쾌청/큰가뭄·비/폭우 계열 처리
    if (ability === '날씨부정' || ability === '에어록') {
      // 날씨 효과 없음
    } else if ((weather === '쾌청' || weather === '큰가뭄') && type === '불꽃') {
      result *= 1.5
    } else if (weather === '쾌청' && type === '물') {
      result *= 0.5
    } else if (weather === '큰가뭄' && type === '물') {
      result = 0
    } else if ((weather === '비' || weather === '폭우') && type === '물') {
      result *= 1.5
    } else if (weather === '비' && type === '불꽃') {
      result *= 0.5
    } else if (weather === '폭우' && type === '불꽃') {
      result = 0
    }

    // 도구 보정
    if (item === '실크스카프' && type === '노말') result *= 1.2
    if (item === '기적의씨' && type === '풀') result *= 1.2
    if (item === '목탄' && type === '불꽃') result *= 1.2
    if (item === '신비의물방울' && type === '물') result *= 1.2
    if (item === '자석' && type === '전기') result *= 1.2
    if (item === '은빛가루' && type === '벌레') result *= 1.2
    if (item === '예리한부리' && type === '비행') result *= 1.2
    if (item === '딱딱한돌' && type === '바위') result *= 1.2
    if (item === '독바늘' && type === '독') result *= 1.2
    if (item === '부드러운모래' && type === '땅') result *= 1.2
    if (item === '녹지않는얼음' && type === '얼음') result *= 1.2
    if (item === '검은띠' && type === '격투') result *= 1.2
    if (item === '휘어진스푼' && type === '에스퍼') result *= 1.2
    if (item === '저주의부적' && type === '고스트') result *= 1.2
    if (item === '용의이빨' && type === '드래곤') result *= 1.2
    if (item === '검은안경' && type === '악') result *= 1.2
    if (item === '금속코트' && type === '강철') result *= 1.2
    if (item === '요정의깃털' && type === '페어리') result *= 1.2

    // 필드 보정 (땅에 있는 포켓몬 기준 효과. 부유 특성은 제외 - 비행 타입 제외는 타입 데이터 없어서 반영 불가)
    if (field === '그래스필드' && type === '풀' && ability !== '부유') result *= 1.3
    if (field === '일렉트릭필드' && type === '전기' && ability !== '부유') result *= 1.3
    if (field === '사이코필드' && type === '에스퍼' && ability !== '부유') result *= 1.3
    // 미스트필드: 드래곤 타입 기술의 대미지가 절반 (땅에 있는 대상 기준. 이 도구는 상대 정보를 안 다뤄서 공격측에 바로 적용)
    if (field === '미스트필드' && type === '드래곤') result *= 0.5

    // 화상 상태 + 물리 기술: 최종 결정력 1/2 (버림). 단, 근성 특성이면 적용 안 함
    if (status === '화상' && category === '물리' && ability !== '근성') {
      result = Math.floor(result * 0.5)
    }

    return Math.floor(result)
}

// 실제 데미지 계산 (레벨 50 고정, 방어 실능치 반영, 난수 85~100%, 치명타 배율 포함)
export const calculateDamage = (
        power: number,
        attack: number,
        defense: number,
        STAB: boolean,
        type: string,
        category: string,
        ability?: string,
        weather?: string,
        item?: string,
        status?: string,
        field?: string,
        level: number = 50) => 
    {
    // 결정력(공격 실능치 * 위력 * 각종 보정)은 기존 함수 그대로 사용
    const modified = calculateBaseDamage(power, attack, STAB, type, category, ability, weather, item, status, field)

    if (power <= 0 || modified <= 0 || defense <= 0) {
      return { min: 0, max: 0, critMin: 0, critMax: 0 }
    }

    // (2 * 레벨 / 5 + 2) * 결정력 / 방어 실능치 / 50 + 2
    const levelFactor = Math.floor((2 * level) / 5) + 2
    const core = Math.floor((levelFactor * modified) / defense / 50) + 2

    const CRIT_MULTIPLIER = 1.5 // 챔피언스 치명타 배율

    const rangeOf = (base: number) => ({
      min: Math.floor(base * 0.85),
      max: Math.floor(base * 1.0),
    })

    const normalRange = rangeOf(core)
    const critRange = rangeOf(Math.floor(core * CRIT_MULTIPLIER))

    return {
      min: normalRange.min,
      max: normalRange.max,
      critMin: critRange.min,
      critMax: critRange.max,
    }
}

// 포켓몬 데미지 난수 16종(85%~100%, 1%씩 증가)을 그대로 배열로 반환
export const calculateDamageRolls = (
        power: number,
        attack: number,
        defense: number,
        STAB: boolean,
        type: string,
        category: string,
        ability?: string,
        weather?: string,
        item?: string,
        status?: string,
        field?: string,
        level: number = 50,
        crit: boolean = false) => 
    {
    const modified = calculateBaseDamage(power, attack, STAB, type, category, ability, weather, item, status, field)

    if (power <= 0 || modified <= 0 || defense <= 0) {
      return Array.from({ length: 16 }, () => 0)
    }

    const levelFactor = Math.floor((2 * level) / 5) + 2
    let core = Math.floor((levelFactor * modified) / defense / 50) + 2
    if (crit) core = Math.floor(core * 1.5)

    return Array.from({ length: 16 }, (_, i) => Math.floor((core * (85 + i)) / 100))
}

// 난수 N타(N회 공격 시 쓰러뜨릴 확률) 계산. 16개 난수의 조합을 컨볼루션하여
// 정확한 확률을 구하고, 가장 먼저 확률이 0을 넘는 히트 수를 반환한다.
// 반환: { hits, guaranteed, percent } | null (maxHits 안에 못 쓰러뜨리면 null)
export const calculateKoInfo = (rolls: number[], hp: number, maxHits: number = 4) => {
    if (!hp || hp <= 0) return null
    if (!rolls || !rolls.length || rolls[rolls.length - 1] <= 0) return null

    const n = rolls.length
    let dist: Record<number, number> = { 0: 1 }

    for (let hit = 1; hit <= maxHits; hit++) {
      const newDist: Record<number, number> = {}
      for (const sumKeyRaw in dist) {
        const sum = Number(sumKeyRaw)
        const cnt = dist[sumKeyRaw]
        for (const r of rolls) {
          const ns = sum + r
          newDist[ns] = (newDist[ns] || 0) + cnt
        }
      }
      dist = newDist

      const total = Math.pow(n, hit)
      let koCount = 0
      for (const sumKeyRaw in dist) {
        if (Number(sumKeyRaw) >= hp) koCount += dist[sumKeyRaw]
      }

      if (koCount > 0) {
        return {
          hits: hit,
          guaranteed: koCount === total,
          percent: (koCount / total) * 100,
        }
      }
    }
    return null
}

// "확정 1타" / "난수 2타 (43.2%)" 형태의 표시용 라벨 생성
export const formatKoLabel = (rolls: number[], hp: number, maxHits: number = 4) => {
    const info = calculateKoInfo(rolls, hp, maxHits)
    if (!info) return ''
    if (info.guaranteed) return `확정 ${info.hits}타`
    return `난수 ${info.hits}타 (${info.percent.toFixed(1)}%)`
}

// 상태이상으로 인한 매 턴 잔여 데미지 계산 (독/화상/맹독)
// toxicTurn: 맹독에 걸린 뒤 경과 턴(1부터 시작, 1턴째 1/16, 2턴째 2/16 ...)
export const calculateStatusDamage = (maxHp: number, status: string, ability?: string, toxicTurn: number = 1) => {
    if (!maxHp || maxHp <= 0) return 0
    if (status === '독') return Math.floor(maxHp / 8)
    if (status === '화상') return Math.floor(maxHp / (ability === '내열' ? 32 : 16))
    if (status === '맹독') return Math.floor((maxHp * Math.max(1, toxicTurn)) / 16)
    return 0
}