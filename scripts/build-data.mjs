// scripts/build-data.mjs
//
// 게임 데이터 빌드 스크립트. 아래 소스를 받아서 영어 id를 키로 쓰는 JSON을 public/data/ 에 생성한다.
//   - Pokemon Showdown (smogon/pokemon-showdown) data/mods/champions + data/
//       → 출전 가능 포켓몬/폼/메가, 타입, 종족값, 특성, 습득 기술, 기술 수치, 도구, 성격, 타입 상성
//   - PokeAPI CSV (PokeAPI/pokeapi data/v2/csv) → ko/ja/en 이름과 설명
//   - 챔피언스 PP = Showdown 챔피언스 모드의 기본 PP 를 5→8, 10→12, 15→16, 20 이상→20 으로 변환 (1 은 그대로)
//     (Serebii 챔피언스 기술 목록 512개와 전부 일치 확인, 2026-10-18). 예외는 scripts/sources/champions-pp.json 으로 덮어씀
//   - scripts/sources/item-names-ko.json → PokeAPI에 한국어 이름이 없는 도구(챔피언스 신규 메가스톤 등)
//   - scripts/sources/regulation/*.json (도감코드 목록, index.json 에 파일명 등록) → 레귤레이션별 출전 가능 포켓몬
//
// 실행:  node scripts/build-data.mjs            (데이터만)
//        node scripts/build-data.mjs --sprites  (+ Bulbagarden Archives 에서 포챔스 메뉴/가방 스프라이트 다운로드)
//        node scripts/build-data.mjs --refresh  (캐시 무시하고 소스 다시 받기)
//
// 소스 캐시: scripts/.cache/ (git 무시). Showdown TS 파일은 esbuild로 변환 후 vm 샌드박스에서
// 객체 리터럴만 평가한다 (기술/도구의 이벤트 함수는 실행하지 않음).

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = path.join(ROOT, 'scripts', '.cache')
const OUT = path.join(ROOT, 'public', 'data')
const SPRITES = path.join(ROOT, 'public', 'sprites')
const REFRESH = process.argv.includes('--refresh')
const WITH_SPRITES = process.argv.includes('--sprites')
const UA = 'PokemonChampionsHelper/1.0 (non-commercial fan tool)'
const LANGS = { ko: '3', ja: '11', en: '9' } // PokeAPI local_language_id
const JA_KANA = '1' // ja-Hrkt (일부 데이터는 ja 대신 이쪽에만 있음)

const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const toID = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
const warn = []

// ── 소스 다운로드 ─────────────
const SD = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data'
const PA = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'

// fixed = 커밋을 고정한 주소 (내용이 바뀌지 않으므로 --refresh 에도 다시 받지 않음)
async function cached(url, name, fixed = false) {
  const file = path.join(CACHE, name)
  if ((!REFRESH || fixed) && fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const text = await res.text()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return text
}

// sha 를 주면 그 커밋 시점의 파일 (지난 레귤레이션 데이터)
async function loadSD(rel, sha) {
  const src = sha
    ? await cached(
        `https://raw.githubusercontent.com/smogon/pokemon-showdown/${sha}/data/${rel}`,
        `showdown@${sha.slice(0, 10)}/${rel}`,
        true,
      )
    : await cached(`${SD}/${rel}`, `showdown/${rel}`)
  const js = esbuild.transformSync(src, { loader: 'ts', format: 'cjs' }).code
  const ctx = { exports: {}, module: { exports: {} } }
  ctx.module.exports = ctx.exports
  vm.runInNewContext(js, ctx, { timeout: 10000 })
  return Object.values(ctx.module.exports)[0]
}

async function loadCSV(name) {
  const text = await cached(`${PA}/${name}.csv`, `pokeapi/${name}.csv`)
  const rows = []
  // 설명문에 따옴표/쉼표/줄바꿈이 들어있으므로 간단한 RFC4180 파서 사용
  let row = [],
    field = '',
    q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') q = false
      else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [head, ...body] = rows
  return body
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

// ── 1. 소스 로드 ─────────────
console.log('소스 로드 중...')
// 포켓몬·기술·도구를 만드는 데 쓰는 Showdown 소스 한 벌 (sha 없으면 최신, 있으면 그 커밋 시점)
async function loadShowdownSet(sha) {
  const [dex, baseMoves, champMoves, baseItems, champItems, champFormats, learnsets] =
    await Promise.all([
      loadSD('pokedex.ts', sha),
      loadSD('moves.ts', sha),
      loadSD('mods/champions/moves.ts', sha),
      loadSD('items.ts', sha),
      loadSD('mods/champions/items.ts', sha),
      loadSD('mods/champions/formats-data.ts', sha),
      loadSD('mods/champions/learnsets.ts', sha),
    ])
  const moveData = (id) => merged(baseMoves, champMoves, id)
  const itemData = (id) => merged(baseItems, champItems, id)
  return {
    dex,
    champFormats,
    learnsets,
    moveData,
    itemData,
    baseItems,
    isLegalMove: (id) => {
      const m = moveData(id)
      return !!m && !m.isNonstandard
    },
    isLegalItem: (id) => {
      const m = itemData(id)
      return !!m && !m.isNonstandard
    },
  }
}
const merged = (base, mod, id) => {
  if (!base[id] && !mod[id]) return null
  const o = { ...(base[id] || {}) }
  for (const [k, v] of Object.entries(mod[id] || {})) if (k !== 'inherit') o[k] = v
  return o
}
const MASTER = await loadShowdownSet()
const { dex, moveData, itemData } = MASTER
const [natures, typechart] = await Promise.all([loadSD('natures.ts'), loadSD('typechart.ts')])
const baseAbilities = await loadSD('abilities.ts')
const csv = {}
for (const n of [
  'pokemon_species',
  'pokemon_species_names',
  'pokemon',
  'pokemon_forms',
  'pokemon_form_names',
  'moves',
  'move_names',
  'move_flavor_text',
  'abilities',
  'ability_names',
  'ability_flavor_text',
  'items',
  'item_names',
  'item_flavor_text',
  'types',
  'type_names',
  'natures',
  'nature_names',
  'version_groups',
])
  csv[n] = await loadCSV(n)

// PokeAPI identifier → id 맵 + 다국어 이름/설명 헬퍼
const byLang = (rows, key, nameKey = 'name') => {
  const out = {}
  for (const r of rows) {
    for (const [lang, lid] of Object.entries(LANGS)) {
      if (r.local_language_id === lid || (lang === 'ja' && r.local_language_id === JA_KANA)) {
        out[r[key]] ??= {}
        if (r.local_language_id === lid || !out[r[key]][lang]) out[r[key]][lang] = r[nameKey]
      }
    }
  }
  return out
}
// 설명문: 가장 최근 버전그룹의 텍스트 사용
const vgOrder = Object.fromEntries(csv.version_groups.map((v) => [v.id, Number(v.order)]))
const flavorByLang = (rows, key) => {
  const best = {}
  for (const r of rows) {
    const lang = Object.entries(LANGS).find(([, lid]) => lid === r.language_id)?.[0]
    if (!lang) continue
    const ord = vgOrder[r.version_group_id] ?? 0
    const cur = (best[r[key]] ??= {})[lang]
    if (!cur || ord > cur.ord)
      best[r[key]][lang] = {
        ord,
        text: r.flavor_text
          .replace(/\s*\n\s*/g, ' ')
          .replace(/\f/g, ' ')
          .trim(),
      }
  }
  for (const v of Object.values(best)) for (const l in v) v[l] = v[l].text
  return best
}
const apiIdent = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.identifier]))

