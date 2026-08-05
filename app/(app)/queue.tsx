import { FlatList, Platform, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { usePlayerStore } from '@/src/store/player'
import { Glass } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { Screen } from '@/src/ui/primitives'
import { colors, motion, radii, spacing, typography } from '@/src/theme/tokens'

const CloseChip = ({ onPress }: { readonly onPress: () => void }) => (
  <PressableScale
    accessibilityRole="button"
    accessibilityLabel="Close"
    scaleTo={motion.scale.button}
    onPress={onPress}
    style={styles.closePress}
  >
    <Glass style={styles.closeGlass} contentStyle={styles.closeInner} intensity={26}>
      <Icon name="chevron.down" tintColor={colors.text} size={22} />
    </Glass>
  </PressableScale>
)

export default function QueueScreen() {
  const router = useRouter()
  const tracks = usePlayerStore((s) => s.tracks)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const skipToIndex = usePlayerStore((s) => s.skipToIndex)
  const setPlaying = usePlayerStore((s) => s.setPlaying)

  return (
    <Screen padBottom={false}>
      <View style={styles.topBar}>
        <CloseChip
          onPress={() => {
            if (router.canGoBack()) router.back()
            else router.replace('/(app)/player')
          }}
        />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        Queue
      </Text>
      <FlatList
        data={tracks}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        windowSize={7}
        maxToRenderPerBatch={8}
        initialNumToRender={6}
        removeClippedSubviews={Platform.OS !== 'web'}
        renderItem={({ item, index }) => {
          const active = index === currentIndex
          return (
            <PressableScale
              scaleTo={motion.scale.card}
              onPress={() => {
                skipToIndex(index)
                setPlaying(true)
              }}
            >
              <Glass
                style={[styles.row, active ? styles.rowActive : null]}
                contentStyle={styles.rowInner}
                intensity={26}
              >
                <Text style={[styles.text, active ? styles.active : null]} numberOfLines={2}>
                  {index + 1}. {item.title} — {item.artist}
                </Text>
              </Glass>
            </PressableScale>
          )
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  closePress: {
    width: 40,
    height: 40,
  },
  closeGlass: {
    borderRadius: radii.pill,
    width: 40,
    height: 40,
  },
  closeInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.title,
    fontSize: 34,
    color: colors.text,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  row: {
    borderRadius: radii.md,
  },
  rowActive: {
    borderColor: colors.accent,
  },
  rowInner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  text: {
    color: colors.text,
  },
  active: {
    color: colors.accent,
    fontWeight: '700',
  },
})
