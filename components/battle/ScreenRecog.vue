<!--
  스크린샷 인식 (선출 화면 상대 파티 칸 제목 줄의 버튼 + 다이얼로그)
  게임의 선출 화면 스크린샷을 붙여넣기(Ctrl+V)·끌어 놓기·파일 선택·화면 공유로 받아
  상대 6마리(아이콘 + 성별 기호)를 인식하고 → 확인·수정 후 상대 파티에 적용.
  내 쪽 6마리는 아이콘 + 이름·도구 글자(OCR)로 읽어서 저장한 파티와 다른 점만 알려 준다 (내 파티는 바꾸지 않음).
  계산은 composables/useScreenRecog.ts → utils/screenRecog.ts
-->
<template>
  <button type="button" class="btn btn-sm" :title="t('recog.buttonHint')" @click="open = true">
    {{ t('recog.button') }}
  </button>
  <v-dialog v-model="open" max-width="720" scrollable>
    <section
      v-if="open"
      class="panel panel-pad recog"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <h3 class="panel-title">
        {{ t('recog.title') }}
        <span class="spacer" />
        <button
          type="button"
          class="btn btn-sm"
          :aria-label="t('recog.close')"
          @click="open = false"
        >
          ✕
        </button>
      </h3>
      <div class="body-scroll">
        <!-- 입력 -->
        <div class="drop" :class="{ dragging }">
          <p class="small">{{ t('recog.hint') }}</p>
          <div class="chip-row">
            <button type="button" class="btn btn-sm" @click="fileInput?.click()">
              {{ t('recog.pickFile') }}
            </button>
            <template v-if="sr.canCapture.value">
              <button
                type="button"
                class="btn btn-sm"
                :title="t('recog.captureHint')"
                @click="sr.capture(ocrLang)"
              >
                {{ sr.capturing.value ? t('recog.captureAgain') : t('recog.capture') }}
              </button>
              <button
                v-if="sr.capturing.value"
                type="button"
                class="btn btn-sm"
                @click="sr.stopCapture()"
              >
                {{ t('recog.stopCapture') }}
              </button>
            </template>
            <span class="spacer" />
            <label class="small lang">
              {{ t('recog.ocrLang') }}
              <select v-model="ocrLangPref" class="lang-select">
                <option v-for="l in OCR_LANGS" :key="l" :value="l">
                  {{ t('recog.lang.' + l) }}
                </option>
              </select>
            </label>
          </div>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />
          <p class="muted small">{{ t('recog.privacy') }}</p>
        </div>

        <p v-if="sr.status.value === 'working'" class="small state">{{ t('recog.working') }}</p>
        <p v-else-if="sr.status.value === 'notFound'" class="warn-text small state">
          {{ t('recog.notFound') }}
        </p>
        <p v-else-if="sr.status.value === 'error'" class="warn-text small state">
          {{ t('recog.badImage') }}
        </p>

        <template v-if="res">
          <!-- 상대 -->
          <h4 class="section-label">{{ t('common.opponent') }}</h4>
          <p v-if="!res.opp" class="warn-text small">{{ t('recog.oppNotFound') }}</p>
          <template v-else>
            <ul class="rows">
              <li
                v-for="(m, i) in res.opp"
                :key="i"
                class="row"
                :class="{ unsure: !picks[i]?.sure }"
              >
                <img class="crop" :src="m.crop" alt="" />
                <span class="arrow">→</span>
                <UiPokeSprite :id="picks[i]?.species" :size="40" class="main-sprite" />
                <div class="who">
                  <strong>{{ gd.name('pokemon', picks[i]?.species) }}</strong>
                  <span v-if="picks[i]?.gender" class="muted small">{{
                    t('gender.' + picks[i]!.gender)
                  }}</span>
                  <span
                    v-if="!m.confident && picks[i]?.species === m.candidates[0]?.id"
                    class="warn-text small"
                  >
                    {{ t('recog.unsure') }}
                  </span>
                </div>
                <!-- 다른 후보 (누르면 바꿈) -->
                <div class="alts">
                  <button
                    v-for="c in m.candidates.slice(0, 4)"
                    :key="c.id"
                    type="button"
                    class="alt"
                    :class="{ on: picks[i]?.species === c.id }"
                    :title="gd.name('pokemon', c.id)"
                    @click="choose(i, c.id)"
                  >
                    <UiPokeSprite :id="c.id" :size="28" />
                  </button>
                </div>
              </li>
            </ul>
            <div class="actions">
              <span class="muted small">{{ t('recog.applyHint') }}</span>
              <button type="button" class="btn btn-primary btn-sm" @click="apply">
                {{ t('recog.apply') }}
              </button>
            </div>
          </template>

          <!-- 내 쪽: 저장한 파티와 비교만 -->
          <h4 class="section-label">{{ t('common.mine') }}</h4>
          <p v-if="!res.mine" class="muted small">{{ t('recog.mineNotFound') }}</p>
          <template v-else>
            <p v-if="res.ocr === 'pending'" class="muted small">{{ t('recog.ocrLoading') }}</p>
            <p v-else-if="res.ocr === 'failed'" class="warn-text small">
              {{ t('recog.ocrFailed') }}
            </p>
            <ul class="rows">
              <li v-for="(m, i) in res.mine" :key="i" class="row">
                <img class="crop" :src="m.crop" alt="" />
                <span class="arrow">→</span>
                <UiPokeSprite :id="m.species" :size="40" class="main-sprite" />
                <div class="who">
                  <strong>{{ gd.name('pokemon', m.species) }}</strong>
                  <span v-if="m.items?.length" class="muted small">
                    {{ m.items.map((it) => gd.name('items', it)).join(' / ') }}
                  </span>
                </div>
                <span
                  v-if="mineCheck[i]"
                  class="small"
                  :class="mineCheck[i]!.ok ? 'ok-text' : 'warn-text'"
                >
                  {{ mineCheck[i]!.text }}
                </span>
              </li>
            </ul>
          </template>
        </template>
      </div>
    </section>
  </v-dialog>
