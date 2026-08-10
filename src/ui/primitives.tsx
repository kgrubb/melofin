import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AccentGradient, Atmosphere } from '@/src/theme/Atmosphere'
import { Glass } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { colors, radii, spacing, typography } from '@/src/theme/tokens'

export const Screen = ({
  children,
  centered = false,
  padBottom = true,
  padHorizontal = true,
}: {
  readonly children: React.ReactNode
  readonly centered?: boolean
  readonly padBottom?: boolean
  readonly padHorizontal?: boolean
}) => {
  const insets = useSafeAreaInsets()
  return (
    <Atmosphere style={styles.screen}>
      <View
        style={[
          styles.screenInner,
          centered ? styles.screenCentered : null,
          !padHorizontal ? styles.screenFlushX : null,
          {
            paddingTop: Math.max(insets.top, spacing.md),
            // Only vertical gap. Tab scenes use padBottom={false} so lists can
            // scroll under the floating glass chrome.
            paddingBottom: padBottom ? spacing.md : 0,
          },
        ]}
      >
        {children}
      </View>
    </Atmosphere>
  )
}

export const Brand = ({ children }: { readonly children: React.ReactNode }) => (
  <Text style={styles.brand} accessibilityRole="header">
    {children}
  </Text>
)

export const Title = ({ children }: { readonly children: React.ReactNode }) => (
  <Text style={styles.title} accessibilityRole="header">
    {children}
  </Text>
)

export const Body = ({ children }: { readonly children: React.ReactNode }) => (
  <Text style={styles.body}>{children}</Text>
)

export const Muted = ({ children }: { readonly children: React.ReactNode }) => (
  <Text style={styles.muted}>{children}</Text>
)

export const PrimaryButton = ({
  label,
  onPress,
  disabled,
}: {
  readonly label: string
  readonly onPress: () => void
  readonly disabled?: boolean
}) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={disabled}
    onPress={onPress}
    style={[styles.buttonPress, disabled ? styles.buttonDisabled : null]}
  >
    <AccentGradient style={styles.button}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </AccentGradient>
  </PressableScale>
)

export const GlassButton = ({
  label,
  onPress,
  disabled,
  destructive = false,
}: {
  readonly label: string
  readonly onPress: () => void
  readonly disabled?: boolean
  readonly destructive?: boolean
}) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={disabled}
    onPress={onPress}
    style={[styles.secondaryPress, disabled ? styles.buttonDisabled : null]}
  >
    <View style={[styles.secondaryButton, destructive ? styles.secondaryButtonDanger : null]}>
      <Text style={destructive ? styles.secondaryLabelDanger : styles.secondaryLabel}>
        {label}
      </Text>
    </View>
  </PressableScale>
)

export const Field = ({
  containerStyle,
  label,
  inset = true,
  ...props
}: TextInputProps & {
  readonly containerStyle?: StyleProp<ViewStyle>
  readonly label?: string
  readonly inset?: boolean
}) => (
  <View style={[styles.fieldWrap, containerStyle]}>
    {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
    {inset ? (
      <View style={styles.fieldInset}>
        <TextInput
          placeholderTextColor={colors.textSecondary}
          {...props}
          style={[styles.fieldInput, props.style]}
        />
      </View>
    ) : (
      <Glass style={styles.fieldShell} contentStyle={styles.fieldInner}>
        <TextInput
          placeholderTextColor={colors.textSecondary}
          {...props}
          style={[styles.fieldInput, props.style]}
        />
      </Glass>
    )}
  </View>
)

export const EmptyState = ({
  title,
  message,
}: {
  readonly title: string
  readonly message: string
}) => (
  <View style={styles.centered} accessibilityRole="summary">
    <Title>{title}</Title>
    <Muted>{message}</Muted>
  </View>
)

export const ErrorState = ({
  message,
  onRetry,
}: {
  readonly message: string
  readonly onRetry?: () => void
}) => (
  <View style={styles.centered}>
    <Text style={styles.error}>{message}</Text>
    {onRetry ? <PrimaryButton label="Try again" onPress={onRetry} /> : null}
  </View>
)

export const LoadingState = ({ label = 'Loading' }: { readonly label?: string }) => (
  <View style={styles.centered} accessibilityLabel={label}>
    <ActivityIndicator color={colors.accent} />
  </View>
)

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenInner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  screenFlushX: {
    paddingHorizontal: 0,
  },
  screenCentered: {
    justifyContent: 'center',
  },
  brand: {
    ...typography.brand,
    color: colors.text,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.text,
  },
  muted: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  buttonPress: {
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  button: {
    minHeight: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    color: colors.onAccent,
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.2,
  },
  secondaryPress: {
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  secondaryButtonDanger: {
    backgroundColor: 'rgba(251, 113, 133, 0.14)',
    borderColor: 'rgba(251, 113, 133, 0.35)',
  },
  secondaryLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryLabelDanger: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 16,
  },
  fieldWrap: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fieldShell: {
    borderRadius: radii.md,
  },
  fieldInset: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  fieldInner: {
    minHeight: 52,
    justifyContent: 'center',
  },
  fieldInput: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
})
