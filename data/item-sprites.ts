// data/item-sprites.ts
// 한글 아이템 이름 -> PokeAPI sprites 저장소의 파일명(slug) 매핑
// https://github.com/PokeAPI/sprites/tree/master/sprites/items
// 파일명 규칙: {slug}.png (예: leftovers.png, choice-band.png)

export const ItemSpriteSlug: Record<string, string> = {
  // 구애 시리즈
  '구애머리띠': 'choice-band',
  '구애안경': 'choice-specs',
  '구애스카프': 'choice-scarf',

  '진화의휘석': 'eviolite',
  '돌격조끼': 'assault-vest',

  '기합의띠': 'focus-sash',

  // 특정 타입 위력 20% 증가 도구
  '실크스카프': 'silk-scarf',
  '기적의씨': 'miracle-seed',
  '목탄': 'charcoal',
  '신비의물방울': 'mystic-water',
  '자석': 'magnet',
  '은빛가루': 'silver-powder',
  '예리한부리': 'sharp-beak',
  '딱딱한돌': 'hard-stone',
  '독바늘': 'poison-barb',
  '부드러운모래': 'soft-sand',
  '녹지않는얼음': 'never-melt-ice',
  '검은띠': 'black-belt',
  '휘어진스푼': 'twisted-spoon',
  '저주의부적': 'spell-tag',
  '용의이빨': 'dragon-fang',
  '검은안경': 'black-glasses',
  '금속코트': 'metal-coat',
  '요정의깃털': 'fairy-feather',

  '멘탈허브': 'mental-herb',

  '조개껍질방울': 'shell-bell',

  // 상태이상 회복 열매
  '버치열매': 'cheri-berry',   // 마비
  '유루열매': 'chesto-berry',  // 잠듦
  '복슝열매': 'pecha-berry',   // 독
  '복분열매': 'rawst-berry',   // 화상
  '배리열매': 'aspear-berry',  // 얼음
  '시몬열매': 'persim-berry',  // 혼란
  '시마열매': 'kelpsy-berry',  // 참고: 실제로는 공격 노력치 감소 열매 (혼란 아님, 원본 주석 오류로 보임)
  '리샘열매': 'lum-berry',     // 모든 상태이상

  // HP, PP 회복 열매
  '과사열매': 'leppa-berry',   // PP 10 회복
  '오랭열매': 'oran-berry',    // HP 10 회복
  '자뭉열매': 'sitrus-berry',  // HP 50% 이하일 때 25% 회복

  // 타입 약점 반감 열매 (18타입)
  '카리열매': 'chilan-berry',   // 노말
  '오카열매': 'occa-berry',     // 불꽃
  '꼬시개열매': 'passho-berry', // 물
  '초나열매': 'wacan-berry',    // 전기
  '린드열매': 'rindo-berry',    // 풀
  '플카열매': 'yache-berry',    // 얼음
  '로플열매': 'chople-berry',   // 격투
  '으름열매': 'kebia-berry',    // 독
  '슈캐열매': 'shuca-berry',    // 땅
  '바코열매': 'coba-berry',     // 비행
  '야파열매': 'payapa-berry',   // 에스퍼
  '리체열매': 'tanga-berry',    // 벌레
  '루미열매': 'charti-berry',   // 바위
  '수불열매': 'kasib-berry',    // 고스트
  '하반열매': 'haban-berry',    // 드래곤
  '마코열매': 'colbur-berry',   // 악
  '바리비열매': 'babiri-berry', // 강철
  '로셀열매': 'roseli-berry',   // 페어리

  '초점렌즈': 'scope-lens',
  '전기구슬': 'light-ball',

  // '메가스톤'은 포켓몬별로 파일이 다 달라서(abomasite.png, absolite.png ...)
  // 단일 슬러그로 매핑 불가 - 아래 주석 참고
}

// 메가스톤은 종류가 매우 많고 포켓몬별로 이름이 다 달라서 단일 매핑이 불가능합니다.
// 필요하면 포켓몬 이름 -> 메가스톤 slug 매핑을 별도로 만들어야 해요.
// 예: 리자몽X -> charizardite-x, 리자몽Y -> charizardite-y, 갸라도스 -> gyaradosite ...