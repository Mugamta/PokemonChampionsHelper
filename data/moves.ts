export const moves: Record<string, {}> = {
    '폭발펀치': {Type: '격투', Category: '물리', Power: 100, Accuracy: 50, PP: 5, Effect: '상대를 반드시 혼란'},
    '화염방사': {Type: '불꽃', Category: '특수', Power: 90, Accuracy: 100, PP: 15, Effect: '10% 확률로 상대를 화상'},
    '10만볼트': {Type: '전기', Category: '특수', Power: 90, Accuracy: 100, PP: 15, Effect: '10% 확률로 상대를 마비'},
    '냉동빔': {Type: '얼음', Category: '특수', Power: 90, Accuracy: 100, PP: 10, Effect: '10% 확률로 상대를 얼음'},
    '문포스': {Type: '페어리', Category: '특수', Power: 95, Accuracy: 100, PP: 15, Effect: '10% 확률로 상대의 특수랭크 1랭크 하락'},
} as const
export type MoveName = keyof typeof moves;