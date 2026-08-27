import {
  ListTemplate,
  type BarButton,
  type ListItem,
  type ListSection,
} from 'react-native-carplay'
import type { CarPlayListItem, CarPlaySection } from '@/src/carplay/templates'
import { toCarPlayNativeListItem } from '@/src/carplay/listItemNative'
import { logger } from '@/src/logging/logger'

export type CarPlayListHandle = {
  readonly template: ListTemplate
  setItems(items: readonly CarPlayListItem[]): void
  setSections(sections: readonly CarPlaySection[]): void
  refreshArtwork(): void
  getMaximumListItemCount(): Promise<number>
  getMaximumListItemImageSize(): Promise<{ width: number; height: number }>
}

const toNativeItem = (item: CarPlayListItem): ListItem =>
  toCarPlayNativeListItem(item) as ListItem

const toNativeSections = (sections: readonly CarPlaySection[]): ListSection[] =>
  sections.map((section) => ({
    ...(section.header ? { header: section.header } : {}),
    items: section.items.map(toNativeItem),
  }))

const asSections = (items: readonly CarPlayListItem[]): CarPlaySection[] => [
  { items },
]

/** RNCarPlay only dismisses the selection spinner when onItemSelect resolves. */
const runSelect = async (
  run: () => void | Promise<void>,
  detail: Record<string, unknown>,
): Promise<void> => {
  try {
    await run()
  } catch (cause) {
    logger.warn('CarPlay select failed', { cause, ...detail })
  }
}

export type CreateListOptions = {
  readonly emptyTitle?: string
  readonly sections?: readonly CarPlaySection[]
  readonly tabTitle?: string
  readonly tabSystemImageName?: string
  readonly trailingNavigationBarButtons?: BarButton[]
  readonly onDidDisappear?: () => void
}

export const createListTemplate = (
  title: string,
  items: readonly CarPlayListItem[],
  onItemPress: (itemId: string) => void | Promise<void>,
  options?: CreateListOptions,
): CarPlayListHandle => {
  type TemplateState = {
    readonly sections: readonly CarPlaySection[]
  }
  let state: TemplateState = {
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
    ...(options?.onDidDisappear
      ? { onDidDisappear: options.onDidDisappear }
      : {}),
    sections: toNativeSections(state.sections),
    onItemSelect: ({ index }) =>
      runSelect(async () => {
        const id = flatIds()[index]
        if (id) await onItemPress(id)
      }, { index }),
    onImageRowItemSelect: ({ index }) =>
      runSelect(async () => {
        const row = state.sections.flatMap((section) => section.items)[index]
        if (row) await onItemPress(row.id)
      }, { index }),
    onBarButtonPressed: ({ id }) => {
      void runSelect(() => onItemPress(id), { id })
    },
  })

  const publish = () => {
    template.updateSections(toNativeSections(state.sections))
  }

  return {
    template,
    setItems: (next) => {
      state = {
        sections: asSections(next).map((section) => ({
          header: section.header,
          items: [...section.items],
        })),
      }
      publish()
    },
    setSections: (next) => {
      state = {
        sections: next.map((section) => ({
          header: section.header,
          items: [...section.items],
        })),
      }
      publish()
    },
    refreshArtwork: publish,
    getMaximumListItemCount: () => template.getMaximumListItemCount(),
    getMaximumListItemImageSize: () => template.getMaximumListItemImageSize(),
  }
}
