// scripts/build-data.mjs
//
// 게임 데이터 빌드 스크립트. 아래 소스를 받아서 영어 id를 키로 쓰는 JSON을 public/data/ 에 생성한다.
//   - Pokemon Showdown (smogon/pokemon-showdown) data/mods/champions + data/
//       → 출전 가능 포켓몬/폼/메가, 타입, 종족값, 특성, 습득 기술, 기술 수치, 도구, 성격, 타입 상성
//   - PokeAPI CSV (PokeAPI/pokeapi data/v2/csv) → ko/ja/en 이름과 설명
//   - scripts/sources/champions-pp.json → 챔피언스 PP (Showdown은 챔피언스 PP를 반영하지 않음. 직접 수정 가능)
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

const toID = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const warn = []

// ── 소스 다운로드 ─────────────
const SD = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data'
const PA = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'

async function cached(url, name) {
  const file = path.join(CACHE, name)
  if (!REFRESH && fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const text = await res.text()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return text
}

async function loadSD(rel) {
  const src = await cached(`${SD}/${rel}`, `showdown/${rel}`)
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
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') q = false
      else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

// ── 1. 소스 로드 ─────────────
console.log('소스 로드 중...')
const [dex, baseMoves, champMoves, baseItems, champItems, champFormats, learnsets, natures, typechart] =
  await Promise.all([
    loadSD('pokedex.ts'),
    loadSD('moves.ts'),
    loadSD('mods/champions/moves.ts'),
    loadSD('items.ts'),
    loadSD('mods/champions/items.ts'),
    loadSD('mods/champions/formats-data.ts'),
    loadSD('mods/champions/learnsets.ts'),
    loadSD('natures.ts'),
    loadSD('typechart.ts'),
  ])
const baseAbilities = await loadSD('abilities.ts')
const csv = {}
for (const n of [
  'pokemon_species', 'pokemon_species_names', 'pokemon', 'pokemon_forms', 'pokemon_form_names',
  'moves', 'move_names', 'move_flavor_text', 'abilities', 'ability_names', 'ability_flavor_text',
  'items', 'item_names', 'item_flavor_text', 'types', 'type_names', 'natures', 'nature_names', 'version_groups',
]) csv[n] = await loadCSV(n)

const merged = (base, mod, id) => {
  const m = mod[id] || {}
  if (!base[id] && !m) return null
  const o = { ...(base[id] || {}) }
  for (const [k, v] of Object.entries(m)) if (k !== 'inherit') o[k] = v
  return o
}
const moveData = (id) => merged(baseMoves, champMoves, id)
const itemData = (id) => merged(baseItems, champItems, id)
const isLegalMove = (id) => { const m = moveData(id); return m && !m.isNonstandard }
const isLegalItem = (id) => { const m = itemData(id); return m && !m.isNonstandard }

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
    if (!cur || ord > cur.ord) best[r[key]][lang] = { ord, text: r.flavor_text.replace(/\s*\n\s*/g, ' ').replace(/\f/g, ' ').trim() }
  }
  for (const v of Object.values(best)) for (const l in v) v[l] = v[l].text
  return best
}
const apiIdent = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.identifier]))

// ── 2. 레귤레이션 → 출전 가능 포켓몬 id ─────────────
// 기존 형식("0026-001")을 Showdown id로 변환. 폼 번호는 baseSpecies.otherFormes 순서(1부터).
// 공식 폼 번호가 이 규칙과 다른 경우만 아래 표로 고정.
const CODE_OVERRIDES = { '0666-018': 'vivillon', '0670-005': 'floetteeternal', '0678-001': 'meowsticf' }
const byNum = {}
for (const [id, s] of Object.entries(dex)) if (!s.forme || s.baseSpecies === s.name) byNum[s.num] ??= id
const codeToId = (code) => {
  if (CODE_OVERRIDES[code]) return CODE_OVERRIDES[code]
  const [num, form] = code.split('-').map(Number)
  const base = byNum[num]
  if (!base) return null
  if (!form) return base
  const f = dex[base].otherFormes?.[form - 1]
  return f ? toID(f) : null
}
const regIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/sources/regulation/index.json'), 'utf8'))
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
  regulations.push({ id: file.replace('.json', ''), start, end, rules: r.rules, pokemon: [...new Set(ids)].sort() })
}

