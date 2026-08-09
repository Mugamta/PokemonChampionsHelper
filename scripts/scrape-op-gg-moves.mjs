// scripts/scrape-op-gg-moves.mjs
//
// op.gg 포켓몬 챔피언스(https://op.gg/ko/pokemon-champions)에서
// "기술별 배우는 포켓몬 목록"을 크롤링해서 public/pokemon_list/{도감번호}.json 의
// moves 필드를 op.gg 기준 데이터로 덮어쓴다.
//
// 왜 이 구조인가:
// - op.gg는 데이터를 API/네트워크로 노출하지 않음 (Next.js 하이드레이션 내부에만 존재)
//   -> 헤드리스 브라우저로 실제 렌더링 후 DOM을 읽어야 함
// - /moves 마스터 목록(502개)은 가상화 없이 전부 렌더링됨 -> 한 번에 수집
// - /moves/{slug} 페이지의 "배우는 포켓몬" 테이블은 react-window 방식의
//   가상 스크롤(data-index)이라 화면에 보이는 행만 DOM에 존재함
//   -> 스크롤하면서 "보이는 행"을 계속 누적(Map)해야 전체를 얻을 수 있음
// - 한글 기술명은 절대로 별도 매칭하지 않는다: /moves 목록 페이지에서
//   href(slug)와 한글명이 같은 <a> 안에 같이 있으므로, 그 자리에서 함께 추출한다.
//
// 사용법:
//   npm i -D playwright
//   npx playwright install chromium
//   node scripts/scrape-op-gg-moves.mjs
//
// 재실행 시 scripts/.moves-scrape-cache.json 에 기술별 결과를 캐싱해서
// 중간에 끊겨도 이어서 진행한다 (완료된 기술은 다시 크롤링하지 않음).

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE = 'https://op.gg/ko/pokemon-champions';
const OUTPUT_DIR = path.join(ROOT, 'public', 'pokemon_list');
const CACHE_FILE = path.join(__dirname, '.moves-scrape-cache.json');

// ---------- 1. 마스터 기술 목록 (전체 slug + 한글명, 가상화 없음) ----------

