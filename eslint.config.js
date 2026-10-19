import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import prettier from 'eslint-config-prettier'
import pluginPrettier from 'eslint-plugin-prettier'

export default [
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      'dist/**',
      'node_modules/**',
      'public/**',
      'scripts/.cache/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier, // 줄바꿈 등 서식은 Prettier 담당 (아래에서 켠 규칙만 추가로 검사)

  // <script lang="ts"> 를 TypeScript 로 파싱
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // Nuxt 자동 import(computed, useState, useI18n ...)는 전역 선언이 없으므로 no-undef 는 TS 컴파일러에 맡긴다
  {
    files: ['**/*.ts', '**/*.vue', 'composables/**/*.js'],
    rules: { 'no-undef': 'off' },
  },
  {
    rules: {
      // 구조 분해로 일부 속성을 빼는 용도 (const { history, ...rest } = state)
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // 컴포넌트의 slot 이라는 이름의 prop (필드 칸/파티 슬롯). Vue 2 의 slot 속성과 무관
      'vue/no-deprecated-slot-attribute': 'off',
    },
  },
  // Nuxt 라우트/레이아웃 파일은 한 단어 이름이 관례
  {
    files: ['pages/**/*.vue', 'layouts/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },

  // 서식(들여쓰기·공백·줄바꿈)은 Prettier(.prettierrc) 하나로 통일. 어긋나면 경고 → npm run format 으로 정리
  {
    plugins: { prettier: pluginPrettier },
    rules: { 'prettier/prettier': 'warn' },
  },
]
