import { Stack } from 'expo-router'
import { colors } from '@/src/theme/tokens'

const collectionOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: colors.background },
}

/** Tabs + collections. Floating chrome lives in the parent app layout so it
 *  isn't covered by this native stack. */
export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="album/[id]" options={collectionOptions} />
      <Stack.Screen name="artist/[id]" options={collectionOptions} />
      <Stack.Screen name="playlist/[id]" options={collectionOptions} />
      <Stack.Screen name="genre/[id]" options={collectionOptions} />
    </Stack>
  )
}
