import { useEffect, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Field, GlassButton, PrimaryButton } from '@/src/ui/primitives'
import { colors, radii, spacing, typography } from '@/src/theme/tokens'

export type PlaylistPickItem = {
  readonly id: string
  readonly name: string
  readonly childCount?: number
}

export type TrackActionButton = {
  readonly text: string
  readonly style?: 'default' | 'cancel' | 'destructive'
  readonly onPress?: () => void
}

export const presentTrackActions = (
  title: string,
  buttons: readonly TrackActionButton[],
): void => {
  Alert.alert(title, undefined, [
    ...buttons.map((button) => ({
      text: button.text,
      style: button.style,
      onPress: button.onPress,
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ])
}

export const PlaylistNameModal = ({
  visible,
  title,
  initialName = '',
  busy = false,
  onCancel,
  onSubmit,
}: {
  readonly visible: boolean
  readonly title: string
  readonly initialName?: string
  readonly busy?: boolean
  readonly onCancel: () => void
  readonly onSubmit: (name: string) => void
}) => {
  const [name, setName] = useState(initialName)
  const canSave = name.trim().length > 0 && !busy

  useEffect(() => {
    if (visible) setName(initialName)
  }, [visible, initialName])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={busy ? undefined : onCancel}
          accessibilityLabel="Dismiss"
        >
          <Pressable
            style={styles.card}
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
          >
            <Text style={styles.title}>{title}</Text>
            <Field
              accessibilityLabel="Playlist name"
              value={name}
              onChangeText={setName}
              placeholder="Playlist name"
              autoFocus
              editable={!busy}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canSave) onSubmit(name)
              }}
              inset
            />
            <View style={styles.actions} accessibilityState={{ busy }}>
              <View style={styles.actionHalf}>
                <GlassButton label="Cancel" onPress={onCancel} disabled={busy} />
              </View>
              <View style={styles.actionHalf}>
                <PrimaryButton
                  label={busy ? 'Saving...' : 'Save'}
                  onPress={() => onSubmit(name)}
                  disabled={!canSave}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export const PlaylistPickerModal = ({
  visible,
  playlists,
  busy = false,
  onCancel,
  onPick,
  onCreateNew,
}: {
  readonly visible: boolean
  readonly playlists: readonly PlaylistPickItem[]
  readonly busy?: boolean
  readonly onCancel: () => void
  readonly onPick: (playlistId: string) => void
  readonly onCreateNew: () => void
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <Pressable
      style={styles.backdrop}
      onPress={busy ? undefined : onCancel}
      accessibilityLabel="Dismiss"
    >
      <Pressable
        style={styles.card}
        onPress={(event) => event.stopPropagation()}
        accessibilityViewIsModal
        accessibilityState={{ busy }}
      >
        <Text style={styles.title}>Add to playlist</Text>
        <GlassButton label="New playlist" onPress={onCreateNew} disabled={busy} />
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>No playlists yet. Create one above.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => onPick(item.id)}
              style={[styles.pickRow, busy ? styles.pickDisabled : null]}
            >
              <Text style={styles.pickName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.childCount !== undefined ? (
                <Text style={styles.pickMeta}>
                  {item.childCount} track{item.childCount === 1 ? '' : 's'}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
        <GlassButton label="Cancel" onPress={onCancel} disabled={busy} />
      </Pressable>
    </Pressable>
  </Modal>
)

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '80%',
  },
  title: {
    ...typography.title,
    color: colors.text,
    fontSize: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionHalf: {
    flex: 1,
  },
  list: {
    maxHeight: 280,
  },
  empty: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  pickRow: {
    minHeight: 52,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickDisabled: {
    opacity: 0.45,
  },
  pickName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  pickMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
})
