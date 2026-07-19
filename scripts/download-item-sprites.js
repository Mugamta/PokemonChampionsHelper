// scripts/download-item-sprites.js
// data/item-sprites.ts의 매핑을 기준으로 PokeAPI 아이템 스프라이트를
// public/item_sprites/{한글이름}.png 로 다운로드합니다.
// 매 빌드마다 자동 실행하지 않는 "수동 1회성" 스크립트입니다.
// 실행: node scripts/download-item-sprites.js

import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// ts 파일을 그대로 node에서 못 읽으므로, item-sprites.ts의 ItemSpriteSlug 객체를
// 이 스크립트 안에도 동일하게 복사해서 씁니다. item-sprites.ts를 수정하면 여기도 같이 수정하세요.
const ItemSpriteSlug = {
  '구애머리띠': 'choice-band',
  '구애안경': 'choice-specs',
  '구애스카프': 'choice-scarf',
  '진화의휘석': 'eviolite',
  '돌격조끼': 'assault-vest',
  '기합의띠': 'focus-sash',
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
  '버치열매': 'cheri-berry',
  '유루열매': 'chesto-berry',
  '복슝열매': 'pecha-berry',
  '복분열매': 'rawst-berry',
  '배리열매': 'aspear-berry',
  '시몬열매': 'persim-berry',
  '시마열매': 'kelpsy-berry',
  '리샘열매': 'lum-berry',
  '과사열매': 'leppa-berry',
  '오랭열매': 'oran-berry',
  '자뭉열매': 'sitrus-berry',
  '카리열매': 'chilan-berry',
  '오카열매': 'occa-berry',
  '꼬시개열매': 'passho-berry',
  '초나열매': 'wacan-berry',
  '린드열매': 'rindo-berry',
  '플카열매': 'yache-berry',
  '로플열매': 'chople-berry',
  '으름열매': 'kebia-berry',
  '슈캐열매': 'shuca-berry',
  '바코열매': 'coba-berry',
  '야파열매': 'payapa-berry',
  '리체열매': 'tanga-berry',
  '루미열매': 'charti-berry',
  '수불열매': 'kasib-berry',
  '하반열매': 'haban-berry',
  '마코열매': 'colbur-berry',
  '바리비열매': 'babiri-berry',
  '로셀열매': 'roseli-berry',
  '초점렌즈': 'scope-lens',
  '전기구슬': 'light-ball',
}

const OUT_DIR = join(process.cwd(), 'public', 'item_sprites')
const CONCURRENCY = 10

const spriteUrl = (slug) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`

async function downloadOne(koreanName, slug) {
  const filePath = join(OUT_DIR, `${koreanName}.png`)
  if (existsSync(filePath)) {
    return { koreanName, status: 'skip' }
  }

  try {
    const res = await fetch(spriteUrl(slug))
    if (!res.ok) {
      return { koreanName, slug, status: 'missing' }
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    await writeFile(filePath, buffer)
    return { koreanName, status: 'downloaded' }
  } catch (err) {
    return { koreanName, status: 'error', error: err.message }
  }
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const entries = Object.entries(ItemSpriteSlug)
  const results = []
  let cursor = 0

  const worker = async () => {
    while (cursor < entries.length) {
      const [koreanName, slug] = entries[cursor++]
      results.push(await downloadOne(koreanName, slug))
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const downloaded = results.filter((r) => r.status === 'downloaded').length
  const skipped = results.filter((r) => r.status === 'skip').length
  const missing = results.filter((r) => r.status === 'missing')
  const errored = results.filter((r) => r.status === 'error')

  console.log(`\n[download-item-sprites] 완료`)
  console.log(`  새로 받음: ${downloaded}`)
  console.log(`  이미 있어서 건너뜀: ${skipped}`)
  if (missing.length > 0) {
    console.log(`  slug 틀렸거나 없는 파일(404): ${missing.length}개`)
    missing.forEach((m) => console.log(`    - ${m.koreanName} (${m.slug})`))
  }
  if (errored.length > 0) {
    console.log(`  에러: ${errored.length}개`)
  }
}

main()