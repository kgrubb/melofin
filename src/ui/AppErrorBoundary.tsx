import { Component, type ErrorInfo, type ReactNode } from 'react'
import { StyleSheet, Text } from 'react-native'
import { logger } from '@/src/logging/logger'
import i18n from '@/src/i18n'
import { Atmosphere } from '@/src/theme/Atmosphere'
import { colors, spacing } from '@/src/theme/tokens'
import { PrimaryButton } from '@/src/ui/primitives'

type Props = {
  readonly children: ReactNode
  readonly fallbackTitle?: string
}

type State = {
  readonly hasError: boolean
  readonly message: string
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('render crash', { message: error.message, info })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <Atmosphere style={styles.wrap}>
        <Text style={styles.title}>
          {this.props.fallbackTitle ?? i18n.t('common.somethingWentWrong')}
        </Text>
        <Text style={styles.message}>{this.state.message}</Text>
        <PrimaryButton
          label={i18n.t('common.reset')}
          onPress={() => this.setState({ hasError: false, message: '' })}
        />
      </Atmosphere>
    )
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
