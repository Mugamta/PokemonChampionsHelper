<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div
    style="
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    "
  >
    <!-- 공통 타이틀바 -->
    <!-- 컴포넌트 파일명이 `titleBar.vue` 이더라도 템플릿에서는 케이스에 민감하므로 PascalCase나 kebab-case를 사용해야 합니다. -->
    <TitleBar />

    <!-- 페이지 내용 -->
    <slot />

    <!-- 공통 푸터 -->
    <footer
      style="
        padding: 16px;
        text-align: center;
        background: #f5f5f5;

              display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      background: #333;
      color: #fff;
      margin-bottom: 10px;
      flex-wrap: wrap;
      gap: 8px;
      "
    >
      <p>© 2026 Pokemon Champions Helper</p>
    </footer>
  </div>
</template>
