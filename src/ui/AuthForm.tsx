import { Children, type ReactNode, type Ref } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass, Toggle } from '@/src/theme/Glass'
import { Brand, Muted } from '@/src/ui/primitives'
import { colors, radii, spacing, typography } from '@/src/theme/tokens'

const webFieldInput = {
  outlineStyle: 'none',
  outlineWidth: 0,
} as unknown as TextStyle

/** Keyboard-aware column. Keeps the form readable on small phones and iPad. */
export const AuthScroll = ({ children }: { readonly children: ReactNode }) => {
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export const AuthHero = ({
  brand,
  title,
  subtitle,
  leading,
}: {
  readonly brand?: string
  readonly title?: string
  readonly subtitle?: string
  readonly leading?: ReactNode
}) => (
  <View style={styles.hero}>
    {leading}
    {brand ? (
      <Brand>{brand}</Brand>
    ) : (
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    )}
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
  </View>
)

/** Grouped glass inset — one material, hairline rows. */
export const GlassGroup = ({
  footer,
  children,
}: {
  readonly footer?: string
  readonly children: ReactNode
}) => {
  const items = Children.toArray(children).filter(Boolean)
  return (
    <View style={styles.group}>
      <Glass style={styles.groupGlass} contentStyle={styles.groupInner}>
        {items.map((child, index) => (
          <View key={index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {child}
          </View>
        ))}
      </Glass>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  )
}

export const AuthField = ({
  inputRef,
  label,
  ...props
}: TextInputProps & {
  readonly inputRef?: Ref<TextInput>
  readonly label: string
}) => (
  <View style={styles.fieldRow}>
    <Text style={styles.fieldLabel} numberOfLines={1}>
      {label}
    </Text>
    <TextInput
      ref={inputRef}
      accessibilityLabel={label}
      placeholderTextColor={colors.textSecondary}
      keyboardAppearance="dark"
      selectionColor={colors.accent}
      underlineColorAndroid="transparent"
      {...props}
      style={[
        styles.fieldInput,
        Platform.OS === 'web' ? webFieldInput : null,
        props.style,
      ]}
    />
  </View>
)

export const AuthSwitchRow = ({
  label,
  value,
  onValueChange,
}: {
  readonly label: string
  readonly value: boolean
  readonly onValueChange: (next: boolean) => void
}) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityLabel={label}
    accessibilityState={{ checked: value }}
    onPress={() => onValueChange(!value)}
  >
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <View pointerEvents="none" accessibilityElementsHidden>
        <Toggle value={value} onValueChange={onValueChange} />
      </View>
    </View>
  </Pressable>
)

export const AuthError = ({ message }: { readonly message: string }) => (
  <Text style={styles.error} accessibilityRole="alert">
    {message}
  </Text>
)

export const AuthHint = ({ children }: { readonly children: ReactNode }) => (
  <View style={styles.hint}>
    <Muted>{children}</Muted>
  </View>
)

export const AuthCode = ({
  code,
  accessibilityLabel,
}: {
  readonly code: string
  readonly accessibilityLabel: string
}) => (
  <View
    style={styles.codeRow}
    accessibilityRole="text"
    accessibilityLabel={accessibilityLabel}
  >
    <Text selectable style={styles.code}>
      {code}
    </Text>
  </View>
)

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: spacing.md,
  },
  column: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  hero: {
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textSecondary,
    fontWeight: '500',
    maxWidth: 340,
  },
  group: {
    gap: 6,
  },
  groupGlass: {
    borderRadius: radii.xl,
  },
  groupInner: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginLeft: spacing.md,
  },
  fieldRow: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  fieldLabel: {
    ...typography.body,
    color: colors.text,
    width: 96,
  },
  fieldInput: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    letterSpacing: -0.2,
    paddingVertical: 14,
    textAlignVertical: 'center',
  },
  switchRow: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  footer: {
    ...typography.caption,
    color: colors.textSecondary,
    marginHorizontal: spacing.md,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.sm,
  },
  hint: {
    marginTop: spacing.md,
  },
  codeRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  code: {
    ...typography.title,
    color: colors.text,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
})
