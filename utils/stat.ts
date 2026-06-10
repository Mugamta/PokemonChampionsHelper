import { NatureMap, type NatureName } from '../data/nature';

export const calculateStat = (statKey: string, Base_Stat: number, Stat_Points: number, Natures: NatureName, Item: string) => {
    // 개체치는 31로 고정되었고, 노력치는 정수 단위가 되었으므로 HP는 + 75, 그 외는 + 20으로 계산식을 단순화
    let result = 0

    if (statKey === 'H') {
        // H = 종족값 + 75 + 능력 포인트(노력치)
        result = Base_Stat + 75 + Stat_Points
        if (Base_Stat === 1) result = 1 // 껍질몬
    } else { 
        // (종족값 + 20 + 능력 포인트 (노력치)) * 성격보정
        result = Base_Stat + 20 + Stat_Points
        const up = NatureMap[Natures]?.up
        const down = NatureMap[Natures]?.down

        if (up === statKey) result *= 1.1
        else if (down === statKey) result *= 0.9
    }
    result = Math.floor(result)

    if(statKey == 'A' && Item === '구애머리띠') result = Math.floor(result * 1.5)
    else if(statKey == 'C' && Item === '구애안경') result = Math.floor(result * 1.5)
    else if(statKey == 'D' && Item === '돌격조끼') result = Math.floor(result * 1.5)
    else if(statKey == 'S' && Item === '구애스카프') result = Math.floor(result * 1.5)

    return result
}

