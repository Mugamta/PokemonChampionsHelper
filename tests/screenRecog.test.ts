// 화면 인식 (utils/screenRecog.ts) — 합성 이미지로 칸 찾기·아이콘 매칭·성별 기호·OCR 보정 확인
// 실제 게임 스크린샷은 저작물이라 레포에 넣지 않는다 (실제 화면으로 확인한 결과·방법은 docs/KNOWN_ISSUES.md "화면 인식")
import { describe, expect, it } from 'vitest'
import {
  baseName,
  cleanOcrLine,
  editDistance,
  findPanels,
  genderMark,
  isConfident,
  matchIcons,
  ocrPrep,
  pickItem,
  pickWithOcr,
  type IconTemplate,
  type Rgba,
} from '~/utils/screenRecog'

// ── 합성 이미지 도구 ─────────────────────────────────────────────
const BASE = 64

function canvas(w: number, h: number, rgb: [number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let k = 0; k < w * h; k++) data.set([rgb[0], rgb[1], rgb[2], 255], k * 4)
  return { data, width: w, height: h }
}
function fillRect(img: Rgba, x: number, y: number, w: number, h: number, rgb: number[]) {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++)
      img.data.set([rgb[0]!, rgb[1]!, rgb[2]!, 255], (j * img.width + i) * 4)
}

// id 마다 다른 모양·색의 스프라이트 (투명 바탕)
function sprite(k: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(BASE * BASE * 4)
  const cx = 20 + ((k * 7) % 24)
  const cy = 22 + ((k * 11) % 20)
  const rx = 10 + ((k * 5) % 14)
  const ry = 12 + ((k * 3) % 12)
  const col = [(k * 83) % 256, (k * 151 + 60) % 256, (k * 47 + 120) % 256]
  for (let y = 0; y < BASE; y++)
    for (let x = 0; x < BASE; x++) {
      const inEll = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
      const inBar = k % 2 === 0 ? x > 44 && x < 54 && y > 8 && y < 56 : y > 46 && y < 54 && x > 6
      if (inEll || inBar)
        d.set(inBar ? [255 - col[0]!, col[2]!, col[1]!, 255] : [...col, 255], (y * BASE + x) * 4)
    }
  return d
}
// 최근접 축소 (테스트용)
function resize(src: Uint8ClampedArray, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = Math.min(BASE - 1, Math.floor(((x + 0.5) * BASE) / size))
      const sy = Math.min(BASE - 1, Math.floor(((y + 0.5) * BASE) / size))
      out.set(src.subarray((sy * BASE + sx) * 4, (sy * BASE + sx) * 4 + 4), (y * size + x) * 4)
    }
  return out
}
function paste(img: Rgba, spr: Uint8ClampedArray, size: number, x0: number, y0: number) {
  const s = resize(spr, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = s[(y * size + x) * 4 + 3]! / 255
      const j = ((y0 + y) * img.width + x0 + x) * 4
      for (let c = 0; c < 3; c++)
        img.data[j + c] = a * s[(y * size + x) * 4 + c]! + (1 - a) * img.data[j + c]!
    }
}

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const SPRITES = IDS.map((_, k) => sprite(k + 1))
const templatesAt = (size: number): IconTemplate[] =>
  IDS.map((id, k) => ({ id, data: resize(SPRITES[k]!, size) }))

const CRIMSON: [number, number, number] = [150, 5, 50]
const PURPLE: [number, number, number] = [105, 90, 220]
const PANEL_H = 44

