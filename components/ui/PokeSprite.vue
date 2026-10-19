<!-- 포켓몬 챔피언스 메뉴 스프라이트. 비어 있으면 몬스터볼 실루엣 -->
<template>
  <div
    class="poke-sprite"
    :class="{ empty: !id, fainted }"
    :style="{ width: size + 'px', height: size + 'px' }"
  >
    <img
      v-if="id && !failed"
      :src="pokemonSprite(id)"
      :alt="name('pokemon', id)"
      loading="lazy"
      @error="failed = true"
    />
    <svg v-else viewBox="0 0 24 24" class="ball" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6" />
      <path d="M2 12h7m6 0h7" stroke="currentColor" stroke-width="1.6" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{ id?: string | null; size?: number; fainted?: boolean }>(),
  { id: null, size: 64, fainted: false },
)
const { pokemonSprite, name } = useGameData()
const failed = ref(false)
watch(
  () => props.id,
  () => (failed.value = false),
)
</script>

<style scoped>
.poke-sprite {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 60%, rgba(76, 201, 240, 0.16), transparent 70%);
}
.poke-sprite img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: auto;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.45));
}
.poke-sprite.empty {
  background: var(--faint);
  border: 1px dashed var(--line-strong);
}
.poke-sprite .ball {
  width: 46%;
  height: 46%;
  color: var(--text-3);
}
.poke-sprite.fainted img {
  filter: grayscale(1) brightness(0.55);
}
</style>
