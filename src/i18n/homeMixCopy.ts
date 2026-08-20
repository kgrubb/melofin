import type { TFunction } from 'i18next'
import type { AlbumCardCopy, HomeMixCopy } from '@/src/domain/homeFeed'

export const homeMixCopyFromT = (t: TFunction): HomeMixCopy => ({
  instantMix: t('home.instantMix'),
  favoritesMix: t('home.favoritesMix'),
  yourMix: t('home.yourMix'),
  madeForYou: t('home.madeForYou'),
  mixDot: (name) => t('home.mixDot', { name }),
  mixNamed: (name) => t('home.mixNamed', { name }),
  artistsTwo: (first, second) => t('home.mixArtistsTwo', { first, second }),
  artistsThreeAndMore: (first, second, third) =>
    t('home.mixArtistsThreeAndMore', { first, second, third }),
})

export const albumCardCopyFromT = (t: TFunction): AlbumCardCopy => ({
  songCount: (count) => t('home.albumSongCount', { count }),
  addedOn: (date) => t('home.albumAdded', { date }),
})