async function dumpDebugInfo(page, label) {
  try {
    const debugDir = path.join(__dirname, '.debug');
    await fs.mkdir(debugDir, { recursive: true });
    await page.screenshot({ path: path.join(debugDir, `${label}.png`), fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    await fs.writeFile(path.join(debugDir, `${label}.html`), html, 'utf-8');
    console.error(`  [디버그] 저장됨: scripts/.debug/${label}.png, ${label}.html`);
    console.error(`  [디버그] 현재 URL: ${page.url()}`);
    console.error(`  [디버그] <body> 텍스트 길이: ${await page.evaluate(() => document.body.innerText.length)}`);
  } catch (e) {
    console.error('  [디버그] 덤프 실패:', e.message);
  }
}

async function getAllMoves(page) {
  const response = await page.goto(`${BASE}/moves`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(`  [디버그] 응답 상태: ${response?.status()}, 최종 URL: ${page.url()}`);

  // networkidle을 기다리되, 안 잡혀도 계속 진행 (분석 스크립트 등으로 영원히 안 끝날 수 있음)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
    console.log('  [디버그] networkidle 타임아웃 (무시하고 진행)');
  });

  try {
    await page.waitForSelector('a[href^="/ko/pokemon-champions/moves/"]', {
      state: 'attached',
      timeout: 30000,
    });
  } catch (e) {
    await dumpDebugInfo(page, 'moves-list-timeout');
    throw e;
  }

  // 페이지에 카드형/테이블형 등 뷰가 동시에 존재할 수 있어서(예: 502개가 1004개로 중복 검출)
  // 실제로 화면에 렌더링된(숨겨지지 않은) 요소만 사용한다.

  // 혹시라도 lazy-load(무한 스크롤)일 경우를 대비해 안정될 때까지 스크롤
  let prevCount = -1;
  let stable = 0;
  for (let i = 0; i < 100; i++) {
    const count = await page.$$eval(
      'a[href^="/ko/pokemon-champions/moves/"]',
      (els) => new Set(els.map((e) => e.getAttribute('href'))).size
    );
    if (count === prevCount) {
      stable++;
      if (stable >= 3) break;
    } else {
      stable = 0;
    }
    prevCount = count;
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
  }

  const moves = await page.$$eval('a[href^="/ko/pokemon-champions/moves/"]', (links) => {
    const seen = new Map();
    for (const a of links) {
      if (a.offsetParent === null) continue; // display:none 등으로 숨겨진 중복 요소 제외
      const href = a.getAttribute('href');
      const slug = href.split('/').filter(Boolean).pop();
      const nameEl = a.querySelector('span.truncate') || a.querySelector('span');
      const name = nameEl ? nameEl.textContent.trim() : null;
      if (slug && name && !seen.has(slug)) seen.set(slug, { slug, name });
    }
    return Array.from(seen.values());
  });

  return moves;
}

// ---------- 2. 기술별 상세 페이지 -> 배우는 포켓몬 목록 (가상 스크롤 대응) ----------

async function extractVisiblePokemonRows(page) {
  return page.$$eval('a[href^="/ko/pokemon-champions/pokedex/"]', (links) =>
    links
      .filter((a) => a.offsetParent !== null) // 숨겨진 중복 뷰 제외
      .map((a) => {
        const href = a.getAttribute('href');
        const pokeSlug = href.split('/').filter(Boolean).pop();
        let dex = null;

        const img = a.querySelector('img');
        if (img && img.src) {
          const m = img.src.match(/pokemon\/(\d+)\.png/);
          if (m) dex = parseInt(m[1], 10);
        }
        if (!dex) {
          const hashSpan = Array.from(a.querySelectorAll('span')).find((s) =>
            /^#\d+$/.test(s.textContent.trim())
          );
          if (hashSpan) dex = parseInt(hashSpan.textContent.replace('#', ''), 10);
        }
        return { pokeSlug, dex };
      })
  );
}

async function getPokemonForMove(page, slug) {
  await page.goto(`${BASE}/moves/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const found = await page
    .waitForSelector('a[href^="/ko/pokemon-champions/pokedex/"]', {
      state: 'attached',
      timeout: 15000,
    })
    .catch(() => null);
  if (!found) {
    await dumpDebugInfo(page, `move-detail-timeout-${slug}`);
  }

  const collected = new Map(); // pokeSlug -> { pokeSlug, dex }
  const merge = (rows) => {
    for (const r of rows) {
      if (r.dex) collected.set(r.pokeSlug, r);
    }
  };

  merge(await extractVisiblePokemonRows(page));

  const isVirtualized = await page.evaluate(() => !!document.querySelector('[data-index]'));
  if (!isVirtualized) {
    return Array.from(collected.values());
  }

  // 가상 스크롤 컨테이너를 자동으로 탐지 (overflow-y: auto/scroll 이면서 실제로 넘치는 조상 요소)
  await page.evaluate(() => {
    let el = document.querySelector('[data-index]');
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 2
      ) {
        window.__scrollContainer = el;
        return;
      }
      el = el.parentElement;
    }
    window.__scrollContainer = null; // 못 찾으면 window 스크롤로 대체
  });

  let prevSize = -1;
  let stable = 0;
  for (let i = 0; i < 400; i++) {
    merge(await extractVisiblePokemonRows(page));

    if (collected.size === prevSize) {
      stable++;
    } else {
      stable = 0;
    }
    prevSize = collected.size;

    const atBottom = await page.evaluate(() => {
      const c = window.__scrollContainer;
      if (!c) {
        window.scrollBy(0, 600);
        return (
          document.documentElement.scrollTop + window.innerHeight >=
          document.documentElement.scrollHeight - 5
        );
      }
      c.scrollTop = Math.min(c.scrollTop + c.clientHeight * 0.8, c.scrollHeight);
      return c.scrollTop + c.clientHeight >= c.scrollHeight - 5;
    });

    await page.waitForTimeout(180);

    if (atBottom && stable >= 3) break;
  }

  merge(await extractVisiblePokemonRows(page));
  return Array.from(collected.values());
}

// ---------- 3. 실행 ----------

function applyToMap(map, move, rows) {
  for (const r of rows) {
    if (!map.has(r.dex)) map.set(r.dex, []);
    const arr = map.get(r.dex);
    if (!arr.some((m) => m.slug === move.slug)) {
      arr.push({ slug: move.slug, name: move.name });
    }
  }
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache), 'utf-8');
}

async function main() {
  // HEADFUL=1 node scripts/scrape-op-gg-moves.mjs 로 실행하면 실제 창을 띄워서 확인 가능
  const headless = process.env.HEADFUL !== '1';
  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  });
  // navigator.webdriver 등 자동화 감지 흔적 제거
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  console.log('마스터 기술 목록 수집 중... (/moves)');
  const moves = await getAllMoves(page);
  console.log(`총 ${moves.length}개 기술 발견`);

  const cache = await loadCache();
  const pokemonMoves = new Map(); // dex -> [{slug, name}]

  for (const [i, move] of moves.entries()) {
    if (cache[move.slug]) {
      applyToMap(pokemonMoves, move, cache[move.slug]);
      continue;
    }
    console.log(`[${i + 1}/${moves.length}] ${move.slug} (${move.name}) 배우는 포켓몬 수집 중...`);
    try {
      const rows = await getPokemonForMove(page, move.slug);
      cache[move.slug] = rows;
      applyToMap(pokemonMoves, move, rows);
      await saveCache(cache);
      console.log(`  -> ${rows.length}마리`);
    } catch (e) {
      console.error(`  실패: ${move.slug} - ${e.message}`);
    }
  }

  await browser.close();

  console.log('public/pokemon_list/*.json moves 필드 갱신 중...');
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let updated = 0;
  for (const [dex, moveList] of pokemonMoves) {
    const fileName = `${dex}.json`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    let data = {};
    try {
      data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch {
      data = { id: dex };
    }

    // moves 필드만 덮어쓰고 나머지(id/name/stats/abilities 등)는 보존
    data.moves = moveList.sort((a, b) => a.slug.localeCompare(b.slug));

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    updated++;
  }

  console.log(`완료: ${updated}개 포켓몬 파일 갱신`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
