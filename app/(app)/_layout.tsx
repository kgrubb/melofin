import { useEffect } from 'react'
import { Stack, usePathname } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { CARPLAY_ENABLED } from '@/src/features'
import { startPlaybackEngine } from '@/src/player/playlistEngine'
import { colors } from '@/src/theme/tokens'
import { registerCarPlay } from '@/src/carplay/register'
import { MiniPlayer } from '@/src/ui/MiniPlayer'
import { FloatingTabBar } from '@/src/ui/FloatingTabBar'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

export default function AppLayout() {
  const pathname = usePathname()
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const offlineIndex = useSettingsStore((s) => s.offlineIndex)
  const artists = useLibraryStore((s) => s.artists)
  const playlists = useLibraryStore((s) => s.playlists)
  const maybeSyncOnOpen = useLibraryStore((s) => s.maybeSyncOnOpen)
  const nowPlayingOpen = usePlayerStore((s) => s.nowPlayingOpen)
  const sheetOpen =
    nowPlayingOpen ||
    pathname.includes('/settings') ||
    pathname.includes('/queue')

  useEffect(() => {
    void startPlaybackEngine()
  }, [])

  useEffect(() => {
    if (!context || !session) return
    void maybeSyncOnOpen()
  }, [context, session, maybeSyncOnOpen])

  useEffect(() => {
    if (!CARPLAY_ENABLED || !context || !session) return
    registerCarPlay(
      playlists,
      artists,
      Object.values(offlineIndex.entries),
    )
  }, [context, session, offlineIndex, artists, playlists])

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
            }}
          />
        </Stack>
      </View>
      <MiniPlayer />
      <FloatingTabBar />
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
})
