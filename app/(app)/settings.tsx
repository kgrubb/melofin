import { useState } from 'react'
import { Image } from 'expo-image'
import Constants from 'expo-constants'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { emptyOfflineIndex } from '@/src/domain/offline'
import {
  formatLibrarySyncedAt,
  LIBRARY_SYNC_MODES,
  librarySyncModeLabel,
} from '@/src/domain/librarySync'
import { userImageUrl } from '@/src/services/jellyfin/library'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { Surface, Toggle } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { CloseChip } from '@/src/ui/NavChrome'
import {
  GlassButton,
  Muted,
  Screen,
} from '@/src/ui/primitives'
import { colors, motion, radii, spacing, typography } from '@/src/theme/tokens'

export default function SettingsScreen() {
  const router = useRouter()
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const logout = useSessionStore((s) => s.logout)
  const resetPlayer = usePlayerStore((s) => s.reset)
  const prefetchEnabled = useSettingsStore((s) => s.prefetchEnabled)
  const setPrefetchEnabled = useSettingsStore((s) => s.setPrefetchEnabled)
  const syncMode = useSettingsStore((s) => s.syncMode)
  const setSyncMode = useSettingsStore((s) => s.setSyncMode)
  const setOfflineIndex = useSettingsStore((s) => s.setOfflineIndex)
  const budgetBytes = useSettingsStore((s) => s.budgetBytes)
  const syncedAt = useLibraryStore((s) => s.syncedAt)
  const syncing = useLibraryStore((s) => s.syncing)
  const syncError = useLibraryStore((s) => s.syncError)
  const syncLibrary = useLibraryStore((s) => s.syncLibrary)
  const clearLibrary = useLibraryStore((s) => s.clearCache)
  const [avatarFailed, setAvatarFailed] = useState(false)

  const avatarUrl =
    context && session && !avatarFailed
      ? userImageUrl(context, session.userId, undefined, 'thumb')
      : undefined

  const close = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/home')
  }

  return (
    <Screen padBottom={false}>
      <View style={styles.topBar}>
        <CloseChip onPress={close} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>

        <Surface style={styles.card} contentStyle={styles.profileInner}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {(session?.userName ?? '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.profileMeta}>
            <Text style={styles.userName} numberOfLines={1}>
              {session?.userName ?? 'Account'}
            </Text>
            <Muted>
              {session?.serverName || session?.serverUrl || 'Jellyfin'}
            </Muted>
            <Muted>App {Constants.expoConfig?.version ?? '1.0.0'}</Muted>
          </View>
        </Surface>

        <Text style={styles.sectionLabel}>Library</Text>
        <Surface style={styles.card} contentStyle={styles.cardInner}>
          <Muted>Sync mode</Muted>
          <View style={styles.modes}>
            {LIBRARY_SYNC_MODES.map((mode) => {
              const on = syncMode === mode
              return (
                <PressableScale
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => void setSyncMode(mode)}
                  scaleTo={motion.scale.button}
                  hitSlop={4}
                  style={[styles.modeChip, on ? styles.modeChipOn : null]}
                >
                  <Text style={on ? styles.modeLabelOn : styles.modeLabel}>
                    {librarySyncModeLabel(mode)}
                  </Text>
                </PressableScale>
              )
            })}
          </View>
          <Muted>{formatLibrarySyncedAt(syncedAt)}</Muted>
          {syncError ? <Text style={styles.warn}>{syncError}</Text> : null}
          <GlassButton
            label={syncing ? 'Syncing…' : 'Sync now'}
            onPress={() => void syncLibrary('manual')}
            disabled={syncing}
          />
        </Surface>

        <Text style={styles.sectionLabel}>Playback</Text>
        <Surface style={styles.card} contentStyle={styles.cardInner}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Prefetch next tracks</Text>
              <Muted>Download upcoming songs for smoother playback</Muted>
            </View>
            <Toggle
              value={prefetchEnabled}
              onValueChange={(value) => void setPrefetchEnabled(value)}
              accessibilityLabel="Prefetch next tracks"
            />
          </View>
          <Muted>Cache budget {(budgetBytes / (1024 * 1024 * 1024)).toFixed(0)} GB</Muted>
        </Surface>

        <GlassButton
          label="Clear offline cache"
          onPress={() => void setOfflineIndex(emptyOfflineIndex(budgetBytes))}
        />
        <GlassButton
          label="Log out"
          destructive
          onPress={() => {
            resetPlayer()
            void clearLibrary()
              .then(() => logout())
              .then(() => router.replace('/(auth)/server'))
          }}
        />
        {session?.allowInsecureHttp ? (
          <Text style={styles.warn}>Connected over insecure HTTP</Text>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xs,
  },
  scroll: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  card: {
    borderRadius: radii.lg,
  },
  profileInner: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.elevated,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 24,
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  userName: {
    ...typography.subtitle,
    color: colors.text,
  },
  cardInner: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  modes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modeChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
  },
  modeChipOn: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
  },
  modeLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  modeLabelOn: {
    color: '#1A0B2E',
    fontWeight: '700',
    fontSize: 13,
  },
  warn: {
    color: colors.danger,
    fontWeight: '600',
  },
})
