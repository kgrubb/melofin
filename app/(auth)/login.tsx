import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, TextInput, Keyboard } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { WebView } from 'react-native-webview'
import { useTranslation } from 'react-i18next'
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
import { GlassButton, PrimaryButton, Screen } from '@/src/ui/primitives'
import {
  AuthCode,
  AuthError,
  AuthField,
  AuthHero,
  AuthHint,
  AuthScroll,
  GlassGroup,
} from '@/src/ui/AuthForm'
import { authCardEntering, useMotionEnabled } from '@/src/theme/motion'
import { BackButton } from '@/src/ui/NavChrome'
import type { Result } from '@/src/domain/result'
import Animated from 'react-native-reanimated'

type NativeSsoCapture = {
  readonly provider: string
  readonly startUrl: string
}

export default function LoginScreen() {
  const { t } = useTranslation()
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
  const passwordRef = useRef<TextInput>(null)

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
        // Back / Cancel aborts Quick Connect. Don't flash "Cancelled".
        if (result.error.code !== 'cancelled') setError(result.error.message)
        setBusy(false)
        setQcCode(null)
        setSsoCapture(null)
        return
      }
      const { context, ...session } = result.value
      await setAuthenticated(session, context)
      setBusy(false)
      setQcCode(null)
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
    if (busy || username.trim().length === 0) return
    setBusy(true)
    setError(null)
    await finish(
      await loginWithPassword(serverUrl, username.trim(), password, allowInsecureHttp),
    )
  }

  const onCancelQuickConnect = () => {
    abortRef.current?.abort()
    setQcCode(null)
    setBusy(false)
  }

  const onQuickConnect = async () => {
    Keyboard.dismiss()
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
        setError(cause instanceof Error ? cause.message : t('auth.ssoFailed'))
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
    <Screen padBottom={false}>
      <AuthScroll>
        <AuthHero
          leading={
            <BackButton onPress={goBackToServer} label={t('auth.backToServer')} />
          }
          title={serverName}
        />

        <Animated.View entering={authCardEntering(enabled)}>
          {qcCode ? (
            <>
              <GlassGroup footer={t('auth.quickConnectFooter')}>
                <AuthCode
                  code={qcCode}
                  accessibilityLabel={t('auth.quickConnectCodeA11y', { code: qcCode })}
                />
              </GlassGroup>
              <GlassButton label={t('common.cancel')} onPress={onCancelQuickConnect} />
            </>
          ) : (
            <>
              <GlassGroup>
                <AuthField
                  label={t('auth.username')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="next"
                  enablesReturnKeyAutomatically
                  clearButtonMode="while-editing"
                  autoFocus
                  value={username}
                  onChangeText={(value) => {
                    setError(null)
                    setUsername(value)
                  }}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <AuthField
                  inputRef={passwordRef}
                  label={t('auth.password')}
                  secureTextEntry
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  value={password}
                  onChangeText={(value) => {
                    setError(null)
                    setPassword(value)
                  }}
                  onSubmitEditing={() => void onPasswordLogin()}
                />
              </GlassGroup>
              {error ? <AuthError message={error} /> : null}
              <PrimaryButton
                label={busy ? t('auth.signingIn') : t('auth.signIn')}
                onPress={() => void onPasswordLogin()}
                disabled={busy || username.trim().length === 0}
              />
              <GlassButton
                label={t('auth.quickConnect')}
                onPress={() => void onQuickConnect()}
                disabled={busy}
              />
              {providers.map((provider) => (
                <GlassButton
                  key={provider}
                  label={
                    busy
                      ? t('auth.continueWithProviderBusy', { provider })
                      : t('auth.continueWithProvider', { provider })
                  }
                  onPress={() => void onSso(provider)}
                  disabled={busy}
                />
              ))}
              {providers.length > 0 ? (
                <AuthHint>
                  {Platform.OS === 'web'
                    ? t('auth.ssoHintWeb')
                    : t('auth.ssoHintNative')}
                </AuthHint>
              ) : null}
            </>
          )}
        </Animated.View>
      </AuthScroll>

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
            setError(t('auth.ssoOpenFailed'))
          }}
          onHttpError={() => {
            setSsoCapture(null)
            setBusy(false)
            setError(t('auth.ssoOpenFailed'))
          }}
        />
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  hiddenWebView: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
})
