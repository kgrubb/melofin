import { useState } from 'react'
import { Image } from 'expo-image'
import Constants from 'expo-constants'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  formatLibrarySyncButton,
  formatLibrarySyncedAt,
  formatLibrarySyncProgress,
  librarySyncFraction,
  LIBRARY_SYNC_MODES,
  librarySyncModeLabel,
} from '@/src/domain/librarySync'
import {
  QUALITY_PRESETS,
  qualityPresetLabel,
  type QualityPreset,
} from '@/src/domain/streamQuality'
import {
  REPLAY_GAIN_MODES,
  replayGainModeLabel,
} from '@/src/domain/replayGain'
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

const QualityChip = ({
  preset,
  selected,
  onPress,
}: {
  readonly preset: QualityPreset
  readonly selected: boolean
  readonly onPress: () => void
}) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onPress={onPress}
    scaleTo={motion.scale.button}
    hitSlop={4}
    style={[styles.modeChip, selected ? styles.modeChipOn : null]}
  >
    <Text style={selected ? styles.modeLabelOn : styles.modeLabel}>
      {qualityPresetLabel(preset)}
    </Text>
  </PressableScale>
)

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
  const clearOffline = useSettingsStore((s) => s.clearOfflineCache)
  const budgetBytes = useSettingsStore((s) => s.budgetBytes)
  const streamQuality = useSettingsStore((s) => s.streamQuality)
  const setStreamQuality = useSettingsStore((s) => s.setStreamQuality)
  const replayGainMode = useSettingsStore((s) => s.replayGainMode)
  const setReplayGainMode = useSettingsStore((s) => s.setReplayGainMode)
  const syncedAt = useLibraryStore((s) => s.syncedAt)
  const syncing = useLibraryStore((s) => s.syncing)
  const syncProgress = useLibraryStore((s) => s.syncProgress)
  const syncError = useLibraryStore((s) => s.syncError)
  const syncLibrary = useLibraryStore((s) => s.syncLibrary)
  const clearLibrary = useLibraryStore((s) => s.clearCache)
  const [avatarFailed, setAvatarFailed] = useState(false)

  const syncFraction = librarySyncFraction(syncProgress)
  const syncStatus = syncing
    ? formatLibrarySyncProgress(syncProgress)
    : formatLibrarySyncedAt(syncedAt)

  const avatarUrl =
    context && session && !avatarFailed
      ? userImageUrl(context, session.userId, undefined, 'thumb')
      : undefined

  const close = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(main)/(tabs)/home')
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
          <Muted>{syncStatus}</Muted>
          {syncing ? (
            <View
              style={styles.syncTrack}
              accessibilityRole="progressbar"
              accessibilityValue={
                syncFraction != null
                  ? { min: 0, max: 100, now: Math.round(syncFraction * 100) }
                  : undefined
              }
            >
              <View
                style={[
                  styles.syncFill,
                  syncFraction != null
                    ? { width: `${Math.round(syncFraction * 100)}%` }
                    : styles.syncFillIndeterminate,
                ]}
              />
            </View>
          ) : null}
          {syncError ? <Text style={styles.warn}>{syncError}</Text> : null}
          <GlassButton
            label={formatLibrarySyncButton(syncing, syncProgress)}
            onPress={() => void syncLibrary('manual')}
            disabled={syncing}
          />
        </Surface>

        <Text style={styles.sectionLabel}>Audio quality</Text>
        <Surface style={styles.card} contentStyle={styles.cardInner}>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Automatic</Text>
              <Muted>Wi‑Fi High · Cellular Normal</Muted>
            </View>
            <Toggle
              value={streamQuality.automatic}
              onValueChange={(value) => void setStreamQuality({ automatic: value })}
              accessibilityLabel="Automatic stream quality"
            />
          </View>
          {!streamQuality.automatic ? (
            <>
              <Muted>Wi‑Fi streaming</Muted>
              <View style={styles.modes}>
                {QUALITY_PRESETS.map((preset) => (
                  <QualityChip
                    key={`wifi-${preset}`}
                    preset={preset}
                    selected={streamQuality.wifi === preset}
                    onPress={() => void setStreamQuality({ wifi: preset })}
                  />
                ))}
              </View>
              <Muted>Cellular streaming</Muted>
              <View style={styles.modes}>
                {QUALITY_PRESETS.map((preset) => (
                  <QualityChip
                    key={`cell-${preset}`}
                    preset={preset}
                    selected={streamQuality.cellular === preset}
                    onPress={() => void setStreamQuality({ cellular: preset })}
                  />
                ))}
              </View>
            </>
          ) : null}
          <Muted>Downloads (new only)</Muted>
          <View style={styles.modes}>
            {QUALITY_PRESETS.map((preset) => (
              <QualityChip
                key={`dl-${preset}`}
                preset={preset}
                selected={streamQuality.download === preset}
                onPress={() => void setStreamQuality({ download: preset })}
              />
            ))}
          </View>
          <Muted>Changing download quality does not re-download existing files.</Muted>
        </Surface>

        <Text style={styles.sectionLabel}>Volume normalization</Text>
        <Surface style={styles.card} contentStyle={styles.cardInner}>
          <Muted>ReplayGain (Jellyfin LUFS / tags)</Muted>
          <View style={styles.modes}>
            {REPLAY_GAIN_MODES.map((mode) => {
              const on = replayGainMode === mode
              return (
                <PressableScale
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => void setReplayGainMode(mode)}
                  scaleTo={motion.scale.button}
                  hitSlop={4}
                  style={[styles.modeChip, on ? styles.modeChipOn : null]}
                >
                  <Text style={on ? styles.modeLabelOn : styles.modeLabel}>
                    {replayGainModeLabel(mode)}
                  </Text>
                </PressableScale>
              )
            })}
          </View>
          <Muted>
            Applies as volume ≤ 100%. Requires server loudness scan (Jellyfin 10.9+).
          </Muted>
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
          onPress={() =>
            void clearOffline(
              session
                ? { serverUrl: session.serverUrl, userId: session.userId }
                : undefined,
            )
          }
        />
        <GlassButton
          label="Log out"
          destructive
          onPress={() => {
            resetPlayer()
            void clearOffline(
              session
                ? { serverUrl: session.serverUrl, userId: session.userId }
                : undefined,
            )
              .then(() => clearLibrary())
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
  syncTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  syncFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  syncFillIndeterminate: {
    width: '28%',
    opacity: 0.55,
  },
  warn: {
    color: colors.danger,
    fontWeight: '600',
  },
})
