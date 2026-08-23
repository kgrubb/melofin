import {
  ListTemplate,
  type BarButton,
  type ListItem,
  type ListSection,
} from 'react-native-carplay'
import type { CarPlayListItem, CarPlaySection } from '@/src/carplay/templates'

export type CarPlayListHandle = {
  readonly template: ListTemplate
  setItems(items: readonly CarPlayListItem[]): void
  setSections(sections: readonly CarPlaySection[]): void
  refreshArtwork(): void
  getMaximumListItemCount(): Promise<number>
  getMaximumListItemImageSize(): Promise<{ width: number; height: number }>
}

const toNativeItem = (item: CarPlayListItem): ListItem =>
  ({
    text: item.text,
    detailText: item.detailText,
    ...(item.showsDisclosureIndicator ? { showsDisclosureIndicator: true } : {}),
    ...(item.isPlaying ? { isPlaying: true } : {}),
    ...(item.artworkUri ? { image: { uri: item.artworkUri } } : {}),
    ...(item.imageRowUris && item.imageRowUris.length > 0
      ? { imgUrls: [...item.imageRowUris] }
      : {}),
  }) as ListItem

const toNativeSections = (sections: readonly CarPlaySection[]): ListSection[] =>
  sections.map((section) => ({
    ...(section.header ? { header: section.header } : {}),
    items: section.items.map(toNativeItem),
  }))

const asSections = (items: readonly CarPlayListItem[]): CarPlaySection[] => [
  { items },
]

export type CreateListOptions = {
  readonly emptyTitle?: string
  readonly sections?: readonly CarPlaySection[]
  readonly tabTitle?: string
  readonly tabSystemImageName?: string
  readonly trailingNavigationBarButtons?: BarButton[]
}

export const createListTemplate = (
  title: string,
  items: readonly CarPlayListItem[],
  onItemPress: (itemId: string) => void | Promise<void>,
  options?: CreateListOptions,
): CarPlayListHandle => {
  const state = {
    sections: (options?.sections ?? asSections(items)).map((section) => ({
      header: section.header,
      items: [...section.items],
    })),
  }

  const flatIds = () =>
    state.sections.flatMap((section) => section.items.map((item) => item.id))

  const template = new ListTemplate({
    title,
    ...(options?.emptyTitle
      ? { emptyViewTitleVariants: [options.emptyTitle] }
      : {}),
    ...(options?.tabTitle ? { tabTitle: options.tabTitle } : {}),
    ...(options?.tabSystemImageName
      ? { tabSystemImageName: options.tabSystemImageName }
      : {}),
    ...(options?.trailingNavigationBarButtons
      ? { trailingNavigationBarButtons: options.trailingNavigationBarButtons }
      : {}),
    sections: toNativeSections(state.sections),
    onItemSelect: async ({ index }) => {
      const id = flatIds()[index]
      if (id) await onItemPress(id)
    },
    onImageRowItemSelect: async ({ index }) => {
      const row = state.sections.flatMap((section) => section.items)[index]
      if (row) await onItemPress(row.id)
    },
    onBarButtonPressed: ({ id }) => {
      void onItemPress(id)
    },
  })

  const publish = () => {
    template.updateSections(toNativeSections(state.sections))
  }

  return {
    template,
    setItems: (next) => {
      state.sections = asSections(next).map((section) => ({
        header: section.header,
        items: [...section.items],
      }))
      publish()
    },
    setSections: (next) => {
      state.sections = next.map((section) => ({
        header: section.header,
        items: [...section.items],
      }))
      publish()
    },
    refreshArtwork: publish,
    getMaximumListItemCount: () => template.getMaximumListItemCount(),
    getMaximumListItemImageSize: () => template.getMaximumListItemImageSize(),
  }
}
