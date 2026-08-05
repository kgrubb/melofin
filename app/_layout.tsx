import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppErrorBoundary } from '@/src/ui/AppErrorBoundary'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { colors } from '@/src/theme/tokens'
import { LoadingState, Screen } from '@/src/ui/primitives'

const AuthGate = ({ children }: { readonly children: React.ReactNode }) => {
  const hydrated = useSessionStore((s) => s.hydrated)
  const session = useSessionStore((s) => s.session)
  const hydrateSession = useSessionStore((s) => s.hydrate)
  const hydrateSettings = useSettingsStore((s) => s.hydrate)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    void hydrateSession()
    void hydrateSettings()
  }, [hydrateSession, hydrateSettings])

  useEffect(() => {
    if (!hydrated) return
    const inAuth = segments[0] === '(auth)'
    if (!session && !inAuth) {
      router.replace('/(auth)/server')
      return
    }
    if (session && inAuth) {
      router.replace('/(app)/(tabs)/home')
    }
  }, [hydrated, session, segments, router])

  if (!hydrated) {
    return (
      <Screen centered>
        <LoadingState label="Starting Melio" />
      </Screen>
    )
  }

  return children
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <StatusBar style="light" />
        <AuthGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </AuthGate>
      </AppErrorBoundary>
    </SafeAreaProvider>
  )
}
