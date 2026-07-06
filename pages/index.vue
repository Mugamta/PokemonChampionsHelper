<template>
  <div
    style="
      display: flex;
      flex-direction: column;
      min-height: 875px;
            background-image: url('/pokemon.webp');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    "
  >
    <main
      style="
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
      "
    >
      <div
        style="
          display: flex;
          flex-direction: column;
          gap: 16px;
        "
      >
        <button
          style="padding: 14px 24px;"
          @click="goSingle"
        >
          싱글배틀
        </button>
        <button
          style="padding: 14px 24px;"
          @click="goMulti"
        >
          멀티배틀
        </button>
        <button
          style="padding: 14px 24px;"
          @click="goParty"
        >
          파티 관리
        </button>
        <button
          style="padding: 14px 24px;"
          @click="goHelp"
        >
          도움말
        </button>
      </div>
    </main>
  </div>
</template>

<script setup>
const goSingle = () => navigateTo('/singleParty')
const goMulti = () => navigateTo('/multi')
const goParty = () => navigateTo('/party')
const goHelp = () => navigateTo('/help')
</script>