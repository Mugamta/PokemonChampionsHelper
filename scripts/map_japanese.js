import fs from 'fs'
import path from 'path'

const SRC = './pokemon_list'
const DST = './pokemon_list2'

if (!fs.existsSync(DST)) {
  fs.mkdirSync(DST)
}

// 일본어 판별 (가타카나/히라가나만)
const isJapanese = (str) => {
  return /[\u3040-\u30FF]/.test(str)
}

const getName = (names, lang) => {
  const obj = names.find(n => n.language.name === lang)
  return obj ? obj.name : null
}

// 캐시
const moveCache = new Map()
const abilityCache = new Map()

// move 변환
const convertMove = async (jpName) => {
  if (moveCache.has(jpName)) return moveCache.get(jpName)

  const res = await fetch(`https://pokeapi.co/api/v2/move?limit=10000`)
  const data = await res.json()

  for (const m of data.results) {
    const res2 = await fetch(m.url)
    const moveData = await res2.json()

    const ja = getName(moveData.names, 'ja')
    if (ja === jpName) {
      const ko = getName(moveData.names, 'ko')
      moveCache.set(jpName, ko || jpName)
      return ko || jpName
    }
  }

  moveCache.set(jpName, jpName)
  return jpName
}

// ability 변환
const convertAbility = async (jpName) => {
  if (abilityCache.has(jpName)) return abilityCache.get(jpName)

  const res = await fetch(`https://pokeapi.co/api/v2/ability?limit=10000`)
  const data = await res.json()

  for (const a of data.results) {
    const res2 = await fetch(a.url)
    const abilityData = await res2.json()

    const ja = getName(abilityData.names, 'ja')
    if (ja === jpName) {
      const ko = getName(abilityData.names, 'ko')
      abilityCache.set(jpName, ko || jpName)
      return ko || jpName
    }
  }

  abilityCache.set(jpName, jpName)
  return jpName
}

// 변환 실행
const main = async () => {
  const files = fs.readdirSync(SRC)

  for (const file of files) {
    const src = path.join(SRC, file)
    const dst = path.join(DST, file)

    const data = JSON.parse(fs.readFileSync(src))

    // moves
    const newMoves = []
    for (const m of data.moves) {
      if (isJapanese(m)) {
        newMoves.push(await convertMove(m))
      } else {
        newMoves.push(m)
      }
    }

    // abilities
    const newAbilities = []
    for (const a of data.abilities) {
      if (isJapanese(a)) {
        newAbilities.push(await convertAbility(a))
      } else {
        newAbilities.push(a)
      }
    }

    data.moves = newMoves
    data.abilities = newAbilities

    fs.writeFileSync(dst, JSON.stringify(data, null, 2))
    console.log(`converted ${file}`)
  }

  console.log('done')
}

main()