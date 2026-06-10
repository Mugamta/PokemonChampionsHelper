type StatKey = 'A' | 'B' | 'C' | 'D' | 'S';
type NatureMapType = {
	up?: StatKey;
	down?: StatKey;
};
export const Nature: string[] = [
    '노력', '온순', '수줍음', '변덕', '성실',
    '외로움', '고집', '개구쟁이', '용감',
    '대담', '장난꾸러기', '촐랑', '무사태평',
    '조심', '의젓', '덜렁', '냉정',
    '차분', '얌전', '신중', '건방',
    '겁쟁이', '성급', '명랑', '천진난만',
]
export const NatureMap: Record<string, NatureMapType> = {
    '노력': {}, '온순': {}, '수줍음': {}, '변덕': {}, '성실': {},
    '외로움': { up: 'A', down: 'B' }, '고집': { up: 'A', down: 'C' }, '개구쟁이': { up: 'A', down: 'D' }, '용감': { up: 'A', down: 'S' },
    '대담': { up: 'B', down: 'A' }, '장난꾸러기': { up: 'B', down: 'C' }, '촐랑': { up: 'B', down: 'D' }, '무사태평': { up: 'B', down: 'S' },
    '조심': { up: 'C', down: 'A' }, '의젓': { up: 'C', down: 'B' }, '덜렁': { up: 'C', down: 'D' }, '냉정': { up: 'C', down: 'S' },
    '차분': { up: 'D', down: 'A' }, '얌전': { up: 'D', down: 'B' }, '신중': { up: 'D', down: 'C' }, '건방': { up: 'D', down: 'S' },
    '겁쟁이': { up: 'S', down: 'A' }, '성급': { up: 'S', down: 'B' }, '명랑': { up: 'S', down: 'C' }, '천진난만': { up: 'S', down: 'D' },
} as const
export type NatureName = keyof typeof NatureMap;