// ── 2. 레귤레이션 → 출전 가능 포켓몬 id ─────────────
// 기존 형식("0026-001")을 Showdown id로 변환. 폼 번호는 baseSpecies.otherFormes 순서(1부터).
// 공식 폼 번호가 이 규칙과 다른 경우만 아래 표로 고정.
const CODE_OVERRIDES = {
  '0666-018': 'vivillon',
  '0670-005': 'floetteeternal',
  '0678-001': 'meowsticf',
}
const byNum = {}
for (const [id, s] of Object.entries(dex))
  if (!s.forme || s.baseSpecies === s.name) byNum[s.num] ??= id
const codeToId = (code) => {
  if (CODE_OVERRIDES[code]) return CODE_OVERRIDES[code]
  const [num, form] = code.split('-').map(Number)
  const base = byNum[num]
  if (!base) return null
  if (!form) return base
  const f = dex[base].otherFormes?.[form - 1]
  return f ? toID(f) : null
}
const regIndex = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/sources/regulation/index.json'), 'utf8'),
)
const regulations = []
for (const file of regIndex) {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/sources/regulation', file), 'utf8'))
  const ids = []
  for (const code of r.pokemon_list) {
    const id = codeToId(code)
    if (!id || !dex[id]) warn.push(`레귤레이션 ${file}: 변환 실패 ${code}`)
    else ids.push(id)
  }
  const [start, end] = r.period.split('~').map((s) => s.trim())
  regulations.push({
    id: file.replace('.json', ''),
    start,
    end,
    rules: r.rules,
    pokemon: [...new Set(ids)].sort(),
    // 이 레귤레이션에서 처음 쓸 수 있게 된 메가스톤 (원종은 이전부터 있던 경우도 성능표 "신규"로 표시)
    newMegaStones: r.new_mega_stones ?? [],
    ...(r.version && { version: r.version }),
    // 지난 레귤레이션: 그 기간 마지막 상태의 Showdown 커밋 (없으면 최신 = 진행 중인 레귤레이션)
    ...(r.showdown_commit && { showdown: r.showdown_commit }),
  })
}

// ── 3. 포켓몬 ─────────────
// 포켓몬·기술·도구는 Showdown 소스 한 벌(src)에서 만든다. 최신 소스로 만든 것이 앱의 기본 데이터이고,
// 지난 레귤레이션은 그 기간 커밋의 소스로 같은 계산을 해서 기본과 다른 부분만 patch 로 넣는다 (아래 5.5)
const inReg = new Set(regulations.flatMap((r) => r.pokemon))
const STAT = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' }
// 배틀 중에만 바뀌는 폼. 슬롯에서는 고를 수 없고 계산과 폼 토글에만 쓴다 (캐스퐁은 날씨로 타입만 바뀌어서 계산에서 처리)
//   팔라피 마이티폼: 한 번 교체해 들어오면 마이티폼 / 킬가르도 블레이드폼: 공격기를 쓸 때 / 모르페코 배고픈모양
const BATTLE_FORMS = {
  palafin: 'palafinhero',
  aegislash: 'aegislashblade',
  morpeko: 'morpekohangry', // 배고픈모양: 매 턴 끝에 바뀜, 오라휠 타입만 다름 (종족값 같음)
  mimikyu: 'mimikyubusted', // 둔갑이 풀린 모습: 첫 공격을 막은 뒤 (종족값 같음)
}

function buildPokemon(src, roster, label) {
  const { dex, champFormats, learnsets, itemData, isLegalMove, isLegalItem } = src
  const regNums = new Set([...roster].filter((id) => dex[id]).map((id) => dex[id].num))
  const isFormatLegal = (id) =>
    champFormats[id] && !champFormats[id].isNonstandard && champFormats[id].tier !== 'Illegal'
  // 메가: 챔피언스에서 합법 + 원종 도감번호가 어느 레귤레이션에 있음 + 필요한 메가스톤이 도구로 존재
  const megaIds = Object.keys(dex).filter((id) => {
    const s = dex[id]
    return (
      /Mega/.test(s.forme || '') &&
      isFormatLegal(id) &&
      regNums.has(s.num) &&
      (!s.requiredItem || isLegalItem(toID(s.requiredItem)))
    )
  })
  // 습득 기술: Showdown 검증기(learnsetParent)와 같은 규칙. 자기 습득표가 없는 폼은 원종 것,
  // 원종에서 바뀌는 폼(changesFrom: 로토무 가전 폼 등)은 자기 것 + 원종 것
  const learnsetOf = (id) => {
    const out = new Set()
    const seen = new Set()
    let found = false
    let cur = dex[id]
    while (cur && !seen.has(toID(cur.name))) {
      const k = toID(cur.name)
      seen.add(k)
      const ls = learnsets[k]?.learnset
      if (ls) {
        found = true
        for (const m of Object.keys(ls)) out.add(m)
        if (cur.changesFrom && cur.baseSpecies !== 'Kyurem') {
          cur = dex[toID(cur.changesFrom)]
          continue
        }
        break
      }
      if (!cur.forme) break
      cur = dex[toID(cur.changesFrom || cur.baseSpecies)]
    }
    if (!found) warn.push(`${label}습득 기술 없음: ${id}`)
    return [...out].filter(isLegalMove).sort()
  }
  const pokemon = {}
  for (const id of [...roster, ...megaIds].sort()) {
    const s = dex[id]
    if (!s) {
      warn.push(`${label}포켓몬 데이터 없음: ${id}`)
      continue
    }
    const isMega = megaIds.includes(id)
    // 메가의 원종: 메가스톤 데이터에서 이 메가로 바뀌는 종을 찾는다 (메가냐오닉스처럼 성별별 원종이 다른 경우 대비)
    const stoneMap = isMega && s.requiredItem ? itemData(toID(s.requiredItem))?.megaStone : null
    const stoneFrom = stoneMap && Object.entries(stoneMap).find(([, to]) => toID(to) === id)?.[0]
    const base = toID(stoneFrom || s.changesFrom || s.baseSpecies)
    pokemon[id] = {
      id,
      num: s.num,
      base: s.forme ? base : id,
      forme: s.forme || '',
      types: s.types.map(toID),
      stats: Object.fromEntries(Object.entries(s.baseStats).map(([k, v]) => [STAT[k], v])),
      abilities: [...new Set(Object.values(s.abilities).map(toID))],
      weight: s.weightkg,
      // 성별이 정해진 종만 (M 수컷만 / F 암컷만 / N 무성). 없으면 둘 다 가능 → 슬롯에서 고름
      ...(s.gender && { gender: s.gender }),
      ...(isMega
        ? { mega: { from: base, item: toID(s.requiredItem) } }
        : { learnset: learnsetOf(id) }),
    }
  }
  for (const [from, id] of Object.entries(BATTLE_FORMS)) {
    if (!pokemon[from]) continue
    const s = dex[id]
    if (!s) {
      warn.push(`${label}배틀 폼 없음: ${id}`)
      continue
    }
    pokemon[id] = {
      id,
      num: s.num,
      base: from,
      forme: s.forme,
      types: s.types.map(toID),
      stats: Object.fromEntries(Object.entries(s.baseStats).map(([k, v]) => [STAT[k], v])),
      abilities: [...new Set(Object.values(s.abilities).map(toID))],
      weight: s.weightkg,
      battleForm: { from },
    }
    pokemon[from].battleForm = { to: id }
  }
  for (const id of megaIds) {
    const from = pokemon[id].mega.from
    // 원종이 레귤레이션에 직접 없을 수도 있음(예: floette → floetteeternal). 같은 도감번호 폼에 연결
    const target = pokemon[from]
      ? from
      : Object.keys(pokemon).find((k) => pokemon[k].num === pokemon[id].num && !pokemon[k].mega)
    if (!target) {
      warn.push(`${label}메가 원종 없음: ${id}`)
      continue
    }
    pokemon[id].mega.from = target
    ;(pokemon[target].megas ??= []).push(id)
  }
  return { pokemon, megaIds }
}
const { pokemon, megaIds } = buildPokemon(MASTER, inReg, '')

