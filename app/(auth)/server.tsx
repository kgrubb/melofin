import { useState } from 'react'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { isInsecureHttpUrl, normalizeServerUrl } from '@/src/domain/jellyfin'
import { probePublicInfo } from '@/src/services/jellyfin/client'
import { useSessionStore } from '@/src/store/session'
import { GlassButton, PrimaryButton, Screen } from '@/src/ui/primitives'
import {
  AuthError,
  AuthField,
  AuthHero,
  AuthScroll,
  AuthSwitchRow,
  GlassGroup,
} from '@/src/ui/AuthForm'
import { authCardEntering, useMotionEnabled } from '@/src/theme/motion'

export default function ServerScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const enabled = useMotionEnabled()
  const addingAccount = useSessionStore((s) => s.addingAccount)
  const [url, setUrl] = useState('')
  const [useHttps, setUseHttps] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onContinue = async () => {
    if (busy || url.trim().length === 0) return
    setError(null)
    const normalized = normalizeServerUrl(url, {
      preferScheme: useHttps ? 'https' : 'http',
    })
    if (!normalized.ok) {
      setError(normalized.error.message)
      return
    }
    const serverUrl = useHttps
      ? normalized.value.replace(/^http:\/\//i, 'https://')
      : normalized.value.replace(/^https:\/\//i, 'http://')
    setBusy(true)
    const probe = await probePublicInfo(serverUrl)
    setBusy(false)
    if (!probe.ok) {
      setError(probe.error.message)
      return
    }
    router.push({
      pathname: '/(auth)/login',
      params: {
        serverUrl,
        serverName: probe.value.serverName,
        allowInsecureHttp: isInsecureHttpUrl(serverUrl) ? '1' : '0',
      },
    })
  }

  const onCancelAdd = () => {
    // Keep addingAccount true until we leave (auth). AuthGate clears it.
    router.replace('/(app)/settings')
  }

  return (
    <Screen padBottom={false}>
      <AuthScroll>
        <AuthHero
          brand="Melofin"
          subtitle={
            addingAccount ? t('auth.addServerSubtitle') : t('auth.connectSubtitle')
          }
        />

        <Animated.View entering={authCardEntering(enabled)}>
          <GlassGroup footer={useHttps ? undefined : t('auth.httpFooter')}>
            <AuthField
              label={t('auth.server')}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="url"
              textContentType="URL"
              keyboardType="url"
              returnKeyType="go"
              enablesReturnKeyAutomatically
              clearButtonMode="while-editing"
              autoFocus={addingAccount}
              placeholder={t('auth.serverPlaceholder')}
              value={url}
              onChangeText={(value) => {
                setError(null)
                setUrl(value)
                if (/^https:\/\//i.test(value.trim())) setUseHttps(true)
                else if (/^http:\/\//i.test(value.trim())) setUseHttps(false)
              }}
              onSubmitEditing={() => void onContinue()}
            />
            <AuthSwitchRow
              label={t('auth.useHttps')}
              value={useHttps}
              onValueChange={(value) => {
                setError(null)
                setUseHttps(value)
              }}
            />
          </GlassGroup>
          {error ? <AuthError message={error} /> : null}
          <PrimaryButton
            label={busy ? t('auth.checking') : t('auth.continue')}
            onPress={() => void onContinue()}
            disabled={busy || url.trim().length === 0}
          />
          {addingAccount ? (
            <GlassButton label={t('common.cancel')} onPress={onCancelAdd} />
          ) : null}
        </Animated.View>
      </AuthScroll>
    </Screen>
  )
}
