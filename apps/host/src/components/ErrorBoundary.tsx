import React from 'react';
import {Platform, StyleSheet, Text, View} from 'react-native';
import {Button} from './Button';

interface Props {
  name: string;
  children: React.ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {hasError: false, error: null};

  static getDerivedStateFromError(error: Error): State {
    return {hasError: true, error};
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.card} testID={`error-${this.props.name}`}>
          <View style={styles.header}>
            <Text style={styles.icon}>!</Text>
            <View style={styles.headerText}>
              <Text style={styles.title}>Sample card unavailable</Text>
              <Text style={[styles.name, styles.mono]}>{this.props.name}</Text>
            </View>
          </View>
          {__DEV__ && this.state.error && (
            <Text style={[styles.message, styles.mono]} numberOfLines={3}>
              {this.state.error.message}
            </Text>
          )}
          {this.props.onRetry && (
            <Button
              style={styles.retry}
              accessibilityLabel={`Retry ${this.props.name}`}
              onPress={this.props.onRetry}>
              <Text style={styles.retryText}>Restart and retry</Text>
            </Button>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f0f13',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    overflow: 'hidden',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  name: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 1,
  },
  message: {
    color: '#4b5563',
    fontSize: 10,
    marginTop: 10,
    lineHeight: 14,
  },
  retry: {
    minHeight: 44,
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: '600',
  },
  mono: {
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});
