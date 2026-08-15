import { Children, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native'
import { Surface } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { colors, motion, spacing, typography } from '@/src/theme/tokens'

export const SettingsGroup = ({
  title,
  footer,
  children,
}: {
  readonly title?: string
  readonly footer?: string
  readonly children: ReactNode
}) => {
  const items = Children.toArray(children).filter(Boolean)
  return (
    <View style={styles.group}>
      {title ? (
        <Text style={styles.header} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Surface contentStyle={styles.cardInner}>
        {items.map((child, index) => (
          <View key={index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {child}
          </View>
        ))}
      </Surface>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  )
}

export const SettingsRow = ({
  title,
  detail,
  checked,
  chevron,
  accent,
  destructive,
  disabled,
  busy,
  switchValue,
  onSwitch,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  readonly title: string
  readonly detail?: string
  readonly checked?: boolean
  readonly chevron?: boolean
  readonly accent?: boolean
  readonly destructive?: boolean
  readonly disabled?: boolean
  readonly busy?: boolean
  readonly switchValue?: boolean
  readonly onSwitch?: (value: boolean) => void
  readonly onPress?: () => void
  readonly onLongPress?: () => void
  readonly accessibilityLabel?: string
  readonly accessibilityHint?: string
}) => {
  const isSwitch = onSwitch != null && switchValue != null
  const label = accessibilityLabel ?? title
  const rowPress = isSwitch
    ? () => {
        if (!disabled) onSwitch(!switchValue)
      }
    : onPress
  const titleStyle = [
    styles.title,
    accent ? styles.titleAccent : null,
    destructive ? styles.titleDanger : null,
  ]
  const body = (
    <View
      style={[
        styles.row,
        // Keep busy action rows readable (e.g. Sync Now while progress updates).
        disabled && !busy ? styles.rowDisabled : null,
      ]}
    >
      <Text style={titleStyle} numberOfLines={1}>
        {title}
      </Text>
      {detail ? (
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      {checked ? <Icon name="checkmark" size={18} tintColor={colors.accent} /> : null}
      {chevron ? (
        <Icon name="chevron.right" size={14} tintColor={colors.textSecondary} />
      ) : null}
      {isSwitch ? (
        <Switch
          value={switchValue}
          disabled={disabled}
          pointerEvents="none"
          trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="rgba(255,255,255,0.18)"
        />
      ) : null}
    </View>
  )

  if (!rowPress && !onLongPress) {
    return (
      <View accessible accessibilityLabel={label}>
        {body}
      </View>
    )
  }

  return (
    <PressableScale
      accessibilityRole={isSwitch ? 'switch' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: Boolean(disabled),
        selected: checked,
        checked: isSwitch ? switchValue : undefined,
      }}
      disabled={disabled}
      scaleTo={motion.scale.card}
      onPress={rowPress}
      onLongPress={onLongPress}
    >
      {body}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  group: {
    gap: 6,
  },
  header: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.md,
  },
  cardInner: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginLeft: spacing.md,
  },
  row: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  title: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  titleAccent: {
    color: colors.accent,
  },
  titleDanger: {
    color: colors.danger,
  },
  detail: {
    ...typography.body,
    color: colors.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
  },
  footer: {
    ...typography.caption,
    color: colors.textSecondary,
    marginHorizontal: spacing.md,
    lineHeight: 18,
  },
})
