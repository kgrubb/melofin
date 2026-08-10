import { useMemo, type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'

/**
 * Web-only left-edge back. Android/iOS use the native stack gesture
 * (custom PanResponder was fighting it and snapping before the pop).
 */
export const EdgeBackGesture = ({
  children,
  enabled = true,
}: {
  readonly children: ReactNode
  readonly enabled?: boolean
}) => {
  const router = useRouter()
  const active = Platform.OS === 'web' && enabled

  const handlers = useMemo(() => {
    if (!active) return null
    const gesture = { startX: 0, dragging: false }
    return {
      onTouchStart: (e: { nativeEvent: { pageX: number } }) => {
        gesture.startX = e.nativeEvent.pageX
        gesture.dragging = gesture.startX <= 28
      },
      onTouchEnd: (e: { nativeEvent: { pageX: number } }) => {
        if (!gesture.dragging) return
        gesture.dragging = false
        if (e.nativeEvent.pageX - gesture.startX > 72 && router.canGoBack()) {
          router.back()
        }
      },
      onTouchCancel: () => {
        gesture.dragging = false
      },
    }
  }, [active, router])

  if (!active || !handlers) {
    return <View style={styles.fill}>{children}</View>
  }

  return (
    <View style={styles.fill} {...handlers}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
})
