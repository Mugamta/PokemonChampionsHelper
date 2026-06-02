<template>
  <div
    style="
      display: flex;
      flex-direction: column;
      min-height: 100vh;
            background-image: url('/pokemon.webp');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      min-height: 100vh;
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
        <button @click="goSingle" style="padding: 14px 24px;">싱글배틀</button>
        <button @click="goMulti" style="padding: 14px 24px;">멀티배틀</button>
        <button @click="goParty" style="padding: 14px 24px;">파티 관리</button>
        <button @click="goHelp" style="padding: 14px 24px;">도움말</button>
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