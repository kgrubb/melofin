import { useEffect } from 'react'
import { Stack, usePathname } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { totalSizeBytes } from '@/src/domain/offline'
import { startPlaybackEngine } from '@/src/player/playlistEngine'
import { startCastRouter, stopCastRouter } from '@/src/cast/router'
import { startPlaystateSync } from '@/src/services/jellyfin/playstateSync'
import { startJellyfinReachability } from '@/src/services/jellyfin/reachability'
import { colors } from '@/src/theme/tokens'
import { GlassCluster, nativeLiquidGlass } from '@/src/theme/Glass'
import { registerCarPlay } from '@/src/carplay/register'
import { MiniPlayer } from '@/src/ui/MiniPlayer'
import { DevicesSheet } from '@/src/ui/DevicesSheet'
import { FloatingTabBar } from '@/src/ui/FloatingTabBar'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

export default function AppLayout() {
  const pathname = usePathname()
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const offlineSignature = useSettingsStore(
    (s) =>
      `${Object.keys(s.offlineIndex.entries).length}:${totalSizeBytes(s.offlineIndex)}`,
  )
  const artists = useLibraryStore((s) => s.artists)
  const albums = useLibraryStore((s) => s.albums)
  const playlists = useLibraryStore((s) => s.playlists)
  const maybeSyncOnOpen = useLibraryStore((s) => s.maybeSyncOnOpen)
  const nowPlayingOpen = usePlayerStore((s) => s.nowPlayingOpen)
  const sheetOpen =
    nowPlayingOpen ||
    pathname.includes('/settings') ||
    pathname.includes('/queue')

  useEffect(() => {
    void startPlaybackEngine()
    startCastRouter()
    const stopPlaystate = startPlaystateSync()
    const stopReachability = startJellyfinReachability()
    return () => {
      stopCastRouter()
      stopPlaystate()
      stopReachability()
    }
  }, [])

  useEffect(() => {
    if (!context || !session) return
    void maybeSyncOnOpen()
  }, [context, session, maybeSyncOnOpen])

  useEffect(() => {
    if (!context || !session) return
    const offlineIndex = useSettingsStore.getState().offlineIndex
    registerCarPlay(
      playlists,
      artists,
      Object.values(offlineIndex.entries),
      albums,
    )
  }, [context, session, offlineSignature, artists, playlists, albums])

  return (
    <View style={styles.root}>
      <View style={[styles.stackHost, sheetOpen ? styles.stackRaised : null]}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(main)" />
          <Stack.Screen
            name="player"
            options={{
              presentation: 'transparentModal',
              animation: 'none',
              contentStyle: { backgroundColor: 'transparent' },
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="queue"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: colors.background },
              sheetGrabberVisible: false,
            }}
          />
        </Stack>
      </View>
      {nativeLiquidGlass() ? (
        <GlassCluster
          spacing={10}
          style={styles.chromeCluster}
          pointerEvents="box-none"
        >
          <MiniPlayer />
          <FloatingTabBar />
        </GlassCluster>
      ) : (
        <>
          <MiniPlayer />
          <FloatingTabBar />
        </>
      )}
      <DevicesSheet />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stackHost: {
    flex: 1,
    zIndex: 1,
  },
  /** Above mini (20) + tab bar (30). */
  stackRaised: {
    zIndex: 40,
  },
  /** GlassContainer wraps mini player + tab bar. */
  chromeCluster: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
})
