// scripts/scrape-op-gg-items.mjs
//
// https://op.gg/ko/pokemon-champions/items 에서
// "지닌 아이템"과 "열매" 카테고리만 골라 이름(한글)만 추출해서
// export const items = [...] 형태의 TS 파일을 교체한다.
//
// 왜 이 구조인가:
// - /items 페이지는 "전체 카테고리" 탭이 기본 선택 상태에서
//   지닌 아이템 / 메가돌 / 열매 / 기타 섹션이 전부 한 페이지에 렌더링됨
//   (기술 페이지와 달리 가상 스크롤 없음 - 44개 지닌 아이템이 한 번에 DOM에 존재)
// - 각 카테고리는 "카테고리명 (개수)" 헤더 div 바로 다음 형제로 role="table" div가 옴
//   -> 헤더 텍스트로 카테고리를 구분해서, 지닌 아이템/열매만 골라 이름만 뽑는다
// - 메가돌(별도 로직 처리 예정)과 기타(뽑기 티켓 등 지닐 수 없는 것)는 제외
//
// 출력 경로(OUTPUT_FILE)는 실제 레포 구조에 맞게 필요시 수정하세요.
// 기본값은 @/data/moves.js 등과 같은 위치로 추정한 src/data/items.ts 입니다.
//
// 사용법:
//   node scripts/scrape-op-gg-items.mjs
//   (HEADFUL=1 로 실행하면 실제 브라우저 창으로 확인 가능)

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const URL = 'https://op.gg/ko/pokemon-champions/items';
const OUTPUT_FILE = path.join(ROOT, 'src', 'data', 'items.ts'); // 필요시 실제 경로로 수정

const INCLUDE_CATEGORIES = ['지닌 아이템', '열매'];

async function dumpDebugInfo(page, label) {
  try {
    const debugDir = path.join(__dirname, '.debug');
    await fs.mkdir(debugDir, { recursive: true });
    await page.screenshot({ path: path.join(debugDir, `${label}.png`), fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    await fs.writeFile(path.join(debugDir, `${label}.html`), html, 'utf-8');
    console.error(`  [디버그] 저장됨: scripts/.debug/${label}.png, ${label}.html`);
  } catch (e) {
    console.error('  [디버그] 덤프 실패:', e.message);
  }
}

async function ensureTableView(page) {
  // "테이블 뷰" 체크박스가 꺼져 있으면 켠다 (기본값은 켜져 있음)
  const checked = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('label, span')).find((el) =>
      el.textContent.trim() === '테이블 뷰'
    );
    if (!label) return null;
    const container = label.closest('label') || label.parentElement;
    const checkbox = container ? container.querySelector('input[type="checkbox"]') : null;
    return checkbox ? checkbox.checked : null;
  });
  if (checked === false) {
    await page.getByText('테이블 뷰').click();
    await page.waitForTimeout(300);
  }
}

async function getCategorizedItems(page) {
  return page.evaluate(() => {
    // "카테고리명 (숫자)" 형태의 헤더 div를 찾아서, 바로 다음 형제(role="table")를 읽는다.
    const headers = Array.from(document.querySelectorAll('div')).filter((div) => {
      if (div.children.length > 0) return false; // 헤더는 텍스트만 있는 리프 노드
      return /^[^\d]+\(\d+\)$/.test(div.textContent.trim());
    });

    return headers.map((h) => {
      const text = h.textContent.trim();
      const name = text.replace(/\s*\(\d+\)\s*$/, '').trim();
      const table = h.nextElementSibling;
      if (!table || table.getAttribute('role') !== 'table') {
        return { name, items: [] };
      }
      const rows = Array.from(table.querySelectorAll('[role="rowgroup"] [role="row"]'));
      const items = rows
        .map((row) => {
          const link = row.querySelector('a[href*="/pokemon-champions/items/"] + div a, a[href*="/pokemon-champions/items/"]');
          // 이름 셀의 두 번째 a(툴팁/뱃지 제외한 텍스트 링크)를 우선 사용
          const links = Array.from(row.querySelectorAll('a[href*="/pokemon-champions/items/"]'));
          const nameLink = links.find((a) => a.textContent.trim().length > 0) || link;
          return nameLink ? nameLink.textContent.trim() : null;
        })
        .filter(Boolean);
      return { name, items };
    });
  });
}

async function main() {
  const headless = process.env.HEADFUL !== '1';
  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 1200 },
    locale: 'ko-KR',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  console.log('아이템 목록 수집 중... (/items)');
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(`  응답 상태: ${response?.status()}`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
    console.log('  networkidle 타임아웃 (무시하고 진행)');
  });

  await ensureTableView(page);

  const found = await page.waitForSelector('[role="table"]', { state: 'attached', timeout: 30000 }).catch(() => null);
  if (!found) {
    await dumpDebugInfo(page, 'items-list-timeout');
    await browser.close();
    throw new Error('아이템 테이블을 찾지 못했습니다. scripts/.debug/ 를 확인하세요.');
  }

  const categories = await getCategorizedItems(page);
  await browser.close();

  console.log('발견된 카테고리:');
  for (const c of categories) {
    console.log(`  - ${c.name}: ${c.items.length}개`);
  }

  const grouped = INCLUDE_CATEGORIES.map((catName) => {
    const cat = categories.find((c) => c.name === catName);
    return { name: catName, items: cat ? cat.items : [] };
  });

  const missing = grouped.filter((g) => g.items.length === 0);
  if (missing.length > 0) {
    console.warn(
      `경고: 다음 카테고리를 못 찾았거나 비어 있습니다 - ${missing.map((m) => m.name).join(', ')}. ` +
        `카테고리 헤더 텍스트가 정확히 일치하는지, DOM 구조가 예상과 다른지 scripts/.debug 로 확인해보세요.`
    );
  }

  const lines = [];
  lines.push('// 이 파일은 scripts/scrape-op-gg-items.mjs 로 자동 생성되었습니다.');
  lines.push('// (op.gg 포켓몬 챔피언스 /items 페이지 - 지닌 아이템 + 열매)');
  lines.push('export const items = [');
  for (const g of grouped) {
    if (g.items.length === 0) continue;
    lines.push(`    // ${g.name}`);
    for (const name of g.items) {
      lines.push(`    '${name.replace(/'/g, "\\'")}',`);
    }
    lines.push('');
  }
  // 마지막 빈 줄 제거
  while (lines[lines.length - 1] === '') lines.pop();
  lines.push('];');
  lines.push('');

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, lines.join('\n'), 'utf-8');

  const total = grouped.reduce((sum, g) => sum + g.items.length, 0);
  console.log(`완료: 총 ${total}개 아이템을 ${path.relative(ROOT, OUTPUT_FILE)} 에 저장`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