// ── 4. 기술 ─────────────
// 챔피언스 PP 예외 (보통 비어 있음): scripts/sources/champions-pp.json ({ id: pp } 또는 { id: { pp, estimated: true } })
const champPP = {}
for (const [id, v] of Object.entries(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/sources/champions-pp.json'), 'utf8')),
)) {
  champPP[id] = typeof v === 'number' ? { pp: v, estimated: false } : v
}
const moveIdent = apiIdent(csv.moves)
const moveNames = byLang(csv.move_names, 'move_id')
// 챔피언스 PP 는 8/12/16/20 네 단계 (포인트업 없음). 희망사항·힘흡수 등 챔피언스에서 바뀐 기술은 Showdown 기본 PP 에 이미 반영돼 있다
const championsPP = (basePP) =>
  basePP <= 1 ? basePP : basePP <= 5 ? 8 : basePP <= 10 ? 12 : basePP <= 15 ? 16 : 20

const WEATHER = {
  sunnyday: 'sun',
  raindance: 'rain',
  sandstorm: 'sand',
  snowscape: 'snow',
  hail: 'snow',
}
const TERRAIN = {
  electricterrain: 'electric',
  grassyterrain: 'grassy',
  mistyterrain: 'misty',
  psychicterrain: 'psychic',
}
const HAZARD_STACK = { spikes: 3, toxicspikes: 2 }
// 맞히면 상대 필드에 설치기를 까는 공격기 (Showdown 은 onAfterHit 콜백이라 sideCondition 으로 안 잡힘)
const HIT_HAZARD = { stoneaxe: 'stealthrock', ceaselessedge: 'spikes' }
const FLAGS = [
  'contact',
  'punch',
  'bite',
  'slicing',
  'sound',
  'pulse',
  'bullet',
  'wind',
  'powder',
  'charge',
  'futuremove',
  'noparentalbond',
  'reflectable',
  'bypasssub',
]
// 기술이 상대에게 거는 특수 상태 중 배틀 화면에서 다루는 것 (확률·확정 모두)
const VOLATILES = new Set([
  'flinch',
  'confusion',
  'taunt',
  'encore',
  'torment',
  'disable',
  'attract',
  'healblock',
  'partiallytrapped',
  'octolock',
  'saltcure',
])
const ratio = (a) => (Array.isArray(a) ? a[0] / a[1] : undefined)

function moveEffects(m) {
  const e = []
  const selfTarget = ['self', 'allySide', 'allies', 'adjacentAllyOrSelf'].includes(m.target)
  if (m.boosts) e.push({ type: 'boost', target: selfTarget ? 'self' : 'target', stats: m.boosts })
  if (m.self?.boosts) e.push({ type: 'boost', target: 'self', stats: m.self.boosts })
  if (m.selfBoost?.boosts) e.push({ type: 'boost', target: 'self', stats: m.selfBoost.boosts })
  if (m.status) e.push({ type: 'status', target: 'target', status: m.status })
  if (VOLATILES.has(m.volatileStatus))
    e.push({ type: 'volatile', target: 'target', status: m.volatileStatus })
  for (const sec of [m.secondary, ...(m.secondaries || [])].filter(Boolean)) {
    const chance = sec.chance ?? 100
    if (sec.boosts) e.push({ type: 'boost', target: 'target', stats: sec.boosts, chance })
    if (sec.self?.boosts) e.push({ type: 'boost', target: 'self', stats: sec.self.boosts, chance })
    if (sec.status) e.push({ type: 'status', target: 'target', status: sec.status, chance })
    if (VOLATILES.has(sec.volatileStatus))
      e.push({ type: 'volatile', target: 'target', status: sec.volatileStatus, chance })
  }
  if (m.multihit)
    e.push({ type: 'multihit', min: [].concat(m.multihit)[0], max: [].concat(m.multihit).at(-1) })
  if (m.recoil) e.push({ type: 'recoil', ratio: ratio(m.recoil) })
  if (m.drain) e.push({ type: 'drain', ratio: ratio(m.drain) })
  if (m.heal) e.push({ type: 'heal', ratio: ratio(m.heal) })
  if (m.critRatio >= 2) e.push({ type: 'crit', stage: m.critRatio - 1 })
  if (m.self?.volatileStatus === 'mustrecharge') e.push({ type: 'recharge' })
  if (m.weather) e.push({ type: 'weather', key: WEATHER[toID(m.weather)] || toID(m.weather) })
  if (m.terrain) e.push({ type: 'terrain', key: TERRAIN[m.terrain] || m.terrain })
  if (m.pseudoWeather) e.push({ type: 'room', key: m.pseudoWeather })
  if (m.sideCondition) {
    const side = m.target === 'foeSide' ? 'foe' : 'self'
    e.push({
      type: 'side',
      side,
      key: m.sideCondition,
      ...(HAZARD_STACK[m.sideCondition] && { maxStack: HAZARD_STACK[m.sideCondition] }),
    })
  }
  const hz = HIT_HAZARD[toID(m.name)]
  if (hz)
    e.push({
      type: 'side',
      side: 'foe',
      key: hz,
      ...(HAZARD_STACK[hz] && { maxStack: HAZARD_STACK[hz] }),
    })
  return e
}

