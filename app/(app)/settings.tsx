import { useMemo, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  LIBRARY_SYNC_MODES,
} from '@/src/domain/librarySync'
import {
  formatLibrarySyncButtonLabel,
  formatLibrarySyncedAtLabel,
  formatLibrarySyncProgressLabel,
  librarySyncModeLabelFromT,
} from '@/src/i18n/librarySyncCopy'
import { CROSSFADE_PRESETS, type CrossfadeSeconds } from '@/src/domain/crossfade'
import { QUALITY_PRESETS, type QualityPreset } from '@/src/domain/streamQuality'
import { REPLAY_GAIN_MODES, type ReplayGainMode } from '@/src/domain/replayGain'
import {
  EQ_PRESETS,
  effectiveEqGains,
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

const privacyPolicyUrl = (): string => {
  const fromConfig = Constants.expoConfig?.extra?.privacyPolicyUrl
  return typeof fromConfig === 'string'
    ? fromConfig
    : 'https://github.com/kgrubb/melofin/blob/main/PRIVACY.md'
}

const sourceUrl = (): string => {
  const fromConfig = Constants.expoConfig?.extra?.sourceUrl
  return typeof fromConfig === 'string' ? fromConfig : 'https://github.com/kgrubb/melofin'
}

const EQ_PRESET_IDS = Object.keys(EQ_PRESETS) as Exclude<EqPresetId, 'custom'>[]

const crossfadeLabel = (seconds: CrossfadeSeconds, t: TFunction): string =>
  seconds === 0 ? t('settings.crossfadeOff') : t('settings.crossfadeSeconds', { seconds })

const qualityShort = (preset: QualityPreset, t: TFunction): string => {
  if (preset === 'low') return t('settings.qualityLow')
  if (preset === 'normal') return t('settings.qualityNormal')
  return t('settings.qualityHigh')
}

const qualityPresetLabel = (preset: QualityPreset, t: TFunction): string => {
  if (preset === 'low') return t('settings.qualityLowDetail')
  if (preset === 'normal') return t('settings.qualityNormalDetail')
  return t('settings.qualityHighDetail')
}

const replayGainModeLabel = (mode: ReplayGainMode, t: TFunction): string => {
  if (mode === 'off') return t('settings.replayGainOff')
  if (mode === 'track') return t('settings.replayGainTrack')
  return t('settings.replayGainAlbum')
}

const eqPresetLabel = (id: EqPresetId, t: TFunction): string => {
  switch (id) {
    case 'flat':
      return t('settings.eqFlat')
    case 'bassBoost':
      return t('settings.eqBassBoost')
    case 'trebleBoost':
      return t('settings.eqTrebleBoost')
    case 'vocal':
      return t('settings.eqVocal')
    case 'custom':
      return t('settings.eqCustom')
  }
}

const librarySyncModeLabel = librarySyncModeLabelFromT
const formatLibrarySyncedAt = formatLibrarySyncedAtLabel
const formatLibrarySyncProgress = formatLibrarySyncProgressLabel
const formatLibrarySyncButton = formatLibrarySyncButtonLabel

export default function SettingsScreen() {
  const { t } = useTranslation()
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

  const streamingFooter = useMemo(
    () =>
      streamQuality.automatic
        ? t('settings.streamingAutoFooter')
        : t('settings.streamingManualFooter'),
    [streamQuality.automatic, t],
  )

  const close = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(main)/(tabs)/home')
  }

  const pickCrossfade = () => {
    Alert.alert(t('settings.crossfade'), undefined, [
      ...CROSSFADE_PRESETS.map((seconds) => ({
        text: crossfadeLabel(seconds, t),
        onPress: () => {
          if (seconds !== crossfadeSeconds) void setCrossfadeSeconds(seconds)
        },
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ])
  }

  const pickPreset = (
    title: string,
    current: QualityPreset,
    apply: (preset: QualityPreset) => void,
  ) => {
    Alert.alert(title, undefined, [
      ...QUALITY_PRESETS.map((preset) => ({
        text: qualityPresetLabel(preset, t),
        onPress: () => {
          if (preset !== current) apply(preset)
        },
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
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
          {t('settings.title')}
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
                {session?.userName ?? t('settings.account')}
              </Text>
              <Text style={styles.profileDetail} numberOfLines={1}>
                {session?.serverName || session?.serverUrl || 'Jellyfin'}
              </Text>
            </View>
          </Surface>
          <Text style={styles.footer}>
            Melofin {Constants.expoConfig?.version ?? '1.0.0'}
            {session?.allowInsecureHttp ? ' · HTTP' : ''}
          </Text>
        </View>

        <SettingsGroup title={t('settings.servers')} footer={t('settings.serversFooter')}>
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
                    t('settings.forgetServerTitle'),
                    t('settings.forgetServerMessage'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('settings.forget'),
                        style: 'destructive',
                        onPress: () => {
                          void removeAccount(account.accountId)
                        },
                      },
                    ],
                  )
                }}
                accessibilityHint={t('settings.forgetServerHint')}
              />
            )
          })}
          <SettingsRow
            title={t('settings.addServer')}
            accent
            onPress={() => {
              beginAddAccount()
              router.push('/(auth)/server')
            }}
          />
        </SettingsGroup>

        <SettingsGroup
          title={t('settings.librarySync')}
          footer={syncError ?? formatLibrarySyncedAt(syncedAt, t)}
        >
          {LIBRARY_SYNC_MODES.map((mode) => (
            <SettingsRow
              key={mode}
              title={librarySyncModeLabel(mode, t)}
              checked={syncMode === mode}
              onPress={() => void setSyncMode(mode)}
            />
          ))}
          <SettingsRow
            title={formatLibrarySyncButton(syncing, syncProgress, t)}
            detail={
              syncing ? formatLibrarySyncProgress(syncProgress, t) : undefined
            }
            accent
            busy={syncing}
            disabled={syncing}
            onPress={() => void syncLibrary('manual')}
            accessibilityLabel={t('settings.syncNow')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.playback')}>
          <SettingsRow
            title={t('settings.prefetch')}
            switchValue={prefetchEnabled}
            onSwitch={(value) => void setPrefetchEnabled(value)}
          />
          <SettingsRow
            title={t('settings.autoplay')}
            switchValue={autoplayEnabled}
            onSwitch={(value) => void setAutoplayEnabled(value)}
          />
          <SettingsRow
            title={t('settings.crossfade')}
            detail={crossfadeLabel(crossfadeSeconds, t)}
            chevron
            onPress={pickCrossfade}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.streaming')} footer={streamingFooter}>
          <SettingsRow
            title={t('settings.automatic')}
            switchValue={streamQuality.automatic}
            onSwitch={(value) => void setStreamQuality({ automatic: value })}
          />
          {!streamQuality.automatic ? (
            <SettingsRow
              title={t('settings.wifi')}
              detail={qualityShort(streamQuality.wifi, t)}
              chevron
              onPress={() =>
                pickPreset(t('settings.wifi'), streamQuality.wifi, (preset) => {
                  void setStreamQuality({ wifi: preset })
                })
              }
            />
          ) : null}
          {!streamQuality.automatic ? (
            <SettingsRow
              title={t('settings.cellular')}
              detail={qualityShort(streamQuality.cellular, t)}
              chevron
              onPress={() =>
                pickPreset(t('settings.cellular'), streamQuality.cellular, (preset) => {
                  void setStreamQuality({ cellular: preset })
                })
              }
            />
          ) : null}
          <SettingsRow
            title={t('settings.downloadsQuality')}
            detail={qualityShort(streamQuality.download, t)}
            chevron
            onPress={() =>
              pickPreset(t('settings.downloadsQuality'), streamQuality.download, (preset) => {
                void setStreamQuality({ download: preset })
              })
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.replayGain')}>
          {REPLAY_GAIN_MODES.map((mode) => (
            <SettingsRow
              key={mode}
              title={replayGainModeLabel(mode, t)}
              checked={replayGainMode === mode}
              onPress={() => void setReplayGainMode(mode)}
            />
          ))}
        </SettingsGroup>

        <SettingsGroup title={t('settings.equalizer')} footer={t('settings.equalizerFooter')}>
          <SettingsRow
            title={t('settings.eq')}
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
                  title={eqPresetLabel(presetId, t)}
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
                title={t('settings.eqCustom')}
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
            title={t('settings.privacyPolicy')}
            chevron
            onPress={() => {
              void Linking.openURL(privacyPolicyUrl())
            }}
          />
          <SettingsRow
            title={t('settings.sourceCode')}
            chevron
            onPress={() => {
              void Linking.openURL(sourceUrl())
            }}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            title={t('settings.clearCache')}
            destructive
            onPress={() => {
              Alert.alert(t('settings.clearCacheTitle'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('settings.clear'),
                  style: 'destructive',
                  onPress: () => {
                    void clearOffline(scope)
                  },
                },
              ])
            }}
          />
          <SettingsRow
            title={t('settings.signOut')}
            destructive
            onPress={() => {
              Alert.alert(t('settings.signOutTitle'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('settings.signOutConfirm'),
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
