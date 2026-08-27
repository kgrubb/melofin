import { describe, expect, it } from 'vitest'
import { toCarPlayNativeListItem } from '@/src/carplay/listItemNative'

describe('toCarPlayNativeListItem', () => {
  it('maps artworkUri to imgUrl for RNCarPlay async cover loading', () => {
    const native = toCarPlayNativeListItem({
      id: 'album:1',
      text: 'Album',
      artworkUri: 'https://jellyfin.example/Items/1/Images/Primary',
    })
    expect(native).toMatchObject({
      text: 'Album',
      imgUrl: 'https://jellyfin.example/Items/1/Images/Primary',
    })
    expect(native).not.toHaveProperty('image')
  })

  it('maps image row uris to imgUrls', () => {
    const native = toCarPlayNativeListItem({
      id: 'mix:1',
      text: 'Mix',
      imageRowUris: ['https://a', 'https://b'],
    })
    expect(native.imgUrls).toEqual(['https://a', 'https://b'])
  })
})