// ── 3. 포켓몬 ─────────────
const inReg = new Set(regulations.flatMap((r) => r.pokemon))
const regNums = new Set([...inReg].map((id) => dex[id].num))
const isFormatLegal = (id) => champFormats[id] && !champFormats[id].isNonstandard && champFormats[id].tier !== 'Illegal'
// 메가: 챔피언스에서 합법 + 원종 도감번호가 어느 레귤레이션에 있음 + 필요한 메가스톤이 도구로 존재
const megaIds = Object.keys(dex).filter((id) => {
  const s = dex[id]
  return /^Mega/.test(s.forme || '') && isFormatLegal(id) && regNums.has(s.num) && (!s.requiredItem || isLegalItem(toID(s.requiredItem)))
})
const STAT = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' }
const learnsetOf = (id) => {
  const s = dex[id]
  for (const k of [id, toID(s.changesFrom), toID(s.baseSpecies)]) {
    if (k && learnsets[k]?.learnset) return Object.keys(learnsets[k].learnset).filter(isLegalMove).sort()
  }
  warn.push(`습득 기술 없음: ${id}`)
  return []
}
const pokemon = {}
for (const id of [...inReg, ...megaIds].sort()) {
  const s = dex[id]
  const isMega = megaIds.includes(id)
  const base = toID(s.changesFrom || s.baseSpecies)
  pokemon[id] = {
    id,
    num: s.num,
    base: s.forme ? base : id,
    forme: s.forme || '',
    types: s.types.map(toID),
    stats: Object.fromEntries(Object.entries(s.baseStats).map(([k, v]) => [STAT[k], v])),
    abilities: [...new Set(Object.values(s.abilities).map(toID))],
    weight: s.weightkg,
    ...(isMega ? { mega: { from: base, item: toID(s.requiredItem) } } : { learnset: learnsetOf(id) }),
  }
}
for (const id of megaIds) {
  const from = pokemon[id].mega.from
  // 원종이 레귤레이션에 직접 없을 수도 있음(예: floette → floetteeternal). 같은 도감번호 폼에 연결
  const target = pokemon[from] ? from : Object.keys(pokemon).find((k) => pokemon[k].num === pokemon[id].num && !pokemon[k].mega)
  if (!target) { warn.push(`메가 원종 없음: ${id}`); continue }
  pokemon[id].mega.from = target
  ;(pokemon[target].megas ??= []).push(id)
}

// ── 4. 기술 ─────────────
// 챔피언스 PP: scripts/sources/champions-pp.json ({ id: pp } 또는 { id: { pp, estimated: true } })
const champPP = {}
for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/sources/champions-pp.json'), 'utf8')))) {
  champPP[id] = typeof v === 'number' ? { pp: v, estimated: false } : v
}
const moveIdent = apiIdent(csv.moves)
const moveNames = byLang(csv.move_names, 'move_id')
// PP 정보가 없는 기술: 기존 데이터 경향(구세대 기술은 상향, 8세대 이후 기술은 본가 그대로)으로 추정
const PP_UP = { 5: 8, 10: 12, 15: 16 }
const estimatePP = (m) => (m.num >= 743 ? m.pp : (PP_UP[m.pp] ?? Math.min(m.pp, 20)))

const WEATHER = { sunnyday: 'sun', raindance: 'rain', sandstorm: 'sand', snowscape: 'snow', hail: 'snow' }
const TERRAIN = { electricterrain: 'electric', grassyterrain: 'grassy', mistyterrain: 'misty', psychicterrain: 'psychic' }
const HAZARD_STACK = { spikes: 3, toxicspikes: 2 }
const FLAGS = ['contact', 'punch', 'bite', 'slicing', 'sound', 'pulse', 'bullet', 'wind', 'powder']
const VOLATILES = new Set(['flinch', 'confusion'])
const ratio = (a) => (Array.isArray(a) ? a[0] / a[1] : undefined)

function moveEffects(m) {
  const e = []
  const selfTarget = ['self', 'allySide', 'allies', 'adjacentAllyOrSelf'].includes(m.target)
  if (m.boosts) e.push({ type: 'boost', target: selfTarget ? 'self' : 'target', stats: m.boosts })
  if (m.self?.boosts) e.push({ type: 'boost', target: 'self', stats: m.self.boosts })
  if (m.selfBoost?.boosts) e.push({ type: 'boost', target: 'self', stats: m.selfBoost.boosts })
  if (m.status) e.push({ type: 'status', target: 'target', status: m.status })
  if (VOLATILES.has(m.volatileStatus)) e.push({ type: 'volatile', target: 'target', status: m.volatileStatus })
  for (const sec of [m.secondary, ...(m.secondaries || [])].filter(Boolean)) {
    const chance = sec.chance ?? 100
    if (sec.boosts) e.push({ type: 'boost', target: 'target', stats: sec.boosts, chance })
    if (sec.self?.boosts) e.push({ type: 'boost', target: 'self', stats: sec.self.boosts, chance })
    if (sec.status) e.push({ type: 'status', target: 'target', status: sec.status, chance })
    if (VOLATILES.has(sec.volatileStatus)) e.push({ type: 'volatile', target: 'target', status: sec.volatileStatus, chance })
  }
  if (m.multihit) e.push({ type: 'multihit', min: [].concat(m.multihit)[0], max: [].concat(m.multihit).at(-1) })
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
    e.push({ type: 'side', side, key: m.sideCondition, ...(HAZARD_STACK[m.sideCondition] && { maxStack: HAZARD_STACK[m.sideCondition] }) })
  }
  return e
}

