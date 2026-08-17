import { useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import {
  formatLibrarySyncButton,
  formatLibrarySyncedAt,
  formatLibrarySyncProgress,
  LIBRARY_SYNC_MODES,
  librarySyncModeLabel,
} from '@/src/domain/librarySync'
import {
  CROSSFADE_PRESETS,
  crossfadeLabel,
} from '@/src/domain/crossfade'
import {
  QUALITY_PRESETS,
  qualityPresetLabel,
  type QualityPreset,
} from '@/src/domain/streamQuality'
import {
  REPLAY_GAIN_MODES,
  replayGainModeLabel,
} from '@/src/domain/replayGain'
import {
  EQ_PRESETS,
  effectiveEqGains,
  eqPresetLabel,
  type EqPresetId,
} from '@/src/domain/eqPresets'
import { applyNativeEq } from '@/src/player/nativeQueue'
import { sessionAccountId } from '@/src/storage/sessionStore'
import { userImageUrl } from '@/src/services/jellyfin/library'
import { useLibraryStore } from '@/src/store/library'
import { usePlayerStore } from '@/src/store/player'
import { useSessionStore } from '@/src/store/session'
import { useSettingsStore } from '@/src/store/settings'
import { Surface } from '@/src/theme/Glass'
import { CloseChip } from '@/src/ui/NavChrome'
import { Screen } from '@/src/ui/primitives'
import { SettingsGroup, SettingsRow } from '@/src/ui/SettingsList'
import { EqBandSliders } from '@/src/ui/EqBandSliders'
import { colors, spacing, typography } from '@/src/theme/tokens'

const qualityName = (preset: QualityPreset): string => {
  if (preset === 'low') return 'Low'
  if (preset === 'normal') return 'Normal'
  return 'High'
}

const privacyPolicyUrl = (): string => {
  const fromConfig = Constants.expoConfig?.extra?.privacyPolicyUrl
  return typeof fromConfig === 'string'
    ? fromConfig
    : 'https://github.com/kgrubb/melio/blob/main/PRIVACY.md'
}

const EQ_PRESET_IDS = Object.keys(EQ_PRESETS) as Exclude<EqPresetId, 'custom'>[]

export default function SettingsScreen() {
  const router = useRouter()
  const context = useSessionStore((s) => s.context)
  const session = useSessionStore((s) => s.session)
  const logout = useSessionStore((s) => s.logout)
  const accounts = useSessionStore((s) => s.accounts)
  const switchAccount = useSessionStore((s) => s.switchAccount)
  const removeAccount = useSessionStore((s) => s.removeAccount)
  const beginAddAccount = useSessionStore((s) => s.beginAddAccount)
  const resetPlayer = usePlayerStore((s) => s.reset)
  const prefetchEnabled = useSettingsStore((s) => s.prefetchEnabled)
  const setPrefetchEnabled = useSettingsStore((s) => s.setPrefetchEnabled)
  const autoplayEnabled = useSettingsStore((s) => s.autoplayEnabled)
  const setAutoplayEnabled = useSettingsStore((s) => s.setAutoplayEnabled)
  const crossfadeSeconds = useSettingsStore((s) => s.crossfadeSeconds)
  const setCrossfadeSeconds = useSettingsStore((s) => s.setCrossfadeSeconds)
  const syncMode = useSettingsStore((s) => s.syncMode)
  const setSyncMode = useSettingsStore((s) => s.setSyncMode)
  const clearOffline = useSettingsStore((s) => s.clearOfflineCache)
  const streamQuality = useSettingsStore((s) => s.streamQuality)
  const setStreamQuality = useSettingsStore((s) => s.setStreamQuality)
  const replayGainMode = useSettingsStore((s) => s.replayGainMode)
  const setReplayGainMode = useSettingsStore((s) => s.setReplayGainMode)
  const eq = useSettingsStore((s) => s.eq)
  const setEq = useSettingsStore((s) => s.setEq)
  const syncedAt = useLibraryStore((s) => s.syncedAt)
  const syncing = useLibraryStore((s) => s.syncing)
  const syncProgress = useLibraryStore((s) => s.syncProgress)
  const syncError = useLibraryStore((s) => s.syncError)
  const syncLibrary = useLibraryStore((s) => s.syncLibrary)
  const clearLibrary = useLibraryStore((s) => s.clearCache)
  const [avatarFailed, setAvatarFailed] = useState(false)

  const scope = session
    ? { serverUrl: session.serverUrl, userId: session.userId }
    : undefined
  const avatarUrl =
    context && session && !avatarFailed
      ? userImageUrl(context, session.userId, undefined, 'thumb')
      : undefined

  const close = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(main)/(tabs)/home')
  }

  const pickCrossfade = () => {
    Alert.alert('Crossfade', undefined, [
      ...CROSSFADE_PRESETS.map((seconds) => ({
        text: crossfadeLabel(seconds),
        onPress: () => {
          if (seconds !== crossfadeSeconds) void setCrossfadeSeconds(seconds)
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ])
  }

  const pickPreset = (
    title: string,
    current: QualityPreset,
    apply: (preset: QualityPreset) => void,
  ) => {
    Alert.alert(title, undefined, [
      ...QUALITY_PRESETS.map((preset) => ({
        text: qualityPresetLabel(preset),
        onPress: () => {
          if (preset !== current) apply(preset)
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ])
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
        <Text style={styles.screenTitle} accessibilityRole="header">
          Settings
        </Text>

        <View style={styles.profileBlock}>
          <Surface contentStyle={styles.profileInner}>
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
              <Text style={styles.profileDetail} numberOfLines={1}>
                {session?.serverName || session?.serverUrl || 'Jellyfin'}
              </Text>
            </View>
          </Surface>
          <Text style={styles.footer}>
            Melio {Constants.expoConfig?.version ?? '1.0.0'}
            {session?.allowInsecureHttp ? ' · HTTP' : ''}
          </Text>
        </View>

        <SettingsGroup
          title="Servers"
          footer="Saved logins to your Jellyfin servers. Forgetting one only removes it from this iPhone. Melio does not host accounts."
        >
          {accounts.accounts.map((account) => {
            const active =
              session != null && sessionAccountId(session) === account.accountId
            return (
              <SettingsRow
                key={account.accountId}
                title={account.userName}
                detail={account.serverName || account.serverUrl}
                checked={active}
                onPress={() => {
                  if (!active) void switchAccount(account.accountId)
                }}
                onLongPress={() => {
                  Alert.alert(
                    'Forget this server?',
                    'Removes the saved login from this iPhone. Your Jellyfin user is unchanged.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Forget',
                        style: 'destructive',
                        onPress: () => {
                          void removeAccount(account.accountId)
                        },
                      },
                    ],
                  )
                }}
                accessibilityHint="Touch and hold to forget this server on this iPhone"
              />
            )
          })}
          <SettingsRow
            title="Add Server"
            accent
            onPress={() => {
              beginAddAccount()
              router.push('/(auth)/server')
            }}
          />
        </SettingsGroup>

        <SettingsGroup
          title="Library Sync"
          footer={syncError ?? formatLibrarySyncedAt(syncedAt)}
        >
          {LIBRARY_SYNC_MODES.map((mode) => (
            <SettingsRow
              key={mode}
              title={librarySyncModeLabel(mode)}
              checked={syncMode === mode}
              onPress={() => void setSyncMode(mode)}
            />
          ))}
          <SettingsRow
            title={formatLibrarySyncButton(syncing, syncProgress)}
            detail={
              syncing ? formatLibrarySyncProgress(syncProgress) : undefined
            }
            accent
            busy={syncing}
            disabled={syncing}
            onPress={() => void syncLibrary('manual')}
            accessibilityLabel="Sync Now"
          />
        </SettingsGroup>

        <SettingsGroup title="Playback">
          <SettingsRow
            title="Prefetch"
            switchValue={prefetchEnabled}
            onSwitch={(value) => void setPrefetchEnabled(value)}
          />
          <SettingsRow
            title="Autoplay"
            switchValue={autoplayEnabled}
            onSwitch={(value) => void setAutoplayEnabled(value)}
          />
          <SettingsRow
            title="Crossfade"
            detail={crossfadeLabel(crossfadeSeconds)}
            chevron
            onPress={pickCrossfade}
          />
        </SettingsGroup>

        <SettingsGroup
          title="Streaming"
          footer={
            streamQuality.automatic
              ? 'Automatic picks bitrate for you: High on Wi-Fi, Normal on cellular. Turn off to set Wi-Fi and cellular yourself (saves data or forces max quality).'
              : 'Choose Wi-Fi and cellular bitrates yourself. Downloads always use the Downloads preset.'
          }
        >
          <SettingsRow
            title="Automatic"
            switchValue={streamQuality.automatic}
            onSwitch={(value) => void setStreamQuality({ automatic: value })}
          />
          {!streamQuality.automatic ? (
            <SettingsRow
              title="Wi-Fi"
              detail={qualityName(streamQuality.wifi)}
              chevron
              onPress={() =>
                pickPreset('Wi-Fi', streamQuality.wifi, (preset) => {
                  void setStreamQuality({ wifi: preset })
                })
              }
            />
          ) : null}
          {!streamQuality.automatic ? (
            <SettingsRow
              title="Cellular"
              detail={qualityName(streamQuality.cellular)}
              chevron
              onPress={() =>
                pickPreset('Cellular', streamQuality.cellular, (preset) => {
                  void setStreamQuality({ cellular: preset })
                })
              }
            />
          ) : null}
          <SettingsRow
            title="Downloads"
            detail={qualityName(streamQuality.download)}
            chevron
            onPress={() =>
              pickPreset('Downloads', streamQuality.download, (preset) => {
                void setStreamQuality({ download: preset })
              })
            }
          />
        </SettingsGroup>

        <SettingsGroup title="ReplayGain">
          {REPLAY_GAIN_MODES.map((mode) => (
            <SettingsRow
              key={mode}
              title={replayGainModeLabel(mode)}
              checked={replayGainMode === mode}
              onPress={() => void setReplayGainMode(mode)}
            />
          ))}
        </SettingsGroup>

        <SettingsGroup title="Equalizer" footer="Local playback only.">
          <SettingsRow
            title="EQ"
            switchValue={eq.enabled}
            onSwitch={(value) => {
              void setEq({ enabled: value })
            }}
          />
          {eq.enabled ? (
            <>
              {EQ_PRESET_IDS.map((presetId) => (
                <SettingsRow
                  key={presetId}
                  title={eqPresetLabel(presetId)}
                  checked={eq.presetId === presetId}
                  onPress={() => {
                    void setEq({
                      enabled: true,
                      presetId,
                      gainsDb: EQ_PRESETS[presetId],
                    })
                  }}
                />
              ))}
              <SettingsRow
                title="Custom"
                checked={eq.presetId === 'custom'}
                onPress={() => {
                  void setEq({
                    enabled: true,
                    presetId: 'custom',
                    gainsDb: effectiveEqGains(eq),
                  })
                }}
              />
              <EqBandSliders
                gainsDb={effectiveEqGains(eq)}
                onChange={(gainsDb) => {
                  applyNativeEq({
                    enabled: true,
                    presetId: 'custom',
                    gainsDb,
                  })
                }}
                onCommit={(gainsDb) => {
                  void setEq({
                    enabled: true,
                    presetId: 'custom',
                    gainsDb,
                  })
                }}
              />
            </>
          ) : null}
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            title="Privacy Policy"
            chevron
            onPress={() => {
              void Linking.openURL(privacyPolicyUrl())
            }}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            title="Clear Cache"
            destructive
            onPress={() => {
              Alert.alert('Clear Cache?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: () => {
                    void clearOffline(scope)
                  },
                },
              ])
            }}
          />
          <SettingsRow
            title="Sign Out"
            destructive
            onPress={() => {
              Alert.alert('Sign Out?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign Out',
                  style: 'destructive',
                  onPress: () => {
                    resetPlayer()
                    void clearOffline(scope)
                      .then(() => clearLibrary())
                      .then(() => logout())
                      .then(() => router.replace('/(auth)/server'))
                  },
                },
              ])
            }}
          />
        </SettingsGroup>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
  },
  scroll: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  screenTitle: {
    ...typography.title,
    color: colors.text,
  },
  profileBlock: {
    gap: 6,
  },
  profileInner: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.elevated,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 20,
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
  profileDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footer: {
    ...typography.caption,
    color: colors.textSecondary,
    marginHorizontal: spacing.md,
  },
})