function buildMoves(src, pokemon) {
  const used = new Set(Object.values(pokemon).flatMap((p) => p.learnset || []))
  const moves = {}
  for (const id of [...used].sort()) {
    const m = src.moveData(id)
    const pp = champPP[id]
    moves[id] = {
      id,
      num: m.num,
      type: toID(m.type),
      category: toID(m.category),
      power: m.basePower || 0,
      accuracy: m.accuracy === true ? null : m.accuracy,
      pp: pp ? pp.pp : championsPP(m.pp),
      ...(pp?.estimated && { ppEstimated: true }),
      priority: m.priority || 0,
      target: m.target,
      flags: FLAGS.filter((f) => m.flags?.[f]),
      effects: moveEffects(m),
    }
  }
  return moves
}
const moves = buildMoves(MASTER, pokemon)

function buildItems(src) {
  const items = {}
  for (const id of Object.keys(src.baseItems).filter(src.isLegalItem).sort()) {
    const it = src.itemData(id)
    items[id] = {
      id,
      num: it.num,
      ...(it.megaStone && {
        megaStone: Object.fromEntries(
          Object.entries(it.megaStone).map(([a, b]) => [toID(a), toID(b)]),
        ),
      }),
      ...(it.isBerry && { berry: true }),
    }
  }
  return items
}
const items = buildItems(MASTER)

// ── 4.5 레귤레이션별 데이터 ─────────────
// 지난 레귤레이션(showdown 커밋이 있는 것)은 그 커밋의 소스로 포켓몬·기술·도구를 다시 만들고, 기본 데이터(최신)와
// 다른 부분만 regulations.json 의 patch 로 넣는다. 앱은 고른 레귤레이션의 patch 를 덮어써서 쓴다 (utils/regulationData.ts)
//   patch = { moves: {id: 기술 전체}, items: {id: 도구 전체}, itemsOff: [그 레귤레이션에 없는 도구],
//             pokemon: {id: {types?, stats?, abilities?, weight?, learnset?}}, megasOff: [그 레귤레이션에 없는 메가] }
// 지난 레귤레이션에만 있던 기술·도구는 기본 데이터에 추가한다 (이름표를 만들고, 최신 레귤레이션에서는 itemsOff 로 뺌)
const regCores = new Map()
for (const r of [...regulations].reverse()) {
  if (!r.showdown) {
    // 아래에서 기본 데이터에 지난 기술·도구를 더하므로 복사해 둔다
    regCores.set(r.id, { pokemon, megaIds, moves: { ...moves }, items: { ...items } })
    continue
  }
  const label = `레귤레이션 ${r.id}: `
  const src = await loadShowdownSet(r.showdown)
  const p = buildPokemon(src, new Set(r.pokemon), label)
  const core = { ...p, moves: buildMoves(src, p.pokemon), items: buildItems(src) }
  regCores.set(r.id, core)
  for (const [id, m] of Object.entries(core.moves)) moves[id] ??= m
  for (const [id, it] of Object.entries(core.items)) items[id] ??= it
  for (const id of p.megaIds)
    if (!pokemon[id]) warn.push(`${label}최신 데이터에 없는 메가 (반영 안 함): ${id}`)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const POKEMON_FIELDS = ['types', 'stats', 'abilities', 'weight', 'learnset']
for (const r of regulations) {
  const core = regCores.get(r.id)
  const patch = {}
  const put = (k, id, v) => ((patch[k] ??= {})[id] = v)
  for (const [id, m] of Object.entries(core.moves)) if (!same(m, moves[id])) put('moves', id, m)
  for (const [id, it] of Object.entries(core.items)) if (!same(it, items[id])) put('items', id, it)
  const itemsOff = Object.keys(items).filter((id) => !core.items[id])
  if (itemsOff.length) patch.itemsOff = itemsOff
  for (const [id, p] of Object.entries(core.pokemon)) {
    if (!pokemon[id]) continue
    const d = {}
    for (const f of POKEMON_FIELDS) if (p[f] && !same(p[f], pokemon[id][f])) d[f] = p[f]
    if (Object.keys(d).length) put('pokemon', id, d)
  }
  const megasOff = megaIds.filter((id) => !core.megaIds.includes(id))
  if (megasOff.length) patch.megasOff = megasOff
  if (Object.keys(patch).length) r.patch = patch
}

// ── 5. 특성 / 도구 / 성격 / 타입 ─────────────
const abilityIdent = apiIdent(csv.abilities)
const abilityNamesApi = byLang(csv.ability_names, 'ability_id')
const abilityTextApi = flavorByLang(csv.ability_flavor_text, 'ability_id')
const abilityById = {}
for (const [aid, ident] of Object.entries(abilityIdent)) abilityById[toID(ident)] = aid
const usedAbilities = new Set(
  [...regCores.values()].flatMap((c) => Object.values(c.pokemon).flatMap((p) => p.abilities)),
)
const abilities = {}
for (const id of [...usedAbilities].sort()) abilities[id] = { id, num: baseAbilities[id]?.num ?? 0 }

const itemIdent = apiIdent(csv.items)
const itemById = {}
for (const [iid, ident] of Object.entries(itemIdent)) itemById[toID(ident)] = iid
Object.assign(itemById, { leek: itemById.stick ?? itemById.leek })
const itemNamesApi = byLang(csv.item_names, 'item_id')
const itemTextApi = flavorByLang(csv.item_flavor_text, 'item_id')
for (const r of regulations)
  for (const id of r.newMegaStones)
    if (!items[id]?.megaStone) warn.push(`레귤레이션 ${r.id}: 메가스톤 아님 ${id}`)

const natureIdent = apiIdent(csv.natures)
const natureNamesApi = byLang(csv.nature_names, 'nature_id')
const natureOut = {}
for (const [id, n] of Object.entries(natures))
  natureOut[id] = { id, plus: n.plus || null, minus: n.minus || null }

const typeIdent = apiIdent(csv.types)
const typeNamesApi = byLang(csv.type_names, 'type_id')
// Showdown damageTaken 코드: 0 보통, 1 효과굉장, 2 효과별로, 3 무효 → 공격타입 기준 배율표로 변환
const MULT = { 0: 1, 1: 2, 2: 0.5, 3: 0 }
const TYPES = Object.keys(typechart).filter((t) => t !== 'stellar')
const typeChart = {}
for (const atk of TYPES) {
  typeChart[atk] = {}
  for (const def of TYPES) {
    const code = typechart[def].damageTaken[atk[0].toUpperCase() + atk.slice(1)]
    typeChart[atk][def] = MULT[code ?? 0]
  }
}

// ── 6. 다국어 이름 ─────────────
const speciesNames = byLang(csv.pokemon_species_names, 'pokemon_species_id')
const speciesIdByNum = Object.fromEntries(csv.pokemon_species.map((s) => [Number(s.id), s.id]))
const pokemonRows = Object.fromEntries(csv.pokemon.map((p) => [p.id, p]))
const formNames = byLang(csv.pokemon_form_names, 'pokemon_form_id', 'form_name')
const formFullNames = byLang(csv.pokemon_form_names, 'pokemon_form_id', 'pokemon_name')
const formsBySpecies = {}
for (const f of csv.pokemon_forms) {
  const sp = pokemonRows[f.pokemon_id]?.species_id
  if (sp) (formsBySpecies[sp] ??= []).push(f)
}
const normForm = (ident) =>
  toID(
    ident
      .replace(/-female-mega$/, '-f-mega')
      .replace(/-male-mega$/, '-m-mega')
      .replace(/-female$/, '-f')
      .replace(/-breed$/, '')
      .replace(/-plumage$/, '')
      .replace(
        /-(male|shield|average|midday|disguised|full-belly|family-of-four|zero|amped|green|meadow)$/,
        '',
      ),
  )
// PokeAPI에 한국어 폼 이름이 없는 것들
const FORM_NAME_OVERRIDES = {
  taurospaldeacombat: { ko: '켄타로스 (팔데아의 모습 컴뱃종)' },
  taurospaldeablaze: { ko: '켄타로스 (팔데아의 모습 블레이즈종)' },
  taurospaldeaaqua: { ko: '켄타로스 (팔데아의 모습 워터종)' },
  squawkabillyblue: { ko: '시비꼬 (블루 페더)' },
  squawkabillyyellow: { ko: '시비꼬 (옐로 페더)' },
  squawkabillywhite: { ko: '시비꼬 (화이트 페더)' },
  palafinhero: { ko: '돌핀맨 (마이티폼)' },
  // PokeAPI 에 한국어 폼 이름이 없는 히스이 폼 / 암컷 폼
  arcaninehisui: { ko: '윈디 (히스이의 모습)' },
  avalugghisui: { ko: '크레베이스 (히스이의 모습)' },
  decidueyehisui: { ko: '모크나이퍼 (히스이의 모습)' },
  goodrahisui: { ko: '미끄래곤 (히스이의 모습)' },
  samurotthisui: { ko: '대검귀 (히스이의 모습)' },
  typhlosionhisui: { ko: '블레이범 (히스이의 모습)' },
  zoroarkhisui: { ko: '조로아크 (히스이의 모습)' },
  basculegionf: { ko: '대쓰여너 (암컷의 모습)' },
  // 성별로 폼이 나뉘는 포켓몬: 수컷도 "(수컷의 모습)" (게임 표기). PokeAPI 는 암컷만 폼 이름이 있음
  indeedee: { ko: '에써르 (수컷의 모습)', ja: 'イエッサン (オスのすがた)', en: 'Male Indeedee' },
  meowstic: {
    ko: '냐오닉스 (수컷의 모습)',
    ja: 'ニャオニクス (オスのすがた)',
    en: 'Male Meowstic',
  },
  basculegion: {
    ko: '대쓰여너 (수컷의 모습)',
    ja: 'イダイトウ (オスのすがた)',
    en: 'Male Basculegion',
  },
  // 메가냐오닉스: 수컷·암컷 메가가 따로 있는데 PokeAPI 이름이 같음
  meowsticmmega: {
    ko: '메가냐오닉스 (수컷의 모습)',
    ja: 'メガニャオニクス (オスのすがた)',
    en: 'Mega Meowstic (Male)',
  },
  meowsticfmega: {
    ko: '메가냐오닉스 (암컷의 모습)',
    ja: 'メガニャオニクス (メスのすがた)',
    en: 'Mega Meowstic (Female)',
  },
}
const MEGA_SUFFIX = (forme) => (forme.match(/Mega-?(.*)$/)?.[1] || '').replace('-', '')

const names = { ko: {}, ja: {}, en: {} }
for (const L of Object.keys(names))
  for (const k of ['pokemon', 'moves', 'abilities', 'items', 'natures', 'types']) names[L][k] = {}
const texts = {
  ko: { moves: {}, abilities: {}, items: {} },
  ja: { moves: {}, abilities: {}, items: {} },
  en: { moves: {}, abilities: {}, items: {} },
}

for (const [id, p] of Object.entries(pokemon)) {
  const sp = speciesNames[speciesIdByNum[p.num]] || {}
  const forms = formsBySpecies[speciesIdByNum[p.num]] || []
  const form = p.forme ? forms.find((f) => normForm(f.identifier) === id) : null
  if (p.forme && !form && !FORM_NAME_OVERRIDES[id]) warn.push(`폼 이름 매칭 실패: ${id}`)
  for (const L of Object.keys(names)) {
    let n = sp[L] || dex[id].baseSpecies
    if (p.forme) {
      const fn = form && formNames[form.id]?.[L]
      const full = form && formFullNames[form.id]?.[L]
      if (FORM_NAME_OVERRIDES[id]?.[L]) n = FORM_NAME_OVERRIDES[id][L]
      else if (p.mega)
        n =
          fn ||
          (L === 'en'
            ? `Mega ${sp.en} ${MEGA_SUFFIX(p.forme)}`.trim()
            : `${L === 'ja' ? 'メガ' : '메가'}${sp[L]}${MEGA_SUFFIX(p.forme)}`)
      else if (L === 'en' && full) n = full
      else if (fn && sp[L] && fn.includes(sp[L]))
        n = fn // "워시로토무"처럼 폼 이름에 종 이름이 이미 들어있는 경우
      else if (fn) n = `${sp[L]} (${fn})`
      else n = `${sp[L] || dex[id].baseSpecies} (${p.forme})`
    }
    // 폼 이름 지정은 기본 폼(성별 수컷 등)에도 적용
    names[L].pokemon[id] = FORM_NAME_OVERRIDES[id]?.[L] || n
  }
}
const pick = (src, apiId, L) => (apiId && src[apiId]?.[L]) || null
const moveById = Object.fromEntries(
  Object.entries(moveIdent).map(([mid, ident]) => [toID(ident), mid]),
)
const moveTextApi = flavorByLang(csv.move_flavor_text, 'move_id')
for (const id of Object.keys(moves)) {
  const aid = moveById[id]
  for (const L of Object.keys(names)) {
    names[L].moves[id] = pick(moveNames, aid, L) || moveData(id).name
    const t = pick(moveTextApi, aid, L)
    if (t) texts[L].moves[id] = t
  }
}
// PokeAPI 에 없는 챔피언스 신규 특성. 이름: 한국 공식 도감(pokemonkorea.co.kr) / 일본 공략 사이트(game8·GameWith·패미통 일치),
// 설명: GameWith 포켓몬 챔피언스 도구(gamewith.ai)의 한국어·일본어 특성 설명
const ABILITY_OVERRIDES = {
  auraguard: { ko: '파동의방호', ja: 'はどうのまもり' },
  firemane: { ko: '불꽃의갈기', ja: 'ほのおのたてがみ' },
  eelevate: { ko: '천정부지', ja: 'うなぎのぼり' },
}
const ABILITY_TEXT_OVERRIDES = {
  firemane: {
    ko: '불꽃타입 기술의 위력이 1.5배가 된다.',
    ja: 'ほのおタイプの技の威力が1.5倍になる。',
  },
  eelevate: {
    ko: '땅 위에 있지 않게 되어 땅타입 기술, 압정뿌리기, 독압정, 끈적끈적네트 상태의 효과를 받지 않는다. 공격으로 상대를 쓰러뜨리면 자신의 가장 높은 능력이 1단계 올라간다.',
    ja: '地面にいないことになり、じめんタイプの技・まきびし・どくびし・ねばねばネット状態が効かない。攻撃で相手を倒すと、自分の最も高い能力が1段階上がる。',
  },
}
for (const id of Object.keys(abilities)) {
  const aid = abilityById[id]
  for (const L of Object.keys(names)) {
    names[L].abilities[id] =
      ABILITY_OVERRIDES[id]?.[L] || pick(abilityNamesApi, aid, L) || baseAbilities[id]?.name || id
    const t = ABILITY_TEXT_OVERRIDES[id]?.[L] || pick(abilityTextApi, aid, L)
    if (t) texts[L].abilities[id] = t
  }
}
// PokeAPI에 한국어 이름이 없는 도구 (챔피언스 신규 메가스톤 등)
const stoneKo = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/sources/item-names-ko.json'), 'utf8'),
)
for (const id of Object.keys(items)) {
  const aid = itemById[id]
  for (const L of Object.keys(names)) {
    names[L].items[id] =
      pick(itemNamesApi, aid, L) || (L === 'ko' && stoneKo[id]) || itemData(id).name
    const t = pick(itemTextApi, aid, L)
    if (t) texts[L].items[id] = t
  }
  if (!pick(itemNamesApi, aid, 'ko') && !stoneKo[id]) warn.push(`도구 한국어 이름 없음: ${id}`)
}
for (const [nid, ident] of Object.entries(natureIdent)) {
  if (!natureOut[ident]) continue
  for (const L of Object.keys(names)) names[L].natures[ident] = natureNamesApi[nid]?.[L] || ident
}
for (const [tid, ident] of Object.entries(typeIdent)) {
  if (!TYPES.includes(ident)) continue
  for (const L of Object.keys(names)) names[L].types[ident] = typeNamesApi[tid]?.[L] || ident
}
for (const L of Object.keys(names)) {
  for (const [k, v] of Object.entries(names[L])) {
    const total = { pokemon, moves, abilities, items, natures: natureOut, types: typeChart }[k]
    const missing = Object.keys(total).filter((id) => !v[id])
    if (missing.length) warn.push(`${L} ${k} 이름 없음: ${missing.join(' ')}`)
  }
}

// ── 6.5 사용률 (Smogon 월별 통계) ─────────────
// 레귤레이션마다 싱글 포맷(gen9championsbssreg<id>)·더블 포맷(gen9championsvgc<연도>reg<id>) 통계 중
// 가장 최근 달의 chaos JSON (레이팅 가중 1500). public/data/usage/ 에 종류·레귤레이션마다 따로:
//   index.json = { single: {레귤레이션: {format, month, battles}}, double: {…} }, {single|double}-{레귤레이션}.json = 표.
//   (전부 한 파일이면 1MB 넘어서 첫 화면이 늦어짐 — 앱은 현재 레귤레이션 표만 필요할 때 받는다)
// 포켓몬(폼)별 사용 수 + 가장 많이 쓴 기술 4개·배분(성격+능력 포인트)·특성·도구 → 선출 화면 상대 자동 배치에 사용.
// 동료(같은 파티에 함께 쓴 비율) → 파티 화면 "통계로 파티 채우기".
// 받기 실패(오프라인 등)면 기존 usage/ 를 유지한다. 새 달 반영은 --refresh.
const STATS = 'https://www.smogon.com/stats'
const USAGE_CUTOFF = 1500
const USAGE_MIN = 200 // 사용 수가 이보다 적으면 통계를 쓰지 않음 (표본 부족)
const TEAMMATES_MAX = 20 // 포켓몬마다 저장하는 동료 수
const top = (obj, ok) =>
  Object.entries(obj || {})
    .filter(([k]) => k && k !== 'nothing' && ok(k))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