// 상대 6칸 (오른쪽, 진홍) + 내 6칸 (왼쪽, 보라) 선출 화면 흉내
function screen(oppOrder: number[], genders: ('M' | 'F' | '')[] = []): Rgba {
  const img = canvas(640, 360, [12, 14, 30])
  oppOrder.forEach((k, i) => {
    const y = 30 + i * 52
    fillRect(img, 450, y, 150, PANEL_H, CRIMSON)
    const size = Math.round(PANEL_H * 0.95)
    paste(
      img,
      SPRITES[k]!,
      size,
      Math.round(450 + PANEL_H - size / 2),
      Math.round(y + PANEL_H * 0.52 - size / 2),
    )
    // 성별 기호 (칸 높이 기준 x 1.87, y 0.76)
    const g = genders[i]
    if (g)
      fillRect(
        img,
        Math.round(450 + PANEL_H * 1.87) - 4,
        Math.round(y + PANEL_H * 0.76) - 4,
        8,
        8,
        g === 'M' ? [30, 90, 235] : [225, 30, 50],
      )
  })
  for (let i = 0; i < 6; i++) fillRect(img, 40, 30 + i * 52, 200, PANEL_H - 6, PURPLE)
  return img
}

// ── 칸 찾기 ─────────────────────────────────────────────
describe('findPanels', () => {
  it('상대 6칸의 위치·크기를 찾는다', () => {
    const p = findPanels(screen([0, 1, 2, 3, 4, 5]), 'opp')!
    expect(p).toHaveLength(6)
    expect(p[0]).toMatchObject({ x: 450, y: 30, h: PANEL_H })
    expect(p[0]!.w).toBeGreaterThanOrEqual(148)
    expect(p[5]!.y).toBe(30 + 5 * 52)
  })
  it('내 6칸 (보라)도 찾는다', () => {
    const p = findPanels(screen([0, 1, 2, 3, 4, 5]), 'mine')!
    expect(p).toHaveLength(6)
    expect(p[0]).toMatchObject({ x: 40, w: 200, h: PANEL_H - 6 })
  })
  it('칸이 없는 이미지는 null', () => {
    expect(findPanels(canvas(320, 180, [20, 20, 20]), 'opp')).toBeNull()
  })
  it('칸이 6개보다 적으면 null', () => {
    const img = canvas(640, 360, [12, 14, 30])
    for (let i = 0; i < 4; i++) fillRect(img, 450, 30 + i * 52, 150, PANEL_H, CRIMSON)
    expect(findPanels(img, 'opp')).toBeNull()
  })
})

// ── 아이콘 매칭 ─────────────────────────────────────────────
describe('matchIcons', () => {
  it('칸마다 같은 스프라이트를 1순위로 고른다', () => {
    const order = [3, 1, 7, 0, 5, 2]
    const img = screen(order)
    const m = matchIcons(img, findPanels(img, 'opp')!, 'opp', templatesAt)
    expect(m.map((s) => s.candidates[0]!.id)).toEqual(order.map((k) => IDS[k]))
    // 그대로 붙인 그림이라 1순위 차이는 거의 0, 2순위와 뚜렷이 차이
    for (const s of m) {
      expect(s.candidates[0]!.score).toBeLessThan(15)
      expect(isConfident(s.candidates)).toBe(true)
    }
  })
  it('후보 수는 top 개까지', () => {
    const img = screen([0, 1, 2, 3, 4, 5])
    const m = matchIcons(img, findPanels(img, 'opp')!, 'opp', templatesAt, 3)
    expect(m[0]!.candidates).toHaveLength(3)
  })
})

describe('isConfident', () => {
  it('2순위가 1순위의 1.25배 이상이면 믿을 만함', () => {
    expect(
      isConfident([
        { id: 'a', score: 40 },
        { id: 'b', score: 50 },
      ]),
    ).toBe(true)
    expect(
      isConfident([
        { id: 'a', score: 40 },
        { id: 'b', score: 45 },
      ]),
    ).toBe(false)
    expect(isConfident([{ id: 'a', score: 40 }])).toBe(true)
  })
})

// ── 성별 기호 ─────────────────────────────────────────────
describe('genderMark', () => {
  it('파랑 = 수컷, 빨강 = 암컷, 없음 = 빈 값', () => {
    const img = screen([0, 1, 2, 3, 4, 5], ['M', 'F', '', 'M', 'F', ''])
    const p = findPanels(img, 'opp')!
    expect(p.map((q) => genderMark(img, q))).toEqual(['M', 'F', '', 'M', 'F', ''])
  })
})

