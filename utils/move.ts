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