const round4 = (v) => Math.round(v * 10000) / 10000
function summarizeUsage(json, month, format) {
  const out = {}
  for (const [name, d] of Object.entries(json.data)) {
    const id = toID(name)
    const p = pokemon[id]
    const count = d['Raw count']
    if (!p || count < USAGE_MIN) continue
    // 비율의 분모: 이 포켓몬의 가중 사용 수 (특성 수치 합 = Smogon moveset 통계의 기준)
    const weight = Object.values(d.Abilities || {}).reduce((a, b) => a + b, 0) || 1
    const share = (obj, ids) => ids.map((k) => round4((obj?.[k] ?? 0) / weight))
    const learn = new Set(p.learnset ?? pokemon[p.mega?.from]?.learnset ?? [])
    const spread = top(d.Spreads, (k) => {
      const sp = k.split(':')[1]?.split('/').map(Number) ?? []
      return (
        sp.length === 6 && sp.every((v) => v >= 0 && v <= 32) && sp.reduce((a, b) => a + b) <= 66
      )
    })[0]
    const [nature, sp] = spread ? spread.split(':') : []
    const moveIds = top(d.Moves, (m) => !!moves[m] && learn.has(m)).slice(0, 4)
    const itemIds = top(d.Items, (i) => !!items[i]).slice(0, 3)
    out[id] = {
      count,
      usage: round4(d.usage), // 팀 채용률 (0~1, 전체 합 6)
      moves: moveIds,
      moveShare: share(d.Moves, moveIds),
      // 기술별 채용률 전체 (0.5% 이상, 도감 기술표)
      moveUsage: Object.fromEntries(
        top(d.Moves, (m) => !!moves[m] && learn.has(m))
          .map((m) => [m, round4(d.Moves[m] / weight)])
          .filter(([, v]) => v >= 0.005),
      ),
      ...(nature &&
        natureOut[toID(nature)] && {
          nature: toID(nature),
          sp: sp.split('/').map(Number),
          spreadShare: round4(d.Spreads[spread] / weight),
        }),
      ability: top(d.Abilities, (a) => !!abilities[a])[0] ?? '',
      // 특성별 비율 전체 (배틀 화면 상대 특성 확정 선택지)
      abilityUsage: Object.fromEntries(
        top(d.Abilities, (a) => !!abilities[a]).map((a) => [a, round4(d.Abilities[a] / weight)]),
      ),
      items: itemIds,
      itemShare: share(d.Items, itemIds),
      // 도구별 비율 전체 (0.5% 이상, 배틀 화면 상대 도구 확정 선택지)
      itemUsage: Object.fromEntries(
        top(d.Items, (i) => !!items[i])
          .map((i) => [i, round4(d.Items[i] / weight)])
          .filter(([, v]) => v >= 0.005),
      ),
      // 같은 파티에 함께 들어간 비율 (폼 id → 0~1, 많은 순 TEAMMATES_MAX 개. 파티 화면 "통계로 파티 채우기")
      teammates: Object.entries(d.Teammates || {}).map(([k, v]) => [toID(k), v / weight]),
    }
  }
  // 동료는 통계를 쓰는 포켓몬만 (사용 수 USAGE_MIN 이상)
  for (const u of Object.values(out))
    u.teammates = Object.fromEntries(
      u.teammates
        .filter(([k, v]) => out[k] && v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TEAMMATES_MAX)
        .map(([k, v]) => [k, round4(v)]),
    )
  return { format, month, battles: json.info['number of battles'], pokemon: out }
}
// ── 교체 경향 (싱글) ─────────────
// Smogon "Checks and Counters": 포켓몬 X 가 Y 와 맞붙은 맞대결 수 n 과, 그 맞대결에서 X 가 쓰러지거나 교체로 물러난 비율 p.
// 쓰러짐/교체를 나눈 값은 moveset txt 에만 있고 X 마다 상위 10여 개 상대뿐이라, 나머지 쌍은 X 의 평균 교체 몫으로 나눈다.
// 결과 switchVs = { Y: X 가 Y 를 만났을 때 교체하는 정도 ÷ X 의 평균 } (맞대결이 적으면 1 쪽으로 당김, 0.5~2배).
// 턴마다의 확률이 아니라 맞대결 단위 통계이므로 추천 플레이는 교체 사전 비중에 배수로만 쓴다
const SWITCH_SHRINK = 50 // 이 정도 맞대결 수만큼 평균(1배)을 섞음
const SWITCH_MIN_DIFF = 0.1 // 1배와 이보다 덜 다르면 저장하지 않음 (파일 크기)
// moveset txt → { X: { Y: 교체 몫 (교체 ÷ (쓰러짐 + 교체)) } }
function parseSwitchSplit(txt) {
  const out = {}
  const lines = txt.split(/\r?\n/)
  const sep = (l) => /^\s*\+-+\+\s*$/.test(l ?? '')
  let mon = null
  let inCC = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (sep(lines[i - 1]) && sep(lines[i + 1]) && /^\s*\|/.test(l)) {
      mon = toID(l.replace(/\|/g, ''))
      inCC = false
      continue
    }
    if (/\|\s*Checks and Counters\s*\|/.test(l)) {
      inCC = true
      continue
    }
    if (sep(l)) inCC = false
    if (!inCC || !mon) continue
    const head = l.match(/^\s*\|\s*(.+?)\s+[\d.]+\s+\([\d.]+±[\d.]+\)\s*\|/)
    const split = lines[i + 1]?.match(/\(([\d.]+)% KOed \/ ([\d.]+)% switched out\)/)
    if (!head || !split) continue
    const ko = Number(split[1])
    const sw = Number(split[2])
    if (ko + sw > 0) (out[mon] ??= {})[toID(head[1])] = sw / (ko + sw)
  }
  return out
}
function switchTendency(json, split) {
  const all = Object.values(split).flatMap((m) => Object.values(m))
  const globalShare = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0.5
  const out = {}
  for (const [name, d] of Object.entries(json.data)) {
    const x = toID(name)
    const cc = d['Checks and Counters']
    if (!pokemon[x] || !cc) continue
    const sp = split[x] ?? {}
    const own = Object.values(sp)
    const share = own.length ? own.reduce((a, b) => a + b, 0) / own.length : globalShare
    const rows = Object.entries(cc)
      .map(([yn, v]) => {
        const y = toID(yn)
        const [n, p] = Array.isArray(v) ? v : [v.n, v.p]
        return { y, n, s: p * (sp[y] ?? share) }
      })
      .filter((r) => pokemon[r.y] && r.n > 0)
    const total = rows.reduce((a, r) => a + r.n, 0)
    if (!total) continue
    const mean = rows.reduce((a, r) => a + r.n * r.s, 0) / total
    if (!(mean > 0)) continue
    const vs = {}
    for (const r of rows) {
      const shrunk = (r.n * r.s + SWITCH_SHRINK * mean) / (r.n + SWITCH_SHRINK)
      const mult = Math.max(0.5, Math.min(2, shrunk / mean))
      if (Math.abs(mult - 1) >= SWITCH_MIN_DIFF) vs[r.y] = Math.round(mult * 100) / 100
    }
    if (Object.keys(vs).length) out[x] = vs
  }
  return out
}

