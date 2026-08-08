// scripts/download-mega-stones.mjs
//
// data/mega-evolutions.ts 의 stone(영문 slug)들을
// public/mega_stone_sprites/{slug}.png 로 받아둡니다.
//
// 실행: node scripts/download-mega-stones.mjs
//
// 출처: PokeAPI/sprites (https://github.com/PokeAPI/sprites) items 폴더.
// 정식 게임 내 아이템 아이콘이므로 저장/재배포 시 각자 프로젝트의 라이선스 정책을 확인하세요.

import { mkdir, writeFile, access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// mega-evolutions.ts에서 stone: 'slug' 형태를 정규식으로 뽑아옵니다.
async function extractStoneSlugs() {
  const filePath = path.resolve(__dirname, '../data/mega-evolutions.ts')
  const src = await readFile(filePath, 'utf-8')
  const slugs = [...src.matchAll(/stone:\s*'([^']+)'/g)].map((m) => m[1])
  return [...new Set(slugs)].sort()
}

const ITEM_SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items'
const OUT_DIR = path.resolve(__dirname, '../public/mega_stone_sprites')
const CONCURRENCY = 6

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function downloadOne(slug) {
  const outPath = path.join(OUT_DIR, `${slug}.png`)
  if (await exists(outPath)) {
    console.log(`  ↷ ${slug}.png (이미 있음, 스킵)`)
    return { slug, status: 'skipped' }
  }

  const url = `${ITEM_SPRITE_BASE}/${slug}.png`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  ✗ ${slug}.png 다운로드 실패 (HTTP ${res.status}) - ${url}`)
    return { slug, status: 'failed' }
  }

  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  console.log(`  ✓ ${slug}.png (${(buf.length / 1024).toFixed(1)} KB)`)
  return { slug, status: 'ok' }
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
  const slugs = await extractStoneSlugs()
  console.log(`메가스톤 스프라이트 ${slugs.length}개 다운로드 시작 → ${OUT_DIR}`)

  const results = await runPool(slugs, downloadOne, CONCURRENCY)

  const ok = results.filter((r) => r.status === 'ok').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed')

  console.log(`\n완료: 성공 ${ok} / 스킵 ${skipped} / 실패 ${failed.length}`)
  if (failed.length) {
    console.log('실패한 slug:', failed.map((f) => f.slug).join(', '))
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
