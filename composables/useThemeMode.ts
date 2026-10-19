// composables/useThemeMode.ts
// 화면 테마 선택 (낮 / 밤 / 시스템 설정). 실제 적용과 저장은 plugins/theme.client.ts

export type ThemeMode = 'system' | 'light' | 'dark'
export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system']

export function useThemeMode() {
  return useState<ThemeMode>('theme-mode', () => 'system')
}