</template>

<script setup lang="ts">
import { useScreenRecog, type OcrLang } from '~/composables/useScreenRecog'
import type { Gender } from '~/utils/types'

const emit = defineEmits<{ apply: [mons: { species: string; gender: Gender }[]] }>()
const { t, locale } = useI18n()
const gd = useGameData()
const sr = useScreenRecog()
const mine = useTeam('mine')

const open = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// 글자 인식 언어 = 게임 언어 (화면 언어와 다를 수 있어 따로 고름, localStorage 'pch_recog_lang')
const OCR_LANGS: OcrLang[] = ['ko', 'ja', 'en']
const ocrLangPref = ref<OcrLang>(
  (import.meta.client && (localStorage.getItem('pch_recog_lang') as OcrLang | null)) ||
    (OCR_LANGS.includes(locale.value as OcrLang) ? (locale.value as OcrLang) : 'en'),
)
watch(ocrLangPref, (v) => localStorage.setItem('pch_recog_lang', v))
const ocrLang = computed(() => ocrLangPref.value)

const run = (src: Blob) => sr.recognize(src, ocrLang.value)
const onFile = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) void run(f)
  ;(e.target as HTMLInputElement).value = ''
}
const onDrop = (e: DragEvent) => {
  dragging.value = false
  const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'))
  if (f) void run(f)
}
// 다이얼로그가 열려 있는 동안 Ctrl+V 로 붙여넣기
const onPaste = (e: ClipboardEvent) => {
  const item = [...(e.clipboardData?.items ?? [])].find((x) => x.type.startsWith('image/'))
  const f = item?.getAsFile()
  if (f) {
    e.preventDefault()
    void run(f)
  }
}
watch(open, (v) => {
  if (v) window.addEventListener('paste', onPaste)
  else window.removeEventListener('paste', onPaste)
})
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))

const res = computed(() => sr.result.value)

// 상대 6칸의 고른 값 (처음 = 인식 1순위, 후보를 눌러 바꿀 수 있음)
const picks = ref<{ species: string; gender: Gender; sure: boolean }[]>([])
watch(
  () => res.value?.opp,
  (opp) => {
    picks.value = (opp ?? []).map((m) => ({
      species: m.species,
      gender: m.gender ?? '',
      sure: m.confident,
    }))
  },
)
const choose = (i: number, id: string) => {
  const p = picks.value[i]
  if (!p) return
  // 종을 바꾸면 성별 기호는 그대로 (화면에서 읽은 값). 성별이 정해진 종이면 적용할 때 데이터가 우선
  p.species = id
  p.sure = true
}
const apply = () => {
  emit(
    'apply',
    picks.value.map((p) => ({ species: p.species, gender: p.gender })),
  )
  open.value = false
}

// 내 쪽: 저장한 파티와 비교 (순서는 무시, 같은 종이 있는지 + 도구를 읽었으면 도구도). 저장한 파티가 비었으면 비교 안 함
const mineCheck = computed(() =>
  (res.value?.mine ?? []).map((m) => {
    if (!mine.slots.value.some((s) => s.species)) return null
    const saved = mine.slots.value.find((s) => s.species === m.species)
    if (!saved) return { ok: false, text: t('recog.notInParty') }
    if (m.items?.length && saved.item && !m.items.includes(saved.item))
      return {
        ok: false,
        text: t('recog.itemDiff', { item: gd.name('items', saved.item) }),
      }
    return { ok: true, text: t('recog.inParty') }
  }),
)
</script>

<style scoped>
.recog {
  display: flex;
  flex-direction: column;
  max-height: 88vh;
}
.body-scroll {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.drop {
  border: 2px dashed var(--line-strong);
  border-radius: var(--radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--well);
}
.drop.dragging {
  border-color: var(--accent-2);
}
.drop p {
  margin: 0;
}
.spacer {
  flex: 1;
}
.lang {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lang-select {
  border: 1px solid var(--field-border);
  background: var(--field-bg);
  color: var(--text);
  border-radius: 6px;
  padding: 2px 6px;
  font: inherit;
}
.state {
  margin: 0;
}
.section-label {
  margin: 6px 0 0;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--faint);
}
.row.unsure {
  border-color: var(--warn);
}
.crop {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 6px;
  image-rendering: pixelated;
  flex-shrink: 0;
}
.arrow {
  color: var(--text-3);
}
.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.alts {
  display: flex;
  gap: 4px;
}
.alt {
  appearance: none;
  border: 1px solid var(--line);
  background: var(--well);
  border-radius: 6px;
  padding: 1px;
  cursor: pointer;
}
.alt.on {
  border-color: var(--accent-2);
  box-shadow: 0 0 0 1px var(--accent-2);
}
.alt:hover {
  background: var(--hover);
}
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.ok-text {
  color: var(--good);
}
/* 좁은 화면: 화면 아이콘 → 이름 + 후보 3개만 (가운데 스프라이트·화살표는 숨김) */
@media (max-width: 520px) {
  .arrow,
  .main-sprite {
    display: none;
  }
  .alt:nth-child(n + 4) {
    display: none;
  }
}
</style>
