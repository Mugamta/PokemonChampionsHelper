// scripts/verify-data.mjs
//
// 생성된 게임 데이터(public/data)를 Serebii 의 포켓몬 챔피언스 데이터베이스와 대조한다.
// (공식 사이트는 전체 로스터/기술 수치를 공개하지 않고 게임 내에서만 보여주므로, 게임 데이터를 옮겨둔
//  Serebii 를 교차 검증용으로 쓴다. 공식 패치노트와 일치 여부는 사람이 따로 확인할 것)
//
// 실행: node scripts/verify-data.mjs            (기술/도구/로스터/메가 특성)
//       node scripts/verify-data.mjs --dex      (+ 포켓몬별 종족값·습득 기술·한국어 이름. 약 230페이지, 몇 분 걸림)
//       node scripts/verify-data.mjs --refresh  (캐시 무시)
//
// 다운로드한 HTML 은 scripts/.cache/serebii 에 캐시. HTML 은 신뢰할 수 없는 데이터이므로
// JavaScript 를 끈 브라우저(playwright)에서 표만 읽고, 외부 요청은 모두 차단한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'scripts', '.cache', 'serebii')
const REFRESH = process.argv.includes('--refresh')
const WITH_DEX = process.argv.includes('--dex')
const UA = 'Mozilla/5.0 (PokemonChampionsHelper data verification)'
const BASE = 'https://www.serebii.net'

const data = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'))
const P = data('pokemon.json')
const moves = data('moves.json')
const items = data('items.json')
const en = data('names.en.json')
const ko = data('names.ko.json')
const regs = data('regulations.json')
const current = regs[regs.length - 1]
const toID = (s) => s.toLowerCase().replace(/é/g, 'e').replace(/[^a-z0-9]/g, '')
const problems = []
// 확인 결과 Serebii 쪽 오류로 판단한 항목 (근거와 함께 기록)
const KNOWN = {
  'Double Shock 명중: 우리 100 / Serebii null': 'Serebii 는 필중(--) 표기, 게임위드·Showdown 은 명중 100 (2026-10-18 확인)',
}
const report = (title, all) => {
  const list = all.filter((x) => !KNOWN[x])
  for (const x of all.filter((y) => KNOWN[y])) console.log(`  (예외) ${x} — ${KNOWN[x]}`)
  console.log(`\n[${title}] ${list.length ? list.length + '건' : '일치'}`)
  for (const x of list.slice(0, 60)) console.log('  ' + x)
  if (list.length > 60) console.log(`  ... 외 ${list.length - 60}건`)
  if (list.length) problems.push(title)
}

