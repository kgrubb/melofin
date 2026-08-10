import { FlatList, Platform, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { usePlayerStore } from '@/src/store/player'
import { Surface } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { CloseChip } from '@/src/ui/NavChrome'
import { Screen } from '@/src/ui/primitives'
import { colors, motion, radii, spacing, typography } from '@/src/theme/tokens'

export default function QueueScreen() {
  const router = useRouter()
  const tracks = usePlayerStore((s) => s.tracks)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const playAtIndex = usePlayerStore((s) => s.playAtIndex)

  return (
    <Screen padBottom={false}>
      <View style={styles.topBar}>
        <CloseChip
          onPress={() => {
            if (router.canGoBack()) router.back()
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
              accessibilityRole="button"
              accessibilityLabel={`${item.title} by ${item.artist}`}
              accessibilityState={{ selected: active }}
              scaleTo={motion.scale.card}
              onPress={() => {
                playAtIndex(index)
              }}
            >
              <Surface
                style={[styles.row, active ? styles.rowActive : null]}
                contentStyle={styles.rowInner}
              >
                <Text style={[styles.text, active ? styles.active : null]} numberOfLines={2}>
                  {index + 1}. {item.title} — {item.artist}
                </Text>
              </Surface>
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
    justifyContent: 'center',
    paddingBottom: spacing.xs,
  },
  title: {
    ...typography.title,
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
    backgroundColor: 'rgba(217, 70, 239, 0.12)',
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
