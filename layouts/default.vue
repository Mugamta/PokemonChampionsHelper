<!-- default.vue -->
<template>
  <div class="page">
    <TitleBar />

    <main class="content">
      <slot />
    </main>

    <footer
      class="footer"
      style="display: flex; justify-content: space-between; align-items: center; width: 100%;"
    >
      <p style="margin: 0; height: 36px;">
        © 2026 Pokemon Champions Helper. All rights reserved.
      </p>

      <span style="margin: 0; text-align: right; font-size: 10px">
        Pokémon and Pokémon character names are trademarks of Nintendo. <br>
        Pokémon content and materials are trademarks and copyrights of Nintendo or its licensors.
      </span>
    </footer>
  </div>
</template>

<style>
html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  min-height: 100%;
}

.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.content {
  flex: 1;
}

.footer {
  padding: 0 16px;
  background: #333;
  color: #fff;
}
</style>