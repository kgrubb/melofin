import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api'
import { validatePlaylistName } from '@/src/domain/playlists'
import { appError, err, ok, type Result } from '@/src/domain/result'
import type { JellyfinContext } from '@/src/services/jellyfin/client'

export const createPlaylist = async (
  context: JellyfinContext,
  userId: string,
  name: string,
  ids?: readonly string[],
): Promise<Result<string>> => {
  const validated = validatePlaylistName(name)
  if (!validated.ok) return err(validated.error)
  try {
    const response = await getPlaylistsApi(context.api).createPlaylist({
      userId,
      mediaType: 'Audio',
      createPlaylistDto: {
        Name: validated.value,
        UserId: userId,
        MediaType: 'Audio',
        ...(ids && ids.length > 0 ? { Ids: [...ids] } : {}),
      },
    })
    const id = response.data.Id ? String(response.data.Id) : ''
    if (!id) return err(appError('network', 'Playlist create returned no id'))
    return ok(id)
  } catch (cause) {
    return err(appError('network', 'Failed to create playlist', cause))
  }
}

export const renamePlaylist = async (
  context: JellyfinContext,
  playlistId: string,
  name: string,
): Promise<Result<void>> => {
  const validated = validatePlaylistName(name)
  if (!validated.ok) return err(validated.error)
  try {
    await getPlaylistsApi(context.api).updatePlaylist({
      playlistId,
      updatePlaylistDto: { Name: validated.value },
    })
    return ok(undefined)
  } catch (cause) {
    return err(appError('network', 'Failed to rename playlist', cause))
  }
}

export const deletePlaylist = async (
  context: JellyfinContext,
  playlistId: string,
): Promise<Result<void>> => {
  try {
    await getLibraryApi(context.api).deleteItem({ itemId: playlistId })
    return ok(undefined)
  } catch (cause) {
    return err(appError('network', 'Failed to delete playlist', cause))
  }
}

export const addTracksToPlaylist = async (
  context: JellyfinContext,
  userId: string,
  playlistId: string,
  ids: readonly string[],
): Promise<Result<void>> => {
  if (ids.length === 0) {
    return err(appError('validation', 'No tracks to add'))
  }
  try {
    await getPlaylistsApi(context.api).addItemToPlaylist({
      playlistId,
      userId,
      ids: [...ids],
    })
    return ok(undefined)
  } catch (cause) {
    return err(appError('network', 'Failed to add to playlist', cause))
  }
}

export const removeTracksFromPlaylist = async (
  context: JellyfinContext,
  playlistId: string,
  entryIds: readonly string[],
): Promise<Result<void>> => {
  if (entryIds.length === 0) {
    return err(appError('validation', 'No tracks to remove'))
  }
  try {
    await getPlaylistsApi(context.api).removeItemFromPlaylist({
      playlistId,
      entryIds: [...entryIds],
    })
    return ok(undefined)
  } catch (cause) {
    return err(appError('network', 'Failed to remove from playlist', cause))
  }
}
