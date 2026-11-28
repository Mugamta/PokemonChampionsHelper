// composables/useScreenRecog.ts
// 화면 인식: 선출 화면 스크린샷(붙여넣기·파일·화면 캡처) → 상대 6마리(아이콘 + 성별 기호) / 내 6마리(아이콘 + 이름·도구 글자).
// 계산은 utils/screenRecog.ts (순수 TS), 여기서는 브라우저 일: 이미지 디코딩, 스프라이트 축소 캐시, OCR(tesseract.js), 화면 공유.
// 이미지는 기기 안에서만 처리한다 (OCR 도 브라우저 안의 WebAssembly. 처음 한 번 엔진·언어 데이터를 CDN 에서 받음).

import {
  findPanels,
  genderMark,
  isConfident,
  matchIcons,
  ocrPrep,
  pickItem,
  pickWithOcr,
  textLines,
  type IconCandidate,
  type IconTemplate,
  type Rect,
  type Rgba,
} from '~/utils/screenRecog'
import type { Gender } from '~/utils/types'

export type OcrLang = 'ko' | 'ja' | 'en'
const TESS_LANG: Record<OcrLang, string> = { ko: 'kor', ja: 'jpn', en: 'eng' }

export interface RecogMon {
  /** 고른 종 (아이콘 1순위, 내 쪽은 OCR 이름으로 보정) */
  species: string
  candidates: IconCandidate[]
  /** 1순위가 2순위보다 충분히 나음 */
  confident: boolean
  /** 화면에서 잘라 낸 아이콘 (data URL, 결과 확인용) */
  crop: string
  /** 상대: 화면의 성별 기호 */
  gender?: Gender
  /** 내 쪽: OCR 로 읽은 도구 (동점이면 여러 개, 못 읽으면 빈 배열) */
  items?: string[]
  /** 내 쪽: OCR 로 읽은 글자 (확인용) */
  nameText?: string
  itemText?: string
}
export interface RecogResult {
  opp: RecogMon[] | null
  mine: RecogMon[] | null
  /** 내 쪽 글자 인식: 진행 중 / 완료 / 끔 / 실패 */
  ocr: 'pending' | 'ok' | 'off' | 'failed'
}
export type RecogStatus = 'idle' | 'working' | 'done' | 'notFound' | 'error'

// 매칭용 이미지 높이 (이보다 크면 줄임. 칸 높이 ≈ 화면 높이의 10% → 아이콘 약 50px 이면 충분하고 계산은 크기² 에 비례)
const MATCH_HEIGHT = 480

// ── 모듈 전역 캐시 (다이얼로그를 다시 열어도 유지) ─────────────
const spriteCache = new Map<string, Promise<HTMLImageElement | null>>()
let tplKey = ''
let tplCache = new Map<number, IconTemplate[]>()
let ocrWorker: Promise<import('tesseract.js').Worker> | null = null
let ocrWorkerLang: OcrLang | null = null
const stream = shallowRef<MediaStream | null>(null)

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
function makeCanvas(
  w: number,
  h: number,
): { canvas: OffscreenCanvas | HTMLCanvasElement; g: Canvas2D } {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const g = canvas.getContext('2d', { willReadFrequently: true }) as Canvas2D
  return { canvas, g }
}
const toDataUrl = async (c: OffscreenCanvas | HTMLCanvasElement) => {
  if ('toDataURL' in c) return c.toDataURL()
  const blob = await c.convertToBlob()
  return await new Promise<string>((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(blob)
  })
}