async function buildUsage() {
  const index = await cached(`${STATS}/`, 'smogon/index.html')
  const months = [...index.matchAll(/href="(\d{4}-\d{2})\/"/g)]
    .map((m) => m[1])
    .sort()
    .reverse()
  // 싱글 = 배틀스타디움 싱글(bss), 더블 = VGC 1판 포맷 (연도가 붙음, 3판 2선승 bo3 포맷은 제외)
  const FORMATS = {
    single: (id) => new RegExp(`"(gen9championsbssreg${id})-${USAGE_CUTOFF}\\.json"`),
    double: (id) => new RegExp(`"(gen9championsvgc\\d{4}reg${id})-${USAGE_CUTOFF}\\.json"`),
  }
  const out = { single: {}, double: {} }
  for (const [kind, re] of Object.entries(FORMATS)) {
    for (const r of regulations) {
      for (const month of months.slice(0, 6)) {
        const list = await cached(`${STATS}/${month}/chaos/`, `smogon/${month}/chaos.html`)
        const format = list.match(re(toID(r.id)))?.[1]
        if (!format) continue
        const file = `${format}-${USAGE_CUTOFF}.json`
        const json = JSON.parse(
          await cached(`${STATS}/${month}/chaos/${file}`, `smogon/${month}/${file}`),
        )
        out[kind][r.id] = summarizeUsage(json, month, format)
        // 교체 경향은 싱글만 (더블은 2:2 라 맞대결 하나로 보기 어려움)
        if (kind === 'single') {
          let split = {}
          try {
            split = parseSwitchSplit(
              await cached(
                `${STATS}/${month}/moveset/${file.replace('.json', '.txt')}`,
                `smogon/${month}/moveset-${file.replace('.json', '.txt')}`,
              ),
            )
          } catch (e) {
            warn.push(`교체 통계(moveset) 받기 실패 ${r.id}: ${e.message} — 평균 교체 몫으로 계산`)
          }
          const tend = switchTendency(json, split)
          for (const [x, vs] of Object.entries(tend))
            if (out[kind][r.id].pokemon[x]) out[kind][r.id].pokemon[x].switchVs = vs
        }
        break
      }
      if (!out[kind][r.id]) warn.push(`사용률 통계 없음: ${kind} ${r.id}`)
    }
  }
  return out
}
let usage = null
try {
  usage = await buildUsage()
} catch (e) {
  warn.push(`사용률 통계 받기 실패 (기존 usage/ 유지): ${e.message}`)
}

// ── 7. 출력 ─────────────
fs.mkdirSync(OUT, { recursive: true })
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data))
write('pokemon.json', pokemon)
write('moves.json', moves)
write('abilities.json', abilities)
write('items.json', items)
write('natures.json', natureOut)
write('types.json', { types: TYPES, chart: typeChart })
write('regulations.json', regulations)
if (usage) {
  const dir = path.join(OUT, 'usage')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const index = { single: {}, double: {} }
  for (const [kind, regs] of Object.entries(usage))
    for (const [reg, table] of Object.entries(regs)) {
      const { pokemon: _, ...meta } = table
      index[kind][reg] = meta
      write(`usage/${kind}-${reg}.json`, table)
    }
  write('usage/index.json', index)
  fs.rmSync(path.join(OUT, 'usage.json'), { force: true }) // 예전 한 파일 형식
}
for (const L of Object.keys(names)) {
  write(`names.${L}.json`, names[L])
  write(`texts.${L}.json`, texts[L])
}
console.log(
  `포켓몬 ${Object.keys(pokemon).length} (메가 ${megaIds.length}), 기술 ${Object.keys(moves).length}, 특성 ${Object.keys(abilities).length}, ` +
    `도구 ${Object.keys(items).length}, 레귤레이션 ${regulations.map((r) => `${r.id}:${r.pokemon.length}`).join(' ')}`,
)

// ── 8. 스프라이트 (선택) ─────────────
// Bulbagarden Archives 의 포켓몬 챔피언스 인게임 이미지
//   포켓몬: Category:Champions menu sprites  "Menu Champs 0026-Alola.png" (128x128)
//   도구:   Category:Champions Bag sprites   "Bag Rocky Helmet Champs Sprite.png"
const ARCHIVE_FORME = { F: 'Female', Super: 'Jumbo', 'M-Mega': 'Mega', 'F-Mega': 'Mega' } // 메가냐오닉스는 성별 공용 스프라이트
const archiveFileFor = (p) => {
  const num = String(p.num).padStart(4, '0')
  if (!p.forme) return `Menu Champs ${num}.png`
  const f = ARCHIVE_FORME[p.forme] || p.forme.replace(/-/g, ' ')
  return `Menu Champs ${num}-${f}.png`
}
async function listCategory(cat) {
  const out = {}
  let cont = {}
  for (;;) {
    const q = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'categorymembers',
      gcmtitle: `Category:${cat}`,
      gcmlimit: '500',
      gcmtype: 'file',
      prop: 'imageinfo',
      iiprop: 'url',
      ...cont,
    })
    const j = await (
      await fetch(`https://archives.bulbagarden.net/w/api.php?${q}`, {
        headers: { 'User-Agent': UA },
      })
    ).json()
    for (const p of Object.values(j.query?.pages || {}))
      out[p.title.replace(/^File:/, '')] = p.imageinfo?.[0]?.url
    if (!j.continue) break
    cont = j.continue
  }
  return out
}
async function download(url, file) {
  if (fs.existsSync(file) && !REFRESH) return 'skip'
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return `fail ${res.status}`
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  await new Promise((r) => setTimeout(r, 150)) // 아카이브 서버 부담 줄이기
  return 'ok'
}
if (WITH_SPRITES) {
  console.log('스프라이트 다운로드 중...')
  const menu = await listCategory('Champions menu sprites')
  const bag = await listCategory('Champions Bag sprites')
  fs.mkdirSync(path.join(SPRITES, 'pokemon'), { recursive: true })
  fs.mkdirSync(path.join(SPRITES, 'items'), { recursive: true })
  const stat = {}
  for (const p of Object.values(pokemon)) {
    let url = menu[archiveFileFor(p)]
    if (!url && p.forme && !p.mega) url = menu[`Menu Champs ${String(p.num).padStart(4, '0')}.png`] // 외형 차이 없는 폼
    if (!url) {
      warn.push(`스프라이트 없음: ${p.id} (${archiveFileFor(p)})`)
      continue
    }
    const r = await download(url, path.join(SPRITES, 'pokemon', `${p.id}.png`))
    stat[r] = (stat[r] || 0) + 1
  }
  for (const id of Object.keys(items)) {
    const url = bag[`Bag ${itemData(id).name} Champs Sprite.png`]
    if (!url) {
      warn.push(`도구 스프라이트 없음: ${id} (${itemData(id).name})`)
      continue
    }
    const r = await download(url, path.join(SPRITES, 'items', `${id}.png`))
    stat[r] = (stat[r] || 0) + 1
  }
  console.log('스프라이트:', JSON.stringify(stat))
}

if (warn.length) {
  console.log(`\n경고 ${warn.length}건:`)
  for (const w of warn) console.log('  - ' + w)
}
