import { SearchTemplate } from 'react-native-carplay'
import type { LibraryItem } from '@/src/services/jellyfin/library'
import { searchLibrary } from '@/src/services/jellyfin/library'
import { CarPlay } from 'react-native-carplay'
import { useSessionStore } from '@/src/store/session'

const searchDetail = (item: LibraryItem) => {
  if (item.type === 'Audio') return item.artists[0]
  if (item.type === 'MusicAlbum') return item.artists[0] ?? 'Album'
  if (item.type === 'MusicArtist') return 'Artist'
  return item.childCount ? `${item.childCount} songs` : 'Playlist'
}

export const pushSearch = (
  onSelect: (item: LibraryItem) => void | Promise<void>,
) => {
  const state = { results: [] as LibraryItem[] }
  CarPlay.pushTemplate(
    new SearchTemplate({
      onSearch: async (query) => {
        const session = useSessionStore.getState()
        if (!session.context || !session.session || !query.trim()) {
          state.results = []
          return []
        }
        const result = await searchLibrary(
          session.context,
          session.session.userId,
          query,
        )
        state.results = result.ok ? [...result.value] : []
        return state.results.map((item) => ({
          text: item.name,
          detailText: searchDetail(item),
        }))
      },
      onItemSelect: async ({ index }) => {
        const item = state.results[index]
        if (item) await onSelect(item)
      },
    }),
    true,
  )
}
