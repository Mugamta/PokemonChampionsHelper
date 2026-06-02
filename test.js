import fs from 'fs'
import path from 'path'

const SRC = './pokemon_list'
const DST = './pokemon_list2'

if (!fs.existsSync(DST)) {
  fs.mkdirSync(DST)
}

// 일본어 제거 (한글만 남김)
const isJapanese = (str) => {
  return /[\u3040-\u30FF]/.test(str)
}

const files = fs.readdirSync(SRC)

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(SRC, file)))

  data.moves = data.moves.map(m => {
    if (isJapanese(m)) return null
    return m
  }).filter(Boolean)

  data.abilities = data.abilities.map(a => {
    if (isJapanese(a)) return null
    return a
  }).filter(Boolean)

  fs.writeFileSync(path.join(DST, file), JSON.stringify(data, null, 2))
}