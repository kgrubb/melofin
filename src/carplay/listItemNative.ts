import type { CarPlayListItem } from '@/src/carplay/templates'

/** Map Melofin list rows to RNCarPlay ListItem image fields. */
export const toCarPlayNativeListItem = (item: CarPlayListItem) => ({
  text: item.text,
  detailText: item.detailText,
  ...(item.showsDisclosureIndicator ? { showsDisclosureIndicator: true } : {}),
  ...(item.isPlaying ? { isPlaying: true } : {}),
  // imgUrl loads remote/file covers async; `image` is bundled assets only.
  ...(item.artworkUri ? { imgUrl: item.artworkUri } : {}),
  ...(item.imageRowUris && item.imageRowUris.length > 0
    ? { imgUrls: [...item.imageRowUris] }
    : {}),
})
