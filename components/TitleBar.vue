<template>
  <header
    style="
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background: #333;
      color: #fff;
      margin-bottom: 10px;
    "
  >
    <h2 style="margin: 0;">포켓몬 챔피언스 헬퍼</h2>
    <nav>
      <NuxtLink to="/" style="margin-left: 12px; color: #fff; text-decoration: none;">홈</NuxtLink>
      <NuxtLink to="/about" style="margin-left: 12px; color: #fff; text-decoration: none;">소개</NuxtLink>
      <NuxtLink to="/contact" style="margin-left: 12px; color: #fff; text-decoration: none;">문의</NuxtLink>
    </nav>
  </header>
</template>