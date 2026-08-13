import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View, type ColorValue } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayerStore } from '@/src/store/player'
import { Glass } from '@/src/theme/Glass'
import { PressableScale } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { chrome, colors, motion, radii, spacing } from '@/src/theme/tokens'

/** Opaque selection bubble fill (Liquid Glass selected tab). */
const SELECTED_BUBBLE = 'rgba(255, 255, 255, 0.88)'
const SELECTED_ICON = '#1A0B2E'

type TabName = 'home' | 'search' | 'library' | 'downloads'

const TABS: readonly {
  readonly name: TabName
  readonly title: string
  readonly outline: string
  readonly filled: string
  readonly href: `/(app)/(main)/(tabs)/${TabName}`
}[] = [
  {
    name: 'home',
    title: 'Home',
    outline: 'house',
    filled: 'house.fill',
    href: '/(app)/(main)/(tabs)/home',
  },
  {
    name: 'search',
    title: 'Search',
    outline: 'magnifyingglass',
    filled: 'magnifyingglass',
    href: '/(app)/(main)/(tabs)/search',
  },
  {
    name: 'library',
    title: 'Library',
    outline: 'rectangle.stack',
    filled: 'rectangle.stack.fill',
    href: '/(app)/(main)/(tabs)/library',
  },
  {
    name: 'downloads',
    title: 'Downloads',
    outline: 'arrow.down.circle',
    filled: 'arrow.down.circle.fill',
    href: '/(app)/(main)/(tabs)/downloads',
  },
]

const tabFromPath = (pathname: string): TabName | null => {
  if (pathname.includes('/search')) return 'search'
  if (pathname.includes('/library')) return 'library'
  if (pathname.includes('/downloads')) return 'downloads'
  if (pathname.includes('/home')) return 'home'
  return null
}

const TabGlyph = ({
  outline,
  filled,
  color,
  focused,
}: {
  readonly outline: string
  readonly filled: string
  readonly color: ColorValue
  readonly focused: boolean
}) => (
  <View style={[styles.iconBubble, focused ? styles.iconBubbleSelected : null]}>
    <Icon
      name={focused ? filled : outline}
      tintColor={focused ? SELECTED_ICON : color}
      size={22}
    />
  </View>
)

export const FloatingTabBar = () => {
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const [lastTab, setLastTab] = useState<TabName>('home')
  const nowPlayingOpen = usePlayerStore((s) => s.nowPlayingOpen)

  const onSheet =
    pathname.includes('/settings') || pathname.includes('/queue')

  const pathTab = tabFromPath(pathname)
  useEffect(() => {
    if (pathTab) setLastTab(pathTab)
  }, [pathTab])

  // Overlay routes (/player, settings, queue) must keep lastTab — falling back
  // to 'home' made the selection thrash on every minimize.
  const active: TabName = pathTab ?? lastTab

  const bottom = Math.max(insets.bottom, spacing.sm)
  const covered = nowPlayingOpen || onSheet

  return (
    <View
      pointerEvents={covered ? 'none' : 'box-none'}
      style={[styles.wrap, { bottom, height: chrome.tabBarHeight }]}
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
    >
      <Glass
        style={styles.glass}
        contentStyle={styles.row}
        intensity={Platform.OS === 'web' ? 40 : 18}
      >
        {TABS.map((tab) => {
          const focused = active === tab.name
          const color = focused ? colors.text : colors.textSecondary
          return (
            <PressableScale
              key={tab.name}
              accessibilityRole="tab"
              accessibilityLabel={tab.title}
              accessibilityState={{ selected: focused }}
              scaleTo={motion.scale.button}
              onPress={() => {
                setLastTab(tab.name)
                router.navigate(tab.href)
              }}
              style={styles.tab}
            >
              <TabGlyph
                outline={tab.outline}
                filled={tab.filled}
                color={color}
                focused={focused}
              />
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {tab.title}
              </Text>
            </PressableScale>
          )
        })}
      </Glass>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 30,
  },
  glass: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
  },
  iconBubble: {
    width: 52,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { borderCurve: 'continuous' as const },
      default: {},
    }),
  },
  iconBubbleSelected: {
    backgroundColor: SELECTED_BUBBLE,
  },
})
