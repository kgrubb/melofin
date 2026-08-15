import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import {
  completeSsoAuth,
  initiateQuickConnect,
  listSsoProviders,
  loginWithAccessToken,
  loginWithPassword,
  pollQuickConnect,
  type AuthSuccess,
} from '@/src/services/jellyfin/auth'
import {
  openSsoPopup,
  type SsoBridgeResult,
} from '@/src/services/jellyfin/ssoBridge'
import { loginWithSsoAuthorizeUrl } from '@/src/services/jellyfin/ssoNative'
import { extractOidcState, ssoStartUrl } from '@/src/services/jellyfin/sso'
import { useSessionStore } from '@/src/store/session'
import {
  Field,
  GlassButton,
  Muted,
  PrimaryButton,
  Screen,
  Title,
} from '@/src/ui/primitives'
import { Surface } from '@/src/theme/Glass'
import { authCardEntering, useMotionEnabled } from '@/src/theme/motion'
import { BackButton } from '@/src/ui/NavChrome'
import { colors, spacing } from '@/src/theme/tokens'
import type { Result } from '@/src/domain/result'
import Animated from 'react-native-reanimated'

type NativeSsoCapture = {
  readonly provider: string
  readonly startUrl: string
}

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
  const [ssoCapture, setSsoCapture] = useState<NativeSsoCapture | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const handledSso = useRef(false)
  const capturedAuthorize = useRef(false)

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

  const finish = useCallback(
    async (result: Result<AuthSuccess>) => {
      if (!result.ok) {
        setError(result.error.message)
        setBusy(false)
        setSsoCapture(null)
        return
      }
      const { context, ...session } = result.value
      await setAuthenticated(session, context)
      setBusy(false)
      setSsoCapture(null)
      // AuthGate owns the auth -> app handoff (avoids double replace flicker).
    },
    [setAuthenticated],
  )

  const finishBridge = async (bridge: SsoBridgeResult, provider: string) => {
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
    await finish(await completeSsoAuth(serverUrl, provider, bridge.data, allowInsecureHttp))
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
    capturedAuthorize.current = false
    setBusy(true)
    if (Platform.OS === 'web') {
      try {
        const bridge = await openSsoPopup(serverUrl, provider)
        await finishBridge(bridge, provider)
      } catch (cause) {
        setBusy(false)
        setError(cause instanceof Error ? cause.message : 'SSO failed')
      }
      return
    }
    // Capture IdP authorize URL (with OIDC state) via a brief WebView hop, then continue
    // in the system browser where Authentik passkeys work.
    setSsoCapture({ provider, startUrl: ssoStartUrl(serverUrl, provider) })
  }

  const hostOf = (value: string): string => {
    try {
      return new URL(value).host
    } catch {
      return ''
    }
  }

  const onCaptureNavigation = (url: string) => {
    if (!ssoCapture || capturedAuthorize.current) return
    const serverHost = hostOf(serverUrl)
    const host = hostOf(url)
    if (!serverHost || !host || host === serverHost) return
    const state = extractOidcState(url)
    if (!state) return
    capturedAuthorize.current = true
    const provider = ssoCapture.provider
    setSsoCapture(null)
    void loginWithSsoAuthorizeUrl(
      serverUrl,
      provider,
      url,
      state,
      allowInsecureHttp,
    ).then((result) => finish(result))
  }

  return (
    <Screen centered padBottom={false}>
      <View style={styles.hero}>
        <View style={styles.titleRow}>
          <BackButton onPress={goBackToServer} label="Back to server selection" />
          <Title>{serverName}</Title>
        </View>
        <Muted>Sign in to continue listening</Muted>
      </View>

      <Animated.View entering={authCardEntering(enabled)}>
        <Surface style={styles.card} contentStyle={styles.cardInner}>
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
            label={busy ? 'Signing in...' : 'Sign in'}
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
              label={busy ? `Continue with ${provider}...` : `Continue with ${provider}`}
              onPress={() => void onSso(provider)}
              disabled={busy}
            />
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {providers.length > 0 ? (
            <View style={styles.hint}>
              <Muted>
                {Platform.OS === 'web'
                  ? "If Authentik opens but Melio doesn't continue, finish with Quick Connect. Browser SSO can't always return tokens from the provider popup."
                  : 'SSO opens in the system browser so passkeys work. Melio finishes sign-in automatically after Authentik succeeds.'}
              </Muted>
            </View>
          ) : null}
        </Surface>
      </Animated.View>

      {ssoCapture ? (
        <WebView
          source={{ uri: ssoCapture.startUrl }}
          style={styles.hiddenWebView}
          onNavigationStateChange={(nav) => onCaptureNavigation(nav.url)}
          onShouldStartLoadWithRequest={(request) => {
            onCaptureNavigation(request.url)
            // Block loading the IdP inside WKWebView once we've handed off to the system browser.
            if (capturedAuthorize.current) return false
            try {
              return new URL(request.url).host === new URL(serverUrl).host
            } catch {
              return true
            }
          }}
          onError={() => {
            setSsoCapture(null)
            setBusy(false)
            setError('SSO failed to open the identity provider')
          }}
          onHttpError={() => {
            setSsoCapture(null)
            setBusy(false)
            setError('SSO failed to open the identity provider')
          }}
        />
      ) : null}
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
  hiddenWebView: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
})
