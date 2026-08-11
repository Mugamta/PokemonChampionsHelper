// scripts/scrape-op-gg-abilities.mjs
//
// https://op.gg/ko/pokemon-champions/abilities 에서 특성 이름+설명을 긁어서
// export const abilities: Record<string, string> = { '특성명': '설명', ... } 형태로 저장한다.
//
// items/moves 스크래퍼와 동일한 견고성 전략을 그대로 사용:
// - visible 대신 attached 상태로 대기 (숨겨진 중복 뷰 대응)
// - offsetParent 체크로 실제 렌더링된 요소만 사용
// - 실패 시 scripts/.debug/ 에 스크린샷+HTML 덤프
//
// DOM 구조를 아직 실제로 못 봐서, items 페이지와 같은 role="table"/role="row" 구조,
// 설명 텍스트는 "text-muted-foreground" 클래스가 붙은 셀이라는 가정으로 작성했습니다.
// 실행 후 안 맞으면 scripts/.debug/abilities-timeout.html 을 보내주세요.
//
// 사용법: node scripts/scrape-op-gg-abilities.mjs  (HEADFUL=1 로 창 띄워서 확인 가능)

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const URL = 'https://op.gg/ko/pokemon-champions/abilities';
const OUTPUT_FILE = path.join(ROOT, 'data', 'abilities.ts'); // 필요시 실제 경로로 수정

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
  const checked = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('label, span')).find(
      (el) => el.textContent.trim() === '테이블 뷰'
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

async function scrollUntilStable(page) {
  let prevCount = -1;
  let stable = 0;
  for (let i = 0; i < 150; i++) {
    const count = await page.$$eval(
      'a[href*="/pokemon-champions/abilities/"]',
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
}

async function extractAbilities(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[role="rowgroup"] [role="row"]'));
    const result = {};

    for (const row of rows) {
      const links = Array.from(
        row.querySelectorAll('a[href*="/pokemon-champions/abilities/"]')
      ).filter((a) => a.offsetParent !== null);
      const nameLink = links.find((a) => a.textContent.trim().length > 0);
      if (!nameLink) continue;
      const name = nameLink.textContent.trim();

      // 설명: 이름 링크와 같은 셀 안의 <p class="text-muted-foreground ...">에 들어있음
      // (형제로 "N 포켓몬" 같은 span도 같은 클래스를 쓰므로 p 태그로 좁혀야 함)
      const descEl = row.querySelector('p.text-muted-foreground');
      const description = descEl ? descEl.textContent.trim() : '';

      if (name && !result[name]) {
        result[name] = description;
      }
    }
    return result;
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

  console.log('특성 목록 수집 중... (/abilities)');
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(`  응답 상태: ${response?.status()}`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
    console.log('  networkidle 타임아웃 (무시하고 진행)');
  });

  await ensureTableView(page);

  const found = await page
    .waitForSelector('a[href*="/pokemon-champions/abilities/"]', { state: 'attached', timeout: 30000 })
    .catch(() => null);

  if (!found) {
    await dumpDebugInfo(page, 'abilities-timeout');
    await browser.close();
    throw new Error('특성 목록을 찾지 못했습니다. scripts/.debug/ 를 확인하세요.');
  }

  await scrollUntilStable(page); // 혹시 모를 가상 스크롤/lazy-load 대비

  const abilities = await extractAbilities(page);
  await browser.close();

  const names = Object.keys(abilities);
  console.log(`총 ${names.length}개 특성 수집`);
  if (names.length === 0) {
    console.warn('경고: 0개가 수집됐습니다. DOM 구조가 예상과 다를 수 있습니다.');
  }

  names.sort((a, b) => a.localeCompare(b, 'ko'));

  const lines = [];
  lines.push('// 이 파일은 scripts/scrape-op-gg-abilities.mjs 로 자동 생성되었습니다.');
  lines.push('export const abilities: Record<string, string> = {');
  for (const name of names) {
    const desc = (abilities[name] || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    lines.push(`    '${name.replace(/'/g, "\\'")}': '${desc}',`);
  }
  lines.push('};');
  lines.push('');

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, lines.join('\n'), 'utf-8');

  console.log(`완료: ${path.relative(ROOT, OUTPUT_FILE)} 에 저장`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