const usedMoves = new Set(Object.values(pokemon).flatMap((p) => p.learnset || []))
const moves = {}
for (const id of [...usedMoves].sort()) {
  const m = moveData(id)
  const pp = champPP[id]
  if (!pp) warn.push(`PP 추정: ${id}`)
  moves[id] = {
    id,
    num: m.num,
    type: toID(m.type),
    category: toID(m.category),
    power: m.basePower || 0,
    accuracy: m.accuracy === true ? null : m.accuracy,
    pp: pp ? pp.pp : estimatePP(m),
    ...((!pp || pp.estimated) && { ppEstimated: true }),
    priority: m.priority || 0,
    target: m.target,
    flags: FLAGS.filter((f) => m.flags?.[f]),
    effects: moveEffects(m),
  }
}

// ── 5. 특성 / 도구 / 성격 / 타입 ─────────────
const abilityIdent = apiIdent(csv.abilities)
const abilityNamesApi = byLang(csv.ability_names, 'ability_id')
const abilityTextApi = flavorByLang(csv.ability_flavor_text, 'ability_id')
const abilityById = {}
for (const [aid, ident] of Object.entries(abilityIdent)) abilityById[toID(ident)] = aid
const usedAbilities = new Set(Object.values(pokemon).flatMap((p) => p.abilities))
const abilities = {}
for (const id of [...usedAbilities].sort()) abilities[id] = { id, num: baseAbilities[id]?.num ?? 0 }

const itemIdent = apiIdent(csv.items)
const itemById = {}
for (const [iid, ident] of Object.entries(itemIdent)) itemById[toID(ident)] = iid
Object.assign(itemById, { leek: itemById.stick ?? itemById.leek })
const itemNamesApi = byLang(csv.item_names, 'item_id')
const itemTextApi = flavorByLang(csv.item_flavor_text, 'item_id')
const items = {}
for (const id of Object.keys(baseItems).filter(isLegalItem).sort()) {
  const it = itemData(id)
  items[id] = {
    id,
    num: it.num,
    ...(it.megaStone && { megaStone: Object.fromEntries(Object.entries(it.megaStone).map(([a, b]) => [toID(a), toID(b)])) }),
    ...(it.isBerry && { berry: true }),
    ...(it.onPlate || it.onMemory ? {} : {}),
  }
}

const natureIdent = apiIdent(csv.natures)
const natureNamesApi = byLang(csv.nature_names, 'nature_id')
const natureOut = {}
for (const [id, n] of Object.entries(natures)) natureOut[id] = { id, plus: n.plus || null, minus: n.minus || null }

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
  toID(ident.replace(/-female$/, '-f').replace(/-breed$/, '').replace(/-plumage$/, '').replace(/-(male|shield|average|midday|disguised|full-belly|family-of-four|zero|amped|green|meadow)$/, ''))
// PokeAPI에 한국어 폼 이름이 없는 것들
const FORM_NAME_OVERRIDES = {
  taurospaldeacombat: { ko: '켄타로스 (팔데아의 모습 컴뱃종)' },
  taurospaldeablaze: { ko: '켄타로스 (팔데아의 모습 블레이즈종)' },
  taurospaldeaaqua: { ko: '켄타로스 (팔데아의 모습 워터종)' },
  squawkabillyblue: { ko: '시비꼬 (블루 페더)' },
  squawkabillyyellow: { ko: '시비꼬 (옐로 페더)' },
  squawkabillywhite: { ko: '시비꼬 (화이트 페더)' },
}
const MEGA_SUFFIX = (forme) => (forme.match(/^Mega-?(.*)$/)?.[1] || '').replace('-', '')

