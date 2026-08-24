import 'react-native-gesture-handler'
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppErrorBoundary } from '@/src/ui/AppErrorBoundary'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { colors } from '@/src/theme/tokens'
import { LoadingState, Screen } from '@/src/ui/primitives'
import '@/src/i18n'
import { registerCarPlay } from '@/src/carplay/register'
import { useTranslation } from 'react-i18next'

const AuthGate = ({ children }: { readonly children: React.ReactNode }) => {
  const { t } = useTranslation()
  const hydrated = useSessionStore((s) => s.hydrated)
  const session = useSessionStore((s) => s.session)
  const addingAccount = useSessionStore((s) => s.addingAccount)
  const hydrateSession = useSessionStore((s) => s.hydrate)
  const hydrateSettings = useSettingsStore((s) => s.hydrate)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    void hydrateSession()
    void hydrateSettings()
  }, [hydrateSession, hydrateSettings])

  // Wire CarPlay as soon as JS is up — do not wait for (app) login.
  // Native often connects before the bridge; registerCarPlay re-checks.
  useEffect(() => {
    if (!hydrated) return
    registerCarPlay()
  }, [hydrated])

  useEffect(() => {
    if (!hydrated) return
    const inAuth = segments[0] === '(auth)'
    if (!session && !inAuth) {
      router.replace('/(auth)/server')
      return
    }
    // Allow Settings -> Add server while still signed in.
    if (session && inAuth && !addingAccount) {
      router.replace('/(app)/(main)/(tabs)/home')
      return
    }
    // Left the auth stack after Add server. Drop the gate flag.
    if (session && !inAuth && addingAccount) {
      useSessionStore.getState().cancelAddAccount()
    }
  }, [hydrated, session, addingAccount, segments, router])

  if (!hydrated) {
    return (
      <Screen centered>
        <LoadingState label={t('app.starting')} />
      </Screen>
    )
  }

  return children
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <StatusBar style="light" />
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'fade',
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
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
