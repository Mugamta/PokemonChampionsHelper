type StatKey = 'A' | 'B' | 'C' | 'D' | 'S';
type Nature = {
	up?: StatKey;
	down?: StatKey;
};
const natures: Record<string, Nature> = {
    '노력': {}, '온순': {}, '수줍음': {}, '변덕': {}, '성실': {},
    '외로움': { up: 'A', down: 'B' }, '고집': { up: 'A', down: 'C' }, '개구쟁이': { up: 'A', down: 'D' }, '용감': { up: 'A', down: 'S' },
    '대담': { up: 'B', down: 'A' }, '장난꾸러기': { up: 'B', down: 'C' }, '촐랑': { up: 'B', down: 'D' }, '무사태평': { up: 'B', down: 'S' },
    '조심': { up: 'C', down: 'A' }, '의젓': { up: 'C', down: 'B' }, '덜렁': { up: 'C', down: 'D' }, '냉정': { up: 'C', down: 'S' },
    '차분': { up: 'D', down: 'A' }, '얌전': { up: 'D', down: 'B' }, '신중': { up: 'D', down: 'C' }, '건방': { up: 'D', down: 'S' },
    '겁쟁이': { up: 'S', down: 'A' }, '성급': { up: 'S', down: 'B' }, '명랑': { up: 'S', down: 'B' },
} as const
type NatureName = keyof typeof natures;

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
        const up = natures[Natures]?.up
        const down = natures[Natures]?.down

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

