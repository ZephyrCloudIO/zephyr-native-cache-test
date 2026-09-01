import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ZephyrNativeCache from 'zephyr-native-cache';
import {Button} from './components/Button';
import {Header} from './components/Header';

const TIMEOUT_MS = 8_000;

export default function Fallback() {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container} testID="app-shell">
      <Header />
      <View style={styles.notice} testID="demo-notice">
        <Text style={styles.noticeText}>
          Fictional sample data for demonstration only. Not medical advice or health monitoring.
        </Text>
      </View>
      <View style={styles.content} testID={timedOut ? 'startup-modules-unavailable' : 'startup-loading'}>
        {timedOut ? (
          <>
            <Text style={styles.title}>Sample modules are unavailable</Text>
            <Text style={styles.label}>
              The Zephyr Health shell is ready. Check your connection and retry.
            </Text>
            <Button
              style={styles.retry}
              testID="startup-retry"
              accessibilityLabel="Restart and retry sample modules"
              onPress={() => ZephyrNativeCache.reloadApp()}>
              <Text style={styles.retryText}>Restart and retry</Text>
            </Button>
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color="#8b5cf6" style={styles.spinner} />
            <Text style={styles.label}>Loading sample modules...</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  spinner: {
    marginBottom: 12,
  },
  label: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  title: {
    color: '#f4f4f5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  notice: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  noticeText: {
    color: '#c4b5fd',
    fontSize: 12,
    lineHeight: 17,
  },
  retry: {
    minHeight: 44,
    marginTop: 18,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#6d28d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
