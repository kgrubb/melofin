import { Tabs } from 'expo-router'
import { StyleSheet, View } from 'react-native'

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="search" options={{ title: 'Search' }} />
        <Tabs.Screen name="library" options={{ title: 'Library' }} />
        <Tabs.Screen name="downloads" options={{ title: 'Downloads' }} />
      </Tabs>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
