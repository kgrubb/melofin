import { ListTemplate, type ListItem } from 'react-native-carplay'
import type { CarPlayListItem } from '@/src/carplay/templates'

export type CarPlayListHandle = {
  readonly template: ListTemplate
  setItems(items: readonly CarPlayListItem[]): void
}

const toNativeItems = (rows: readonly CarPlayListItem[]): ListItem[] =>
  rows.map((item) => ({
    text: item.text,
    detailText: item.detailText,
    ...(item.showsDisclosureIndicator ? { showsDisclosureIndicator: 1 } : {}),
  })) as ListItem[]

export const createListTemplate = (
  title: string,
  items: readonly CarPlayListItem[],
  onItemPress: (itemId: string) => void | Promise<void>,
  emptyTitle?: string,
): CarPlayListHandle => {
  const state = { rows: [...items] }
  const template = new ListTemplate({
    title,
    ...(emptyTitle ? { emptyViewTitleVariants: [emptyTitle] } : {}),
    sections: [{ items: toNativeItems(state.rows) }],
    onItemSelect: async ({ index }) => {
      const row = state.rows[index]
      if (row) await onItemPress(row.id)
    },
  })
  return {
    template,
    setItems: (next) => {
      state.rows = [...next]
      template.updateSections([{ items: toNativeItems(state.rows) }])
    },
  }
}
