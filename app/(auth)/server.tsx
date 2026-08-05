import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { isInsecureHttpUrl, normalizeServerUrl } from '@/src/domain/jellyfin'
import { probePublicInfo } from '@/src/services/jellyfin/client'
import { Brand, Field, Muted, PrimaryButton, Screen } from '@/src/ui/primitives'
import { Glass, Toggle } from '@/src/theme/Glass'
import { authCardEntering, useMotionEnabled } from '@/src/theme/motion'
import { colors, spacing } from '@/src/theme/tokens'

export default function ServerScreen() {
  const router = useRouter()
  const enabled = useMotionEnabled()
  const [url, setUrl] = useState('')
  const [useHttps, setUseHttps] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onContinue = async () => {
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

  return (
    <Screen centered padBottom={false}>
      <View style={styles.hero}>
        <Brand>Melio</Brand>
        <Text style={styles.tagline}>Your Jellyfin music, beautifully.</Text>
      </View>

      <Animated.View entering={authCardEntering(enabled)}>
        <Glass style={styles.card} contentStyle={styles.cardInner}>
          <Field
            label="Server"
            accessibilityLabel="Server URL"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="jellyfin.example.com"
            value={url}
            onChangeText={setUrl}
            containerStyle={styles.field}
            inset
          />
          <View style={styles.row}>
            <Muted>Use HTTPS</Muted>
            <Toggle
              value={useHttps}
              onValueChange={setUseHttps}
              accessibilityLabel="Use HTTPS"
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            label={busy ? 'Checking…' : 'Continue'}
            onPress={() => void onContinue()}
            disabled={busy}
          />
        </Glass>
      </Animated.View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: -0.2,
    maxWidth: 280,
  },
  card: {
    width: '100%',
  },
  cardInner: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  field: {
    marginTop: 0,
  },
  row: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 40,
  },
  error: {
    marginTop: spacing.sm,
    color: colors.danger,
  },
})
