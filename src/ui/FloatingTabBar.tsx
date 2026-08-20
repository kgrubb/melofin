import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View, type ColorValue, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { usePlayerStore } from '@/src/store/player'
import { Glass, nativeLiquidGlass } from '@/src/theme/Glass'
import { PressableScale, useMotionEnabled } from '@/src/theme/motion'
import { Icon } from '@/src/ui/Icon'
import { chrome, motion, spacing } from '@/src/theme/tokens'

const SELECTED_FROST = 'rgba(255, 255, 255, 0.16)'
const UNSELECTED = 'rgba(255, 255, 255, 0.72)'
const SELECTION_HEIGHT = chrome.tabBarHeight - chrome.tabBarInset * 2
const PILL_INSET = 1

const iosCurve =
  Platform.OS === 'ios' ? ({ borderCurve: 'continuous' as const } satisfies object) : null

type TabName = 'home' | 'search' | 'library' | 'downloads'

type TabLayout = {
  readonly x: number
  readonly width: number
}

const TABS: readonly {
  readonly name: TabName
  readonly key: `tabs.${TabName}`
  readonly outline: string
  readonly filled: string
  readonly href: `/(app)/(main)/(tabs)/${TabName}`
}[] = [
  { name: 'home', key: 'tabs.home', outline: 'house', filled: 'house.fill', href: '/(app)/(main)/(tabs)/home' },
  { name: 'search', key: 'tabs.search', outline: 'magnifyingglass', filled: 'magnifyingglass', href: '/(app)/(main)/(tabs)/search' },
  { name: 'library', key: 'tabs.library', outline: 'rectangle.stack', filled: 'rectangle.stack.fill', href: '/(app)/(main)/(tabs)/library' },
  { name: 'downloads', key: 'tabs.downloads', outline: 'arrow.down.circle', filled: 'arrow.down.circle.fill', href: '/(app)/(main)/(tabs)/downloads' },
]

const tabFromPath = (pathname: string): TabName | null => {
  if (pathname.includes('/search')) return 'search'
  if (pathname.includes('/library')) return 'library'
  if (pathname.includes('/downloads')) return 'downloads'
  if (pathname.includes('/home')) return 'home'
  return null
}

export const FloatingTabBar = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const motionOn = useMotionEnabled()
  const [lastTab, setLastTab] = useState<TabName>('home')
  const [layouts, setLayouts] = useState<Readonly<Record<string, TabLayout>>>({})
  const nowPlayingOpen = usePlayerStore((s) => s.nowPlayingOpen)
  const onSheet = pathname.includes('/settings') || pathname.includes('/queue')
  const pathTab = tabFromPath(pathname)
  useEffect(() => {
    if (pathTab) setLastTab(pathTab)
  }, [pathTab])

  const active = pathTab ?? lastTab
  const covered = nowPlayingOpen || onSheet
  const liquid = nativeLiquidGlass()
  const pillX = useSharedValue(0)
  const pillW = useSharedValue(0)
  const placed = useRef(false)

  useEffect(() => {
    const layout = layouts[active]
    if (!layout) return
    const x = layout.x + PILL_INSET
    const width = Math.max(layout.width - PILL_INSET * 2, 1)
    if (motionOn && placed.current) {
      pillX.value = withSpring(x, motion.spring.selection)
      pillW.value = withSpring(width, motion.spring.selection)
      return
    }
    pillX.value = x
    pillW.value = width
    placed.current = true
  }, [active, layouts, motionOn, pillW, pillX])

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
  }))

  return (
    <View
      pointerEvents={covered ? 'none' : 'box-none'}
      style={[styles.wrap, { bottom: Math.max(insets.bottom, spacing.sm) }]}
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
    >
      <Glass
        style={[styles.glass, liquid ? null : styles.clip]}
        contentStyle={styles.row}
        intensity={Platform.OS === 'web' ? 48 : 36}
        isInteractive={liquid}
      >
        <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]} />
        {TABS.map((tab) => {
          const focused = active === tab.name
          const title = t(tab.key)
          const color: ColorValue = focused ? '#FFFFFF' : UNSELECTED
          return (
            <PressableScale
              key={tab.name}
              accessibilityRole="tab"
              accessibilityLabel={title}
              accessibilityState={{ selected: focused }}
              scaleTo={motion.scale.button}
              onPress={() => {
                setLastTab(tab.name)
                router.navigate(tab.href)
              }}
              onLayout={(event: LayoutChangeEvent) => {
                const { x, width } = event.nativeEvent.layout
                setLayouts((prev) => {
                  const existing = prev[tab.name]
                  if (existing && existing.x === x && existing.width === width) return prev
                  return { ...prev, [tab.name]: { x, width } }
                })
              }}
              style={styles.tab}
            >
              <Icon name={focused ? tab.filled : tab.outline} tintColor={color} size={25} />
              <Text
                style={[styles.label, { color }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                maxFontSizeMultiplier={1.4}
              >
                {title}
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
    left: chrome.tabBarMargin,
    right: chrome.tabBarMargin,
    height: chrome.tabBarHeight,
    zIndex: 30,
  },
  glass: {
    flex: 1,
    borderRadius: chrome.tabBarHeight / 2,
  },
  clip: { overflow: 'hidden' },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: chrome.tabBarInset,
  },
  pill: {
    position: 'absolute',
    top: chrome.tabBarInset,
    bottom: chrome.tabBarInset,
    left: 0,
    overflow: 'hidden',
    borderRadius: SELECTION_HEIGHT / 2,
    backgroundColor: SELECTED_FROST,
    ...iosCurve,
  },
  tab: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 44,
  },
  label: { fontSize: 10, fontWeight: '600' },
})