async function get(urlPath, file) {
  const f = path.join(CACHE, file)
  if (!REFRESH && fs.existsSync(f)) return fs.readFileSync(f, 'utf8')
  const res = await fetch(BASE + urlPath, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${urlPath}`)
  const text = await res.text()
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, text)
  await new Promise((r) => setTimeout(r, 1200)) // Serebii 서버 부담 줄이기
  return text
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ javaScriptEnabled: false })
const page = await ctx.newPage()
await page.route('**/*', (r) => r.abort())
// 표 → 2차원 배열. 칸에 글자가 없으면 이미지 파일명들을 [img:파일명] 으로
async function tables(html) {
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  return page.evaluate(() =>
    [...document.querySelectorAll('table')].map((t) =>
      [...t.rows].map((r) =>
        [...r.cells].map((c) => {
          const txt = c.innerText.replace(/\s+/g, ' ').trim()
          return txt || [...c.querySelectorAll('img')].map((i) => `[img:${(i.getAttribute('src') || '').split('/').pop()}]`).join('')
        }),
      ),
    ),
  )
}
const imgs = (s) => (s.match(/img:([a-z0-9-]+)\./g) || []).map((x) => x.slice(4, -1))

// ── 기술 ─────────────
{
  const t = (await tables(await get('/pokemonchampions/moves.shtml', 'moves.html'))).find((x) => x[0]?.[0] === 'Name' && x[0]?.[3] === 'PP')
  const CAT = { physical: 'physical', special: 'special', other: 'status' }
  const diff = []
  const seen = new Set()
  for (const [name, type, cat, pp, bp, acc] of t.slice(1)) {
    const id = toID(name)
    seen.add(id)
    const m = moves[id]
    if (!m) continue // Serebii 목록에는 있지만 아무 포켓몬도 배우지 않는 기술(발버둥 등)
    const sAcc = acc === '101' || acc === '--' ? null : Number(acc)
    const checks = [
      ['타입', m.type, imgs(type)[0]],
      ['분류', m.category, CAT[imgs(cat)[0]]],
      ['PP', m.pp, Number(pp)],
      ['위력', m.power, bp === '--' ? 0 : Number(bp)],
      ['명중', m.accuracy, sAcc],
    ]
    for (const [k, ours, theirs] of checks) if (theirs !== undefined && ours !== theirs) diff.push(`${name} ${k}: 우리 ${ours} / Serebii ${theirs}`)
  }
  report('기술 수치 (타입·분류·PP·위력·명중)', diff)
  report('우리에게만 있는 기술', Object.keys(moves).filter((id) => !seen.has(id)).map((id) => en.moves[id]))
}

// ── 도구 ─────────────
{
  const ts = (await tables(await get('/pokemonchampions/items.shtml', 'items.html'))).filter((x) => x[0]?.[1] === 'Name')
  const names = ts.slice(0, 3).flatMap((t) => t.slice(1).map((r) => r[1])) // 지닌 도구 / 메가스톤 / 열매
  const ids = new Set(names.map(toID))
  report('Serebii에만 있는 도구', names.filter((n) => !items[toID(n)]))
  report('우리에게만 있는 도구', Object.keys(items).filter((id) => !ids.has(id)).map((id) => en.items[id]))
}

// ── 로스터 (현재 레귤레이션 + 메가) / 타입 ─────────────
// Serebii 는 리전폼·메가·영원의꽃만 그림 이름(-a -g -h -p -m -mx -my -mz -e)으로 구분하고 나머지 폼은 한 종으로 묶는다
{
  const keyOf = (p) => {
    const f = p.forme
    const s = /Mega-?X$/.test(f) ? 'mx' : /Mega-?Y$/.test(f) ? 'my' : /Mega-?Z$/.test(f) ? 'mz' : /Mega/.test(f) ? 'm'
      : /^Alola/.test(f) ? 'a' : /^Galar/.test(f) ? 'g' : /^Hisui/.test(f) ? 'h' : /^Paldea/.test(f) ? 'p' : f === 'Eternal' ? 'e' : ''
    return `${p.num}${s ? '-' + s : ''}`
  }
  const ours = new Map()
  const add = (id) => ours.set(keyOf(P[id]), [...(ours.get(keyOf(P[id])) || []), id])
  for (const id of current.pokemon) { add(id); for (const m of P[id]?.megas || []) add(m) }
  const t = (await tables(await get('/pokemonchampions/pokemon.shtml', 'pokemon.html'))).find((x) => x[0]?.[2] === 'Name' && x[0]?.[3] === 'Type')
  const theirs = new Map()
  const typeDiff = []
  for (const [, pic, name, type] of t.slice(1)) {
    const m = pic.match(/img:(\d+)(?:-([a-z0-9]+))?\./)
    const k = `${Number(m[1])}${m[2] ? '-' + m[2] : ''}`
    theirs.set(k, name)
    const st = imgs(type).join('/')
    const ids = ours.get(k) || []
    if (ids.length && !ids.some((id) => P[id].types.join('/') === st)) typeDiff.push(`${name}: 우리 ${ids.map((i) => P[i].types.join('/')).join(' | ')} / Serebii ${st}`)
  }
  report(`Serebii 로스터에만 있음 (우리 기준 레귤레이션 ${current.id})`, [...theirs].filter(([k]) => !ours.has(k)).map(([k, n]) => `${n} (${k})`))
  report('우리 로스터에만 있음', [...ours].filter(([k]) => !theirs.has(k)).map(([k, ids]) => `${ids.map((i) => en.pokemon[i]).join('/')} (${k})`))
  report('타입', typeDiff)
}

// ── 메가진화 특성 (챔피언스 신규·변경) ─────────────
{
  const t = (await tables(await get('/pokemonchampions/megaabilities.shtml', 'megaabilities.html'))).find((x) => x[0]?.[2] === 'Name')
  const byName = Object.fromEntries(Object.entries(en.pokemon).map(([id, n]) => [toID(n), id]))
  const diff = []
  for (const [, , name, type, ability] of t.slice(1)) {
    const id = byName[toID(name)]
    if (!id) { diff.push(`${name}: 우리 데이터에 없음`); continue }
    if (!P[id].abilities.includes(toID(ability))) diff.push(`${name} 특성: 우리 ${P[id].abilities} / Serebii ${ability}`)
    if (imgs(type).join('/') !== P[id].types.join('/')) diff.push(`${name} 타입: 우리 ${P[id].types.join('/')} / Serebii ${imgs(type).join('/')}`)
  }
  report('메가진화 특성·타입', diff)
}

// ── 포켓몬별 (종족값 / 습득 기술 / 한국어 이름) ─────────────
if (WITH_DEX) {
  const roster = await get('/pokemonchampions/pokemon.shtml', 'pokemon.html')
  const links = [...new Set([...roster.matchAll(/href="(\/pokedex-champions\/[^"/]+\/)"/g)].map((m) => m[1]))]
  const byNum = {}
  for (const id of current.pokemon) (byNum[P[id].num] ||= []).push(id)
  for (const id of Object.keys(P)) if (P[id].mega && byNum[P[id].num]) byNum[P[id].num].push(id)
  const moveByName = Object.fromEntries(Object.entries(en.moves).map(([id, n]) => [toID(n), id]))
  const stats = []
  const koName = []
  const learn = []
  for (const link of links) {
    const file = 'dex/' + link.split('/')[2].replace(/['.]/g, '') + '.html'
    const t = await tables(await get(link.replace(/'/g, '%27'), file))
    const head = t.find((x) => x[0]?.[0] === 'Name' && /National/.test(x[1]?.[2] || ''))
    if (!head) continue
    const num = Number(head[1][2].match(/#(\d+)/)[1])
    const ids = byNum[num] || []
    if (!ids.length) continue
    const baseId = ids.find((i) => !P[i].forme) || ids[0]
    const korean = head[1][1].match(/Korean: (\S+)/)?.[1]
    // 기본 폼이 레귤레이션에 없는 종(영원의 꽃 플라엣테 등)은 우리 쪽 이름에 폼 표기가 붙으므로 비교 생략
    if (korean && !P[baseId].forme && korean !== ko.pokemon[baseId]) koName.push(`${en.pokemon[baseId]}: 우리 ${ko.pokemon[baseId]} / Serebii ${korean}`)
    const ourStats = ids.map((i) => Object.values(P[i].stats).join('/'))
    // 배틀 중에만 바뀌는 폼(킬가르도 블레이드폼 등)은 우리 데이터에 없으므로 제외
    for (const st of t.filter((x) => /^Stats/.test(x[0]?.[0] || '') && !/Blade|Zen Mode|Hangry|Hero/.test(x[0]?.[0] || ''))) {
      const row = st.find((r) => /^Base Stats/.test(r[0] || ''))
      if (!row) continue
      const s = row.slice(1, 7).map(Number).join('/')
      if (!ourStats.includes(s)) stats.push(`#${num} ${st[0][0]}: Serebii ${s} / 우리 ${ids.map((i, k) => `${i}=${ourStats[k]}`).join(', ')}`)
    }
    // 기술 표는 폼별로 따로 있다: "Standard Moves", "Standard Moves - Female", "- Midnight Form", "- Eternal Floette" ...
    // 표 제목의 폼 이름으로 우리 폼을 골라 1:1 비교
    const nonMega = ids.filter((i) => !P[i].mega)
    const formFor = (suffix) => {
      const s = suffix.toLowerCase()
      if (!s || s === 'male') return nonMega.find((i) => !P[i].forme) || nonMega[0]
      if (s === 'female') return nonMega.find((i) => P[i].forme === 'F')
      return nonMega.find((i) => P[i].forme && P[i].forme.toLowerCase().split('-').some((tok) => tok.length > 2 && s.includes(tok) && !['paldea', 'alola', 'galar', 'hisui'].includes(tok)))
    }
    for (const mt of t.filter((x) => /^Standard Moves/.test(x[0]?.[0] || '') && x[1]?.[0] === 'Attack Name')) {
      const suffix = (mt[0][0].match(/^Standard Moves(?: - (.+))?$/)?.[1] || '').trim()
      const id = formFor(suffix)
      if (!id) { learn.push(`${en.pokemon[baseId]} "${mt[0][0]}": 대응하는 폼 없음`); continue }
      const theirs = new Set(mt.slice(2).filter((r) => r[0] && r.length > 3).map((r) => moveByName[toID(r[0])] || '?' + r[0]))
      const ours = new Set(P[id].learnset || [])
      const onlyThem = [...theirs].filter((m) => !ours.has(m)).map((m) => en.moves[m] || m)
      const onlyUs = [...ours].filter((m) => !theirs.has(m)).map((m) => en.moves[m] || m)
      if (onlyThem.length || onlyUs.length) {
        learn.push(`${en.pokemon[id]}: ${onlyThem.length ? 'Serebii에만 ' + onlyThem.join(', ') : ''}${onlyThem.length && onlyUs.length ? ' / ' : ''}${onlyUs.length ? '우리에게만 ' + onlyUs.join(', ') : ''}`)
      }
    }
  }
  report('종족값', stats)
  report('한국어 이름 (기본 폼)', koName)
  report('습득 기술', learn)
}

await browser.close()
console.log(problems.length ? `\n차이가 있는 항목: ${problems.join(', ')}` : '\n모든 항목 일치')
