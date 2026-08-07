// data/mega-evolutions.ts
// 키: pokemon_list 데이터의 기본 포켓몬 이름(name)과 동일해야 함
// id / 종족값 / 특성 출처: PokeAPI pokemon.csv, Serebii XY·ORAS 도감, op.gg Pokemon Champions 도감
// (2026-08 기준 크로스체크. Champions 전용 종은 별도 표기)
//
// 이름 규칙: 메가진화는 전부 "메가" + 원래 이름. 폼이 여러 개인 경우(리자몽, 뮤츠 등)만
// 맨 뒤에 X / Y(/Z)를 붙인다. 예) 메가리자몽X, 메가뮤츠Y
//
// ability: 메가진화 시 특성이 고정값으로 바뀌므로 별도 필드로 관리.
// (컴포넌트에서 도구가 '메가스톤'이면 이 값으로 특성을 강제 고정)
//
// 메가진화 폼이 2개인 경우(리자몽 X/Y, 뮤츠 X/Y 등)는 배열에 여러 개 넣을 수 있지만,
// 지금은 도구가 '메가스톤' 하나로 통일돼있어서(전용 스톤 구분 없음) 배열의 첫 번째 폼을 사용합니다.

export type MegaEvolutionData = {
  megaName: string
  id: number // 스프라이트용 PokeAPI 도감번호 (public/pokemon_sprites/{id}.png 로 미리 받아둬야 함)
  ability: string // 메가진화 시 고정되는 특성
  stats: { H: number; A: number; B: number; C: number; D: number; S: number }
}