export function useScreenRecog() {
  const gd = useGameData()
  const reg = useRegulation()
  const status = ref<RecogStatus>('idle')
  const result = ref<RecogResult | null>(null)
  const canCapture = computed(() => import.meta.client && !!navigator.mediaDevices?.getDisplayMedia)

  // ── 스프라이트 → size×size RGBA (후보 = 현재 레귤레이션에서 고를 수 있는 포켓몬, 메가 제외) ─────────────
  const loadSprite = (id: string) => {
    let p = spriteCache.get(id)
    if (!p) {
      p = new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = () => res(null)
        img.src = gd.pokemonSprite(id)
      })
      spriteCache.set(id, p)
    }
    return p
  }
  const prepareTemplates = async (ids: string[]) => {
    const key = ids.join(',')
    const imgs = await Promise.all(ids.map(loadSprite))
    if (key !== tplKey) {
      tplKey = key
      tplCache = new Map()
    }
    const list = ids.map((id, k) => ({ id, img: imgs[k]! })).filter((x) => x.img)
    return (size: number): IconTemplate[] => {
      let t = tplCache.get(size)
      if (!t) {
        const { g } = makeCanvas(size, size)
        g.imageSmoothingQuality = 'high'
        t = list.map(({ id, img }) => {
          g.clearRect(0, 0, size, size)
          g.drawImage(img, 0, 0, size, size)
          return { id, data: g.getImageData(0, 0, size, size).data }
        })
        tplCache.set(size, t)
      }
      return t
    }
  }

  // ── OCR ─────────────
  const getOcr = async (lang: OcrLang) => {
    if (ocrWorker && ocrWorkerLang !== lang) {
      const old = ocrWorker
      ocrWorker = null
      void old.then((w) => w.terminate()).catch(() => {})
    }
    if (!ocrWorker) {
      ocrWorkerLang = lang
      ocrWorker = import('tesseract.js').then(async ({ createWorker, PSM }) => {
        const w = await createWorker(TESS_LANG[lang])
        await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
        return w
      })
      ocrWorker.catch(() => {
        ocrWorker = null
      })
    }
    return ocrWorker
  }
  // 원본 이미지의 사각형 r 을 줄 높이 64px 정도로 키워 OCR 전처리 후 읽기 (작은 글자는 Tesseract 가 잘 못 읽음)
  const readLine = async (worker: import('tesseract.js').Worker, src: ImageBitmap, r: Rect) => {
    const k = Math.max(1, 64 / Math.max(r.h, 1))
    const W = Math.max(1, Math.round(r.w * k))
    const H = Math.max(1, Math.round(r.h * k))
    const { canvas, g } = makeCanvas(W, H)
    g.imageSmoothingQuality = 'high'
    g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, W, H)
    const d = g.getImageData(0, 0, W, H)
    d.data.set(ocrPrep(d))
    g.putImageData(d, 0, 0)
    const input = 'toDataURL' in canvas ? canvas : await canvas.convertToBlob()
    const res = await worker.recognize(input as HTMLCanvasElement | Blob)
    return res.data.text
  }

  // ── 인식 ─────────────
  /**
   * 이미지 → 결과. 상대 쪽이 먼저 채워지고(result.opp), 내 쪽 글자 인식은 이어서 (result.mine / ocr).
   * ocrLang = null 이면 글자 인식 없이 아이콘만.
   */
  const recognize = async (src: Blob | ImageBitmap, ocrLang: OcrLang | null) => {
    status.value = 'working'
    result.value = null
    // 스피너가 먼저 그려지도록 한 프레임 양보 (매칭은 메인 스레드에서 1초 안팎)
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
    let bmp: ImageBitmap
    try {
      bmp = src instanceof Blob ? await createImageBitmap(src) : src
    } catch {
      status.value = 'error'
      return
    }
    const scale = Math.min(1, MATCH_HEIGHT / bmp.height)
    const W = Math.round(bmp.width * scale)
    const H = Math.round(bmp.height * scale)
    const { canvas, g } = makeCanvas(W, H)
    g.imageSmoothingQuality = 'high'
    g.drawImage(bmp, 0, 0, W, H)
    const img: Rgba = g.getImageData(0, 0, W, H)

    const ids = reg.selectableSpecies.value.filter((id) => !gd.pokemon(id)?.battleForm?.from)
    const templatesAt = await prepareTemplates(ids)
    const crop = async (r: Rect) => {
      const c = makeCanvas(r.w, r.h)
      c.g.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
      return toDataUrl(c.canvas)
    }

    const oppPanels = findPanels(img, 'opp')
    const minePanels = findPanels(img, 'mine')
    if (!oppPanels && !minePanels) {
      status.value = 'notFound'
      return
    }
    const opp = oppPanels
      ? await Promise.all(
          matchIcons(img, oppPanels, 'opp', templatesAt).map(async (m, i) => ({
            species: m.candidates[0]?.id ?? '',
            candidates: m.candidates,
            confident: isConfident(m.candidates),
            crop: await crop(m.icon),
            gender: genderMark(img, oppPanels[i]!),
          })),
        )
      : null
    const mineMatches = minePanels ? matchIcons(img, minePanels, 'mine', templatesAt) : null
    const mine = mineMatches
      ? await Promise.all(
          mineMatches.map(async (m) => ({
            species: m.candidates[0]?.id ?? '',
            candidates: m.candidates,
            confident: isConfident(m.candidates),
            crop: await crop(m.icon),
            items: [] as string[],
          })),
        )
      : null
    result.value = { opp, mine, ocr: mine && ocrLang ? 'pending' : 'off' }
    status.value = 'done'
    if (!mine || !minePanels || !ocrLang) return

    // 내 쪽 이름·도구 글자 (원본 해상도에서 자름)
    try {
      const worker = await getOcr(ocrLang)
      await gd.loadLocale(ocrLang)
      const names = gd.names.value[ocrLang]
      const nameOf = (id: string) => names?.pokemon?.[id] || id
      const items = Object.keys(gd.data.value?.items ?? {}).map(
        (id) => [id, names?.items?.[id] || id] as [string, string],
      )
      const up = (r: Rect): Rect => ({
        x: r.x / scale,
        y: r.y / scale,
        w: r.w / scale,
        h: r.h / scale,
      })
      for (let i = 0; i < mine.length; i++) {
        const lines = textLines(minePanels[i]!)
        const nameText = await readLine(worker, bmp, up(lines.name))
        const itemText = await readLine(worker, bmp, up(lines.item))
        const m = mine[i]!
        m.species = pickWithOcr(m.candidates, nameText, nameOf, ids)
        m.items = pickItem(itemText, items)
        Object.assign(m, { nameText: nameText.trim(), itemText: itemText.trim() })
      }
      result.value = { opp, mine: [...mine], ocr: 'ok' }
    } catch {
      result.value = { opp, mine, ocr: 'failed' }
    }
  }

  // ── 화면 공유 (캡처보드 화면 등). 한 번 허락하면 공유를 멈출 때까지 같은 화면을 다시 캡처 ─────────────
  const capture = async (ocrLang: OcrLang | null) => {
    if (!stream.value) {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        s.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (stream.value === s) stream.value = null
        })
        stream.value = s
      } catch {
        return // 사용자가 취소
      }
    }
    const video = document.createElement('video')
    video.muted = true
    video.srcObject = stream.value
    await video.play()
    await new Promise((r) => setTimeout(r, 150)) // 첫 프레임이 검게 나오는 브라우저가 있음
    const bmp = await createImageBitmap(video)
    video.pause()
    video.srcObject = null
    await recognize(bmp, ocrLang)
  }
  const stopCapture = () => {
    stream.value?.getTracks().forEach((t) => t.stop())
    stream.value = null
  }

  return {
    status,
    result,
    recognize,
    canCapture,
    capturing: computed(() => !!stream.value),
    capture,
    stopCapture,
  }
}
