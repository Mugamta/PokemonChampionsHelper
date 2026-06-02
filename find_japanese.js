import fs from 'fs'
import path from 'path'

const dir = './pokemon_list'

// 일본어 판별
const isJapanese = (str) => {
  return /[\u3040-\u30FF\u4E00-\u9FFF]/.test(str)
}

// 결과 저장용 (중복 제거)
const jpNames = new Set()
const jpAbilities = new Set()
const jpMoves = new Set()

const files = fs.readdirSync(dir)

for (const file of files) {
  const fullPath = path.join(dir, file)
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))

  // 이름
  if (isJapanese(data.name)) {
    jpNames.add(data.name)
  }

  // 특성
  for (const a of data.abilities) {
    if (isJapanese(a)) {
      jpAbilities.add(a)
    }
  }

  // 기술
  for (const m of data.moves) {
    if (isJapanese(m)) {
      jpMoves.add(m)
    }
  }
}

// 출력
console.log('\n[이름]')
for (const n of jpNames) {
  console.log(n)
}

console.log('\n[특성]')
for (const a of jpAbilities) {
  console.log(a)
}

console.log('\n[기술]')
for (const m of jpMoves) {
  console.log(m)
}