// ── OCR 보정 ─────────────────────────────────────────────
describe('OCR 글자 → 이름', () => {
  const ko: Record<string, string> = {
    rotom: '로토무',
    rotomwash: '워시로토무',
    rotomfrost: '프로스트로토무',
    garchomp: '한카리아스',
    ninetales: '나인테일',
    ninetalesalola: '나인테일 (알로라의 모습)',
    charizard: '리자몽',
  }
  const nameOf = (id: string) => ko[id] ?? id
  const all = Object.keys(ko)

  it('cleanOcrLine: 큰 공백 뒤 잡음·앞뒤 기호 제거', () => {
    expect(cleanOcrLine("'어릉염                    대")).toBe('어릉염')
    expect(cleanOcrLine('.한카리아스    @')).toBe('한카리아스')
    expect(cleanOcrLine('~] |      ?')).toBe('')
  })
  it('baseName: 폼 괄호 제거', () => {
    expect(baseName('나인테일 (알로라의 모습)')).toBe('나인테일')
    expect(baseName('キュウコン (アローラのすがた)')).toBe('キュウコン')
  })
  it('editDistance: 한글은 음절 단위', () => {
    expect(editDistance('로로', '로토무')).toBe(2)
    expect(editDistance('기합의티', '기합의띠')).toBe(1)
  })
  it('아이콘 후보 중 이름이 확실히 가까운 것으로 바꾼다 (잘린 로토무 아이콘)', () => {
    const cands = [
      { id: 'rotomfrost', score: 96 },
      { id: 'rotomwash', score: 96 },
      { id: 'rotom', score: 99 },
    ]
    expect(pickWithOcr(cands, '로로', nameOf, all)).toBe('rotom')
  })
  it('글자를 못 읽으면 아이콘 1순위', () => {
    const cands = [
      { id: 'garchomp', score: 30 },
      { id: 'charizard', score: 60 },
    ]
    expect(pickWithOcr(cands, '', nameOf, all)).toBe('garchomp')
    expect(pickWithOcr(cands, '~] |', nameOf, all)).toBe('garchomp')
  })
  it('폼은 이름이 같으므로 아이콘 순위를 따른다', () => {
    const cands = [
      { id: 'ninetalesalola', score: 52 },
      { id: 'ninetales', score: 80 },
    ]
    expect(pickWithOcr(cands, '나민테일', nameOf, all)).toBe('ninetalesalola')
  })
  it('아이콘 후보에 없어도 전체 이름과 거의 같으면 그것', () => {
    const cands = [{ id: 'charizard', score: 70 }]
    expect(pickWithOcr(cands, '한카리아스', nameOf, all)).toBe('garchomp')
  })
  it('pickItem: 가장 가까운 도구, 동점이면 전부, 너무 다르면 없음', () => {
    const items: [string, string][] = [
      ['focussash', '기합의띠'],
      ['sitrusberry', '자몽열매'],
      ['charizarditex', '리자몽나이트X'],
      ['charizarditey', '리자몽나이트Y'],
    ]
    expect(pickItem('기합의티', items)).toEqual(['focussash'])
    expect(pickItem('자몽열해', items)).toEqual(['sitrusberry'])
    expect(pickItem('리자몽나이트', items).sort()).toEqual(['charizarditex', 'charizarditey'])
    expect(pickItem('먹다남은음식', items)).toEqual([])
  })
})

describe('ocrPrep', () => {
  it('밝은 글자(흰 글자 + 보라 바탕)는 반전해서 어두운 글자로', () => {
    const img = canvas(10, 10, PURPLE)
    fillRect(img, 4, 4, 2, 2, [250, 250, 250])
    const out = ocrPrep(img)
    const at = (x: number, y: number) => out[(y * 10 + x) * 4]!
    expect(at(4, 4)).toBeLessThan(at(0, 0))
  })
  it('어두운 글자(연두 칸의 남색 글자)는 그대로', () => {
    const img = canvas(10, 10, [200, 240, 40])
    fillRect(img, 4, 4, 2, 2, [20, 40, 120])
    const out = ocrPrep(img)
    expect(out[(4 * 10 + 4) * 4]!).toBeLessThan(out[0]!)
  })
})
