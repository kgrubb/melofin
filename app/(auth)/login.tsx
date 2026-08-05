import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import {
  completeSsoAuth,
  initiateQuickConnect,
  listSsoProviders,
  loginWithAccessToken,
  loginWithPassword,
  pollQuickConnect,
  ssoStartUrl,
  type AuthSuccess,
} from '@/src/services/jellyfin/auth'
import {
  openSsoPopup,
  parseSsoBridgeMessage,
  SSO_BRIDGE_SCRIPT,
  type SsoBridgeResult,
} from '@/src/services/jellyfin/ssoBridge'
import { useSessionStore } from '@/src/store/session'
import {
  Field,
  GlassButton,
  Muted,
  PrimaryButton,
  Screen,
  Title,
} from '@/src/ui/primitives'
import { Atmosphere } from '@/src/theme/Atmosphere'
import { Glass } from '@/src/theme/Glass'
import { authCardEntering, IconButton, useMotionEnabled } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { colors, spacing } from '@/src/theme/tokens'
import type { Result } from '@/src/domain/result'
import Animated from 'react-native-reanimated'

export default function LoginScreen() {
  const router = useRouter()
  const enabled = useMotionEnabled()
  const params = useLocalSearchParams<{
    serverUrl: string
    serverName: string
    allowInsecureHttp: string
  }>()
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [qcCode, setQcCode] = useState<string | null>(null)
  const [providers, setProviders] = useState<readonly string[]>([])
  const [ssoUrl, setSsoUrl] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const handledSso = useRef(false)

  const allowInsecureHttp = params.allowInsecureHttp === '1'
  const serverUrl = params.serverUrl
  const serverName = params.serverName || 'Jellyfin'

  const goBackToServer = () => {
    abortRef.current?.abort()
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/(auth)/server')
  }

  useEffect(() => {
    void listSsoProviders(serverUrl).then((result) => {
      if (result.ok) setProviders(result.value)
    })
  }, [serverUrl])

  useEffect(() => () => abortRef.current?.abort(), [])

  const finish = async (result: Result<AuthSuccess>) => {
    if (!result.ok) {
      setError(result.error.message)
      setBusy(false)
      setSsoUrl(null)
      return
    }
    const { context, ...session } = result.value
    await setAuthenticated(session, context)
    setBusy(false)
    setSsoUrl(null)
    router.replace('/(app)/(tabs)/home')
  }

  const finishBridge = async (bridge: SsoBridgeResult) => {
    if (handledSso.current) return
    handledSso.current = true
    setBusy(true)
    if (bridge.kind === 'auth') {
      await finish(
        await loginWithAccessToken(
          serverUrl,
          bridge.accessToken,
          bridge.userId,
          bridge.userName,
          allowInsecureHttp,
          serverName,
        ),
      )
      return
    }
    await finish(await completeSsoAuth(serverUrl, providers[0] ?? 'default', bridge.data, allowInsecureHttp))
  }

  const onPasswordLogin = async () => {
    setBusy(true)
    setError(null)
    await finish(
      await loginWithPassword(serverUrl, username.trim(), password, allowInsecureHttp),
    )
  }

  const onQuickConnect = async () => {
    setBusy(true)
    setError(null)
    const initiated = await initiateQuickConnect(serverUrl)
    if (!initiated.ok) {
      setError(initiated.error.message)
      setBusy(false)
      return
    }
    setQcCode(initiated.value.code)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    await finish(
      await pollQuickConnect(serverUrl, initiated.value.secret, controller.signal),
    )
  }

  const onSso = async (provider: string) => {
    setError(null)
    handledSso.current = false
    if (Platform.OS === 'web') {
      setBusy(true)
      try {
        const bridge = await openSsoPopup(serverUrl, provider)
        await finishBridge(bridge)
      } catch (cause) {
        setBusy(false)
        setError(cause instanceof Error ? cause.message : 'SSO failed')
      }
      return
    }
    setSsoUrl(ssoStartUrl(serverUrl, provider))
  }

  if (ssoUrl && Platform.OS !== 'web') {
    return (
      <Atmosphere style={styles.webviewWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => setSsoUrl(null)}
          style={styles.webviewBack}
          hitSlop={12}
        >
          <Icon name="chevron.left" tintColor={colors.text} size={22} />
        </Pressable>
        <WebView
          source={{ uri: ssoUrl }}
          onMessage={(event) => {
            const bridge = parseSsoBridgeMessage(event.nativeEvent.data)
            if (bridge) void finishBridge(bridge)
          }}
          injectedJavaScriptBeforeContentLoaded={SSO_BRIDGE_SCRIPT}
          injectedJavaScript={SSO_BRIDGE_SCRIPT}
          onLoadEnd={(event) => {
            // Re-inject after Authentik → Jellyfin redirects.
            const url = event.nativeEvent.url ?? ''
            if (url.includes('/sso/')) {
              // Bridge already injected via props; handled by XHR hook.
            }
          }}
        />
      </Atmosphere>
    )
  }

  return (
    <Screen centered padBottom={false}>
      <View style={styles.hero}>
        <View style={styles.titleRow}>
          <IconButton
            accessibilityRole="button"
            accessibilityLabel="Back to server selection"
            onPress={goBackToServer}
            hitSlop={12}
            style={styles.back}
          >
            <Icon name="chevron.left" tintColor={colors.text} size={22} />
          </IconButton>
          <Title>{serverName}</Title>
        </View>
        <Muted>Sign in to continue listening</Muted>
      </View>

      <Animated.View entering={authCardEntering(enabled)}>
        <Glass style={styles.card} contentStyle={styles.cardInner}>
          <Field
            label="Username"
            accessibilityLabel="Username"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            containerStyle={styles.field}
            inset
          />
          <Field
            label="Password"
            accessibilityLabel="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            containerStyle={styles.field}
            inset
          />
          <PrimaryButton
            label={busy ? 'Signing in…' : 'Sign in'}
            onPress={() => void onPasswordLogin()}
            disabled={busy}
          />
          <GlassButton
            label={qcCode ? `Quick Connect · ${qcCode}` : 'Quick Connect'}
            onPress={() => void onQuickConnect()}
            disabled={busy}
          />
          {providers.map((provider) => (
            <GlassButton
              key={provider}
              label={`Continue with ${provider}`}
              onPress={() => void onSso(provider)}
              disabled={busy}
            />
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {Platform.OS === 'web' && providers.length > 0 ? (
            <View style={styles.hint}>
              <Muted>
                If Authentik opens but Melio doesn’t continue, finish with Quick Connect — browser SSO
                can’t always return tokens from the provider popup.
              </Muted>
            </View>
          ) : null}
        </Glass>
      </Animated.View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  back: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  card: {
    width: '100%',
  },
  cardInner: {
    padding: spacing.lg,
  },
  field: {
    marginTop: spacing.sm,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.md,
  },
  hint: {
    marginTop: spacing.md,
  },
  webviewWrap: {
    flex: 1,
  },
  webviewBack: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.md,
    zIndex: 2,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
