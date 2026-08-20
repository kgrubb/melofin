import { Tabs } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'

export default function TabsLayout() {
  const { t } = useTranslation()
  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="home" options={{ title: t('tabs.home') }} />
        <Tabs.Screen name="search" options={{ title: t('tabs.search') }} />
        <Tabs.Screen name="library" options={{ title: t('tabs.library') }} />
        <Tabs.Screen name="downloads" options={{ title: t('tabs.downloads') }} />
      </Tabs>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
