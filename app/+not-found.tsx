import { Link, Stack } from 'expo-router'
import { StyleSheet, Text } from 'react-native'
import { Atmosphere } from '@/src/theme/Atmosphere'
import { colors, spacing } from '@/src/theme/tokens'

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Missing' }} />
      <Atmosphere style={styles.container}>
        <Text style={styles.title}>Screen not found</Text>
        <Link href="/" style={styles.link}>
          Go home
        </Link>
      </Atmosphere>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  link: {
    marginTop: spacing.md,
    color: colors.accent,
  },
})
