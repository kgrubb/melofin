import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Modal, FlatList } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  castErrorMessageFromT,
  localizeCastDevice,
} from '@/src/i18n/castCopy'
import { useCastStore } from '@/src/cast/castStore'
import {
  scheduleStopDiscovery,
  startDiscovery,
  transferTo,
} from '@/src/cast/router'
import type { CastDevice } from '@/src/cast/types'
import { LOCAL_DEVICE_ID } from '@/src/cast/types'
import { Glass } from '@/src/theme/Glass'
import { Surface } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { colors, radii, spacing, typography } from '@/src/theme/tokens'
import { CloseChip } from '@/src/ui/NavChrome'
import { Icon } from '@/src/ui/Icon'
import { AirPlayRouteButton } from '@/src/ui/AirPlayRouteButton'
import { CastRouteButton } from '@/src/ui/CastRouteButton'
import { currentTrack } from '@/src/domain/queue'
import { usePlayerStore } from '@/src/store/player'

const iconFor = (device: CastDevice): string => {
  if (device.kind === 'local') return 'iphone'
  if (device.kind === 'airplay') return 'airplayaudio'
  if (device.kind === 'jellyfin') return 'tv'
  return 'hifispeaker'
}

const DeviceRow = ({
  device,
  active,
  transferring,
  disabled,
  onPress,
}: {
  readonly device: CastDevice
  readonly active: boolean
  readonly transferring: boolean
  readonly disabled: boolean
  readonly onPress: () => void
}) => {
  const { t } = useTranslation()
  const label = localizeCastDevice(device, t)
  return (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label.name}
    accessibilityState={{ selected: active, disabled, busy: transferring }}
    disabled={disabled || transferring}
    onPress={onPress}
    scaleTo={0.98}
    style={styles.rowPress}
  >
    <Surface style={styles.row} contentStyle={styles.rowInner}>
      <Icon
        name={iconFor(device)}
        size={22}
        tintColor={active ? colors.accent : colors.text}
      />
      <View style={styles.rowMeta}>
        <Text style={[styles.rowTitle, active && styles.rowTitleActive]} numberOfLines={1}>
          {label.name}
        </Text>
        {label.subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {label.subtitle}
          </Text>
        ) : null}
      </View>
      {active ? (
        <Icon name="checkmark" size={18} tintColor={colors.accent} />
      ) : transferring ? (
        <Text style={styles.busy}>...</Text>
      ) : null}
    </Surface>
  </PressableScale>
  )
}

export const DevicesSheet = () => {
  const { t } = useTranslation()
  const sheetOpen = useCastStore((s) => s.sheetOpen)
  const devices = useCastStore((s) => s.devices)
  const transfer = useCastStore((s) => s.transfer)
  const lastError = useCastStore((s) => s.lastError)
  const setSheetOpen = useCastStore((s) => s.setSheetOpen)
  const hasTrack = usePlayerStore((s) => Boolean(currentTrack(s)))

  if (Platform.OS === 'web') return null

  const close = () => {
    setSheetOpen(false)
    scheduleStopDiscovery()
  }

  return (
    <Modal
      visible={sheetOpen}
      transparent
      animationType="slide"
      onRequestClose={close}
      onShow={() => {
        startDiscovery()
      }}
    >
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.dismiss')}>
        <Pressable
          style={styles.sheetWrap}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          <Glass
            style={styles.sheet}
            contentStyle={styles.sheetInner}
            intensity={20}
            isInteractive
          >
            <View style={styles.grabberRow}>
              <CloseChip onPress={close} />
            </View>
            <View style={styles.headingRow}>
              <Text style={styles.heading} accessibilityRole="header">
                {t('player.devices')}
              </Text>
              <CastRouteButton style={styles.castBtn} />
            </View>
            <Text style={styles.caption}>
              {t('player.devicesCaption')}
            </Text>
            {lastError ? (
              <Text style={styles.error}>{castErrorMessageFromT(lastError, t)}</Text>
            ) : null}
            <FlatList
              data={[
                ...devices.filter((d) => d.kind !== 'airplay'),
                ...(Platform.OS === 'ios'
                  ? [
                      {
                        id: 'airplay',
                        name: t('player.airplay'),
                        kind: 'airplay' as const,
                        subtitle: t('player.systemDevices'),
                      },
                    ]
                  : []),
              ]}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                if (item.kind === 'airplay') {
                  return (
                    <View style={styles.airplayRow}>
                      <Surface style={styles.row} contentStyle={styles.rowInner}>
                        <Icon name="airplayaudio" size={22} tintColor={colors.text} />
                        <View style={styles.rowMeta}>
                          <Text style={styles.rowTitle}>{t('player.airplay')}</Text>
                          <Text style={styles.rowSubtitle}>{t('player.systemDevices')}</Text>
                        </View>
                        <AirPlayRouteButton style={styles.airplayBtn} />
                      </Surface>
                    </View>
                  )
                }
                const active = transfer.active.deviceId === item.id
                const transferring =
                  transfer.phase === 'transferring' && transfer.targetId === item.id
                const disabled = !hasTrack && item.id !== LOCAL_DEVICE_ID
                return (
                  <DeviceRow
                    device={item}
                    active={active}
                    transferring={transferring}
                    disabled={disabled}
                    onPress={() => {
                      void transferTo(item.id)
                    }}
                  />
                )
              }}
            />
          </Glass>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    maxHeight: '70%',
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  sheetInner: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  heading: {
    ...typography.subtitle,
    color: colors.text,
  },
  caption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  castBtn: {
    width: 28,
    height: 28,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  rowPress: {
    width: '100%',
  },
  row: {
    borderRadius: radii.md,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.body,
    color: colors.text,
  },
  rowTitleActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  busy: {
    color: colors.textSecondary,
    fontSize: 18,
  },
  airplayRow: {
    width: '100%',
  },
  airplayBtn: {
    width: 44,
    height: 44,
  },
})