const names = { ko: {}, ja: {}, en: {} }
for (const L of Object.keys(names)) for (const k of ['pokemon', 'moves', 'abilities', 'items', 'natures', 'types']) names[L][k] = {}
const texts = { ko: { moves: {}, abilities: {}, items: {} }, ja: { moves: {}, abilities: {}, items: {} }, en: { moves: {}, abilities: {}, items: {} } }

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
      else if (p.mega) n = fn || (L === 'en' ? `Mega ${sp.en} ${MEGA_SUFFIX(p.forme)}`.trim() : `${L === 'ja' ? 'メガ' : '메가'}${sp[L]}${MEGA_SUFFIX(p.forme)}`)
      else if (L === 'en' && full) n = full
      else if (fn && sp[L] && fn.includes(sp[L])) n = fn // "워시로토무"처럼 폼 이름에 종 이름이 이미 들어있는 경우
      else if (fn) n = `${sp[L]} (${fn})`
      else n = `${sp[L] || dex[id].baseSpecies} (${p.forme})`
    }
    names[L].pokemon[id] = n
  }
}
const pick = (src, apiId, L) => (apiId && src[apiId]?.[L]) || null
const moveById = Object.fromEntries(Object.entries(moveIdent).map(([mid, ident]) => [toID(ident), mid]))
const moveTextApi = flavorByLang(csv.move_flavor_text, 'move_id')
for (const id of Object.keys(moves)) {
  const aid = moveById[id]
  for (const L of Object.keys(names)) {
    names[L].moves[id] = pick(moveNames, aid, L) || moveData(id).name
    const t = pick(moveTextApi, aid, L)
    if (t) texts[L].moves[id] = t
  }
}
const ABILITY_OVERRIDES = { auraguard: { ko: '파동의방호', ja: 'はどうのまもり' } }
for (const id of Object.keys(abilities)) {
  const aid = abilityById[id]
  for (const L of Object.keys(names)) {
    names[L].abilities[id] = ABILITY_OVERRIDES[id]?.[L] || pick(abilityNamesApi, aid, L) || baseAbilities[id]?.name || id
    const t = pick(abilityTextApi, aid, L)
    if (t) texts[L].abilities[id] = t
  }
}
// PokeAPI에 한국어 이름이 없는 도구 (챔피언스 신규 메가스톤 등)
const stoneKo = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/sources/item-names-ko.json'), 'utf8'))
for (const id of Object.keys(items)) {
  const aid = itemById[id]
  for (const L of Object.keys(names)) {
    names[L].items[id] = pick(itemNamesApi, aid, L) || (L === 'ko' && stoneKo[id]) || itemData(id).name
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
for (const L of Object.keys(names)) {
  write(`names.${L}.json`, names[L])
  write(`texts.${L}.json`, texts[L])
}
console.log(
  `포켓몬 ${Object.keys(pokemon).length} (메가 ${megaIds.length}), 기술 ${Object.keys(moves).length}, 특성 ${Object.keys(abilities).length}, ` +
  `도구 ${Object.keys(items).length}, 레귤레이션 ${regulations.map((r) => `${r.id}:${r.pokemon.length}`).join(' ')}`
)

// ── 8. 스프라이트 (선택) ─────────────
// Bulbagarden Archives 의 포켓몬 챔피언스 인게임 이미지
//   포켓몬: Category:Champions menu sprites  "Menu Champs 0026-Alola.png" (128x128)
//   도구:   Category:Champions Bag sprites   "Bag Rocky Helmet Champs Sprite.png"
const ARCHIVE_FORME = { F: 'Female', Super: 'Jumbo' }
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
      action: 'query', format: 'json', generator: 'categorymembers', gcmtitle: `Category:${cat}`,
      gcmlimit: '500', gcmtype: 'file', prop: 'imageinfo', iiprop: 'url', ...cont,
    })
    const j = await (await fetch(`https://archives.bulbagarden.net/w/api.php?${q}`, { headers: { 'User-Agent': UA } })).json()
    for (const p of Object.values(j.query?.pages || {})) out[p.title.replace(/^File:/, '')] = p.imageinfo?.[0]?.url
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
    if (!url) { warn.push(`스프라이트 없음: ${p.id} (${archiveFileFor(p)})`); continue }
    const r = await download(url, path.join(SPRITES, 'pokemon', `${p.id}.png`))
    stat[r] = (stat[r] || 0) + 1
  }
  for (const id of Object.keys(items)) {
    const url = bag[`Bag ${itemData(id).name} Champs Sprite.png`]
    if (!url) { warn.push(`도구 스프라이트 없음: ${id} (${itemData(id).name})`); continue }
    const r = await download(url, path.join(SPRITES, 'items', `${id}.png`))
    stat[r] = (stat[r] || 0) + 1
  }
  console.log('스프라이트:', JSON.stringify(stat))
}

if (warn.length) {
  console.log(`\n경고 ${warn.length}건:`)
  for (const w of warn) console.log('  - ' + w)
}
