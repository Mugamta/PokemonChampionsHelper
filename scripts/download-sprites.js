// scripts/download-sprites.js
// PokeAPI 공개 스프라이트를 public/pokemon_sprites/{id}.png 로 다운로드합니다.
// 매 빌드마다 자동 실행하지 않는 "수동 1회성" 스크립트입니다.
// 다운받은 결과물(public/pokemon_sprites/)은 git에 커밋해서 같이 배포하세요.
//
// 실행: node scripts/download-sprites.js
// 이미 있는 파일은 건너뛰므로, 나중에 도감번호 범위를 늘리거나 빠진 것만
// 다시 받고 싶을 때 다시 실행해도 안전합니다.

import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT_DIR = join(process.cwd(), 'public', 'pokemon_sprites')
const START_ID = 1
const END_ID = 1023
const CONCURRENCY = 20

const spriteUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

async function downloadOne(id) {
  const filePath = join(OUT_DIR, `${id}.png`)
  if (existsSync(filePath)) {
    return { id, status: 'skip' }
  }

  try {
    const res = await fetch(spriteUrl(id))
    if (!res.ok) {
      return { id, status: 'missing' }
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    await writeFile(filePath, buffer)
    return { id, status: 'downloaded' }
  } catch (err) {
    return { id, status: 'error', error: err.message }
  }
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const ids = []
  for (let i = START_ID; i <= END_ID; i++) ids.push(i)

  const results = []
  let cursor = 0

  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++]
      const result = await downloadOne(id)
      results.push(result)
      if (result.status === 'downloaded' && result.id % 50 === 0) {
        console.log(`[download-sprites] 진행 중... ${result.id}/${END_ID}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const downloaded = results.filter((r) => r.status === 'downloaded').length
  const skipped = results.filter((r) => r.status === 'skip').length
  const missing = results.filter((r) => r.status === 'missing').length
  const errored = results.filter((r) => r.status === 'error')

  console.log(`\n[download-sprites] 완료`)
  console.log(`  새로 받음: ${downloaded}`)
  console.log(`  이미 있어서 건너뜀: ${skipped}`)
  console.log(`  해당 번호 스프라이트 없음(404): ${missing}`)
  if (errored.length > 0) {
    console.log(`  에러: ${errored.length}개`)
    errored.forEach((e) => console.log(`    - id ${e.id}: ${e.error}`))
  }
}

main()