import { Link, Stack } from 'expo-router'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Atmosphere } from '@/src/theme/Atmosphere'
import { colors, spacing } from '@/src/theme/tokens'

export default function NotFoundScreen() {
  const { t } = useTranslation()
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <Atmosphere style={styles.container}>
        <Text style={styles.title}>{t('notFound.message')}</Text>
        <Link href="/" style={styles.link}>
          {t('notFound.goHome')}
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