export const MegaEvolutionMap: Record<string, MegaEvolutionData[]> = {
  // --- 1세대 ---
  '이상해꽃': [
    { megaName: '메가이상해꽃', id: 10033, ability: '두꺼운지방', stats: { H: 80, A: 100, B: 123, C: 122, D: 120, S: 80 } },
  ],
  '리자몽': [
    { megaName: '메가리자몽X', id: 10034, ability: '단단한발톱', stats: { H: 78, A: 130, B: 111, C: 130, D: 85, S: 100 } },
    { megaName: '메가리자몽Y', id: 10035, ability: '가뭄', stats: { H: 78, A: 104, B: 78, C: 159, D: 115, S: 100 } },
  ],
  '거북왕': [
    { megaName: '메가거북왕', id: 10036, ability: '메가런처', stats: { H: 79, A: 103, B: 120, C: 135, D: 115, S: 78 } },
  ],
  '독침붕': [
    { megaName: '메가독침붕', id: 10090, ability: '적응력', stats: { H: 65, A: 150, B: 40, C: 15, D: 80, S: 145 } },
  ],
  '피죤투': [
    { megaName: '메가피죤투', id: 10073, ability: '노가드', stats: { H: 83, A: 80, B: 80, C: 135, D: 80, S: 121 } },
  ],
  '후딘': [
    // op.gg Pokemon Champions 도감 기준 D 105 (마이너 D95는 오기)
    { megaName: '메가후딘', id: 10037, ability: '트레이스', stats: { H: 55, A: 50, B: 65, C: 175, D: 105, S: 150 } },
  ],
  '야도란': [
    { megaName: '메가야도란', id: 10071, ability: '조가비갑옷', stats: { H: 95, A: 75, B: 180, C: 130, D: 80, S: 30 } },
  ],
  '팬텀': [
    { megaName: '메가팬텀', id: 10038, ability: '그림자밟기', stats: { H: 60, A: 65, B: 80, C: 170, D: 95, S: 130 } },
  ],
  '캥카': [
    // op.gg Pokemon Champions 도감 표기가 "메가캥카"라서 키도 캥카스칸→캥카로 맞춤
    // (pokemon_list 쪽 종족명이 실제로 "캥카"인지 확인 필요)
    { megaName: '메가캥카', id: 10039, ability: '부자유친', stats: { H: 105, A: 125, B: 100, C: 60, D: 100, S: 100 } },
  ],
  '라이츄': [
    // Pokemon Champions 전용 신규 메가진화
    { megaName: '메가라이츄X', id: 10304, ability: '일렉트릭메이커', stats: { H: 60, A: 135, B: 95, C: 90, D: 95, S: 110 } },
    { megaName: '메가라이츄Y', id: 10305, ability: '노가드', stats: { H: 60, A: 100, B: 55, C: 160, D: 80, S: 130 } },
  ],
  '픽시': [
    // Pokemon Champions 전용 신규 메가진화
    { megaName: '메가픽시', id: 10278, ability: '매직미러', stats: { H: 95, A: 80, B: 93, C: 135, D: 110, S: 70 } },
  ],
  '우츠보트': [
    // Pokemon Champions 전용 신규 메가진화
    { megaName: '메가우츠보트', id: 10279, ability: '내용물분출', stats: { H: 80, A: 125, B: 85, C: 135, D: 95, S: 70 } },
  ],
  '아쿠스타': [
    // Pokemon Champions 전용 신규 메가진화. 물/에스퍼 타입, 원본 종족(스타미 추정) 확인 필요
    { megaName: '메가아쿠스타', id: 10280, ability: '천하장사', stats: { H: 60, A: 100, B: 105, C: 130, D: 105, S: 120 } },
  ],
  '쁘사이저': [
    { megaName: '메가쁘사이저', id: 10040, ability: '스카이스킨', stats: { H: 65, A: 155, B: 120, C: 65, D: 90, S: 105 } },
  ],
  '갸라도스': [
    { megaName: '메가갸라도스', id: 10041, ability: '틀깨기', stats: { H: 95, A: 155, B: 109, C: 70, D: 130, S: 81 } },
  ],
  '프테라': [
    { megaName: '메가프테라', id: 10042, ability: '단단한발톱', stats: { H: 80, A: 135, B: 85, C: 70, D: 95, S: 150 } },
  ],
  '뮤츠': [
    { megaName: '메가뮤츠X', id: 10043, ability: '불굴', stats: { H: 106, A: 190, B: 100, C: 154, D: 100, S: 130 } },
    { megaName: '메가뮤츠Y', id: 10044, ability: '불면', stats: { H: 106, A: 150, B: 70, C: 194, D: 120, S: 140 } },
  ],

  // --- 2세대 ---
  '전룡': [
    { megaName: '메가전룡', id: 10045, ability: '틀깨기', stats: { H: 90, A: 95, B: 105, C: 165, D: 110, S: 45 } },
  ],
  '강철톤': [
    { megaName: '메가강철톤', id: 10072, ability: '모래헤치기', stats: { H: 75, A: 125, B: 230, C: 55, D: 95, S: 30 } },
  ],
  '핫삼': [
    { megaName: '메가핫삼', id: 10046, ability: '테크니션', stats: { H: 70, A: 150, B: 140, C: 65, D: 100, S: 75 } },
  ],
  '헤라크로스': [
    { megaName: '메가헤라크로스', id: 10047, ability: '스킬링크', stats: { H: 80, A: 185, B: 115, C: 40, D: 105, S: 75 } },
  ],
  '헬가': [
    { megaName: '메가헬가', id: 10048, ability: '태양의힘', stats: { H: 75, A: 90, B: 90, C: 140, D: 90, S: 115 } },
  ],
  '마기라스': [
    { megaName: '메가마기라스', id: 10049, ability: '모래날림', stats: { H: 100, A: 164, B: 150, C: 95, D: 120, S: 71 } },
  ],

  // --- 3세대 ---
  '나무킹': [
    { megaName: '메가나무킹', id: 10065, ability: '피뢰침', stats: { H: 70, A: 110, B: 75, C: 145, D: 85, S: 145 } },
  ],
  '번치코': [
    { megaName: '메가번치코', id: 10050, ability: '가속', stats: { H: 80, A: 160, B: 80, C: 130, D: 80, S: 100 } },
  ],
  '대짱이': [
    { megaName: '메가대짱이', id: 10064, ability: '스위트스윔', stats: { H: 100, A: 150, B: 110, C: 95, D: 110, S: 70 } },
  ],
  '가디안': [
    { megaName: '메가가디안', id: 10051, ability: '페어리스킨', stats: { H: 68, A: 85, B: 65, C: 165, D: 135, S: 100 } },
  ],
  '깜까미': [
    { megaName: '메가깜까미', id: 10066, ability: '매직미러', stats: { H: 50, A: 85, B: 125, C: 85, D: 115, S: 20 } },
  ],
  '입치트': [
    { megaName: '메가입치트', id: 10052, ability: '천하장사', stats: { H: 50, A: 105, B: 125, C: 55, D: 95, S: 50 } },
  ],
  '커다크': [
    { megaName: '메가커다크', id: 10053, ability: '필터', stats: { H: 70, A: 140, B: 230, C: 60, D: 80, S: 50 } },
  ],
  '요가램': [
    { megaName: '메가요가램', id: 10054, ability: '순수한힘', stats: { H: 60, A: 100, B: 85, C: 80, D: 85, S: 100 } },
  ],
  '썬더볼트': [
    { megaName: '메가썬더볼트', id: 10055, ability: '위협', stats: { H: 70, A: 75, B: 80, C: 135, D: 80, S: 135 } },
  ],
  '다크펫': [
    { megaName: '메가다크펫', id: 10056, ability: '짓궂은마음', stats: { H: 64, A: 165, B: 75, C: 93, D: 83, S: 75 } },
  ],
  '앱솔': [
    { megaName: '메가앱솔', id: 10057, ability: '매직미러', stats: { H: 65, A: 150, B: 60, C: 115, D: 60, S: 115 } },
  ],
  '얼음귀신': [
    { megaName: '메가얼음귀신', id: 10074, ability: '아이스스킨', stats: { H: 80, A: 120, B: 80, C: 120, D: 80, S: 100 } },
  ],
  '보만다': [
    { megaName: '메가보만다', id: 10089, ability: '스카이스킨', stats: { H: 95, A: 145, B: 130, C: 120, D: 90, S: 120 } },
  ],
  '메타그로스': [
    { megaName: '메가메타그로스', id: 10076, ability: '단단한발톱', stats: { H: 80, A: 145, B: 150, C: 105, D: 110, S: 110 } },
  ],
  '라티아스': [
    { megaName: '메가라티아스', id: 10062, ability: '부유', stats: { H: 80, A: 100, B: 120, C: 140, D: 150, S: 110 } },
  ],
  '라티오스': [
    { megaName: '메가라티오스', id: 10063, ability: '부유', stats: { H: 80, A: 130, B: 100, C: 160, D: 120, S: 110 } },
  ],
  '레쿠쟈': [
    { megaName: '메가레쿠쟈', id: 10079, ability: '델타스트림', stats: { H: 105, A: 180, B: 100, C: 180, D: 100, S: 115 } },
  ],
  '디안시': [
    { megaName: '메가디안시', id: 10075, ability: '매직미러', stats: { H: 50, A: 160, B: 110, C: 160, D: 110, S: 110 } },
  ],
  '샤크니아': [
    { megaName: '메가샤크니아', id: 10070, ability: '강한턱', stats: { H: 70, A: 140, B: 70, C: 110, D: 65, S: 105 } },
  ],
  '폭타': [
    { megaName: '메가폭타', id: 10087, ability: '사나운힘', stats: { H: 70, A: 120, B: 100, C: 145, D: 105, S: 20 } },
  ],
  '파비코리': [
    { megaName: '메가파비코리', id: 10067, ability: '페어리스킨', stats: { H: 75, A: 110, B: 110, C: 110, D: 105, S: 80 } },
  ],

  // --- 4세대 ---
  '펜드라': [
    { megaName: '메가펜드라', id: 10088, ability: '심술쟁이', stats: { H: 65, A: 136, B: 94, C: 54, D: 96, S: 135 } },
  ],
  '한카리아스': [
    { megaName: '메가한카리아스', id: 10058, ability: '모래헤치기', stats: { H: 108, A: 170, B: 115, C: 120, D: 95, S: 92 } },
  ],
  '루카리오': [
    { megaName: '메가루카리오', id: 10059, ability: '적응력', stats: { H: 70, A: 145, B: 88, C: 140, D: 70, S: 112 } },
  ],
  '눈설왕': [
    { megaName: '메가눈설왕', id: 10060, ability: '눈퍼뜨리기', stats: { H: 90, A: 132, B: 105, C: 132, D: 105, S: 30 } },
  ],
  '엘레이드': [
    { megaName: '메가엘레이드', id: 10068, ability: '정신력', stats: { H: 68, A: 165, B: 95, C: 65, D: 115, S: 110 } },
  ],
  '다부니': [
    { megaName: '메가다부니', id: 10069, ability: '힐링하트', stats: { H: 103, A: 60, B: 126, C: 80, D: 126, S: 50 } },
  ],
}