// 도구 도감용 분류 (메가스톤 / 열매 / 그 밖의 지닌 도구)
import type { Item } from './types'

export const ITEM_CATEGORIES = ['mega', 'berry', 'held'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const itemCategory = (it: Item): ItemCategory =>
  it.megaStone ? 'mega' : it.berry ? 'berry' : 'held'
