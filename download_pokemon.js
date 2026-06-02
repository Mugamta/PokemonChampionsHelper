import fs from 'fs'

// 폴더 생성
if (!fs.existsSync('./pokemon_list')) {
  fs.mkdirSync('./pokemon_list')
}

// -------------------- 공통 --------------------
const MAX_ID = 1025
const CONCURRENCY = 10  // 병렬 개수 (10~20 권장)

const getKoreanName = (names) => {
  const ko = names.find(n => n.language.name === 'ko')
  return ko ? ko.name : names[0].name
}

// 캐시
const cache = new Map()

const fetchWithCache = async (url) => {
  if (cache.has(url)) return cache.get(url)

  const res = await fetch(url)
  const data = await res.json()
  cache.set(url, data)
  return data
}

// -------------------- 포켓몬 처리 --------------------
const getPokemon = async (id) => {
  const data = await fetchWithCache(`https://pokeapi.co/api/v2/pokemon/${id}`)

  const speciesData = await fetchWithCache(data.species.url)
  const koName = getKoreanName(speciesData.names)

  // 특성 병렬
  const abilities = await Promise.all(
    data.abilities.map(async (a) => {
      const abilityData = await fetchWithCache(a.ability.url)
      return getKoreanName(abilityData.names)
    })
  )

  // 기술 병렬
  const moves = await Promise.all(
    data.moves.map(async (m) => {
      const moveData = await fetchWithCache(m.move.url)
      return getKoreanName(moveData.names)
    })
  )

  return {
    id,
    name: koName,
    stats: {
      H: data.stats[0].base_stat,
      A: data.stats[1].base_stat,
      B: data.stats[2].base_stat,
      C: data.stats[3].base_stat,
      D: data.stats[4].base_stat,
      S: data.stats[5].base_stat
    },
    abilities,
    moves
  }
}

// -------------------- 병렬 풀 --------------------
const runPool = async (items, worker, limit) => {
  let i = 0

  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const current = i++
      const id = items[current]

      try {
        console.log(`processing ${id}`)
        const data = await worker(id)

        fs.writeFileSync(
          `./pokemon_list/${id}.json`,
          JSON.stringify(data, null, 2)
        )
      } catch (e) {
        console.log(`failed ${id}`, e.message)
      }
    }
  })

  await Promise.all(workers)
}

// -------------------- 실행 --------------------
const main = async () => {
  const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1)

  await runPool(ids, getPokemon, CONCURRENCY)

  console.log('done')
}

main()