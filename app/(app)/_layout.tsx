import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { startPlaybackEngine } from '@/src/player/playlistEngine'
import { colors } from '@/src/theme/tokens'
import { registerCarPlay } from '@/src/carplay/register'
import { MiniPlayer } from '@/src/ui/MiniPlayer'
import { FloatingTabBar } from '@/src/ui/FloatingTabBar'
import { useLibraryStore } from '@/src/store/library'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'

const collectionOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: colors.background },
}

export default function AppLayout() {
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const offlineIndex = useSettingsStore((s) => s.offlineIndex)
  const artists = useLibraryStore((s) => s.artists)
  const playlists = useLibraryStore((s) => s.playlists)
  const maybeSyncOnOpen = useLibraryStore((s) => s.maybeSyncOnOpen)

  useEffect(() => {
    void startPlaybackEngine()
  }, [])

  useEffect(() => {
    if (!context || !session) return
    void maybeSyncOnOpen()
  }, [context, session, maybeSyncOnOpen])

  useEffect(() => {
    if (!context || !session) return
    registerCarPlay(
      playlists,
      artists,
      Object.values(offlineIndex.entries),
    )
  }, [context, session, offlineIndex, artists, playlists])

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="album/[id]" options={collectionOptions} />
        <Stack.Screen name="artist/[id]" options={collectionOptions} />
        <Stack.Screen name="playlist/[id]" options={collectionOptions} />
        <Stack.Screen
          name="player"
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: { backgroundColor: 'transparent' },
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="queue"
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack>
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
})
