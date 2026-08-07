// scripts/download-mega-sprites.mjs
//
// data/mega-evolutions.ts 에 정의된 모든 메가진화의 스프라이트를
// public/pokemon_sprites/{id}.png 로 받아둡니다.
//
// 실행: node scripts/download-mega-sprites.mjs
//
// 출처: PokeAPI/sprites (https://github.com/PokeAPI/sprites) - PokeAPI 프로젝트가
// 공개 배포하는 스프라이트 리포지토리. 정식 게임 내 아이콘 이미지이므로
// 저장/재배포 시 각자 프로젝트의 라이선스 정책을 확인하세요.

import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// mega-evolutions.ts에서 { id: 숫자 } 형태를 정규식으로 뽑아옵니다.
// (ts-node 없이 순수 node로 돌리기 위한 간단한 파싱 방식)
async function extractIds() {
  const { readFile } = await import('node:fs/promises')
  const filePath = path.resolve(__dirname, '../data/mega-evolutions.ts')
  const src = await readFile(filePath, 'utf-8')
  const ids = [...src.matchAll(/id:\s*(\d+)/g)].map((m) => Number(m[1]))
  return [...new Set(ids)].sort((a, b) => a - b)
}

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const OUT_DIR = path.resolve(__dirname, '../public/pokemon_sprites')
const CONCURRENCY = 6

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function downloadOne(id) {
  const outPath = path.join(OUT_DIR, `${id}.png`)
  if (await exists(outPath)) {
    console.log(`  ↷ ${id}.png (이미 있음, 스킵)`)
    return { id, status: 'skipped' }
  }

  const url = `${SPRITE_BASE}/${id}.png`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  ✗ ${id}.png 다운로드 실패 (HTTP ${res.status}) - ${url}`)
    return { id, status: 'failed' }
  }

  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  console.log(`  ✓ ${id}.png (${(buf.length / 1024).toFixed(1)} KB)`)
  return { id, status: 'ok' }
}

async function runPool(items, worker, concurrency) {
  const results = []
  let i = 0
  async function next() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await worker(items[idx])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next))
  return results
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const ids = await extractIds()
  console.log(`메가진화 스프라이트 ${ids.length}개 다운로드 시작 → ${OUT_DIR}`)

  const results = await runPool(ids, downloadOne, CONCURRENCY)

  const ok = results.filter((r) => r.status === 'ok').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed')

  console.log(`\n완료: 성공 ${ok} / 스킵 ${skipped} / 실패 ${failed.length}`)
  if (failed.length) {
    console.log('실패한 id:', failed.map((f) => f.id).join(', '))
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
