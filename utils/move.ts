// 결정력 계산
export const calculateBaseDamage = (
        power: number, 
        attack: number, 
        STAB: boolean, 
        type: string, 
        ability?: string, 
        weather?: string, 
        item?: string) => 
    {
    // (물리/특수 공격 실능치) * (기술 위력) * 자속 보정 * 특성 보정 * 날씨 보정 * 도구 보정

    // 실능치 * 기술 위력 * 자속 보정(STAB) 계산
    let result = attack * power * (STAB ? 1.5 : 1)

    // 특성 보정
    if (ability === '천하장사') result *= 1.5

    // 날씨 보정
    if (weather === '쾌청' && type === '불꽃') result *= 1.5
    else if (weather === '쾌청' && type === '물') result *= 0.5
    else if (weather === '비' && type === '불꽃') result *= 0.5
    else if (weather === '비' && type === '물') result *= 1.5

    // 도구 보정
    if (item === '실크스카프' && type === '노말') result *= 1.2

    return Math.floor(result)
}