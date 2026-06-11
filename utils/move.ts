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

    return Math.floor(result)
}