import { useMemo, useState, type ReactNode } from 'react'
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { useRouter } from 'expo-router'

const EDGE_WIDTH = 32
const DISMISS_RATIO = 0.28
const DISMISS_VELOCITY = 0.85

const useCustomEdgeBack = Platform.OS !== 'ios'

/**
 * Left-edge swipe back for web/Android.
 * Uses RN PanResponder only — Gesture Handler pan tracking throws
 * "Invalid pointer id" on web when lists unmount mid-gesture.
 */
export const EdgeBackGesture = ({
  children,
  enabled = true,
}: {
  readonly children: ReactNode
  readonly enabled?: boolean
}) => {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const [dragX, setDragX] = useState(0)
  const active = useCustomEdgeBack && enabled

  const panResponder = useMemo(() => {
    if (!active) return null

    const pop = () => {
      setDragX(0)
      if (router.canGoBack()) router.back()
    }

    return PanResponder.create({
      onMoveShouldSetPanResponder: (event, gesture) => {
        const startX = event.nativeEvent.pageX - gesture.dx
        return (
          startX <= EDGE_WIDTH &&
          gesture.dx > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4
        )
      },
      onMoveShouldSetPanResponderCapture: (event, gesture) => {
        const startX = event.nativeEvent.pageX - gesture.dx
        return (
          startX <= EDGE_WIDTH &&
          gesture.dx > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4
        )
      },
      onPanResponderMove: (_event, gesture) => {
        setDragX(Math.max(0, gesture.dx))
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > width * DISMISS_RATIO || gesture.vx > DISMISS_VELOCITY) {
          pop()
          return
        }
        setDragX(0)
      },
      onPanResponderTerminate: () => {
        setDragX(0)
      },
      onPanResponderTerminationRequest: () => false,
    })
  }, [active, router, width])

  if (!active || !panResponder) {
    return <View style={styles.fill}>{children}</View>
  }

  return (
    <View style={styles.fill} {...panResponder.panHandlers}>
      <View style={[styles.fill, { transform: [{ translateX: dragX }] }]}>
        <View
          style={[
            styles.shade,
            styles.passThrough,
            { opacity: Math.min(dragX / Math.max(width, 1), 1) * 0.28 },
          ]}
        />
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
  passThrough: {
    pointerEvents: 'none',
  },
})
