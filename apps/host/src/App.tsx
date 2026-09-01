import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {Button} from './components/Button';
import {DevToolsPanel} from './components/DevToolsPanel';
import {ErrorBoundary} from './components/ErrorBoundary';
import {Header} from './components/Header';
import {WeeklyGoals, MoodCard} from './components/HostCards';
import {Placeholder} from './components/Placeholder';
import {SourceOverlay} from './components/SourceOverlay';
import {Toast, UpdateBar} from './components/Toast';
import {findEntry} from './lib/cacheStatus';
import ZephyrNativeCache, {
  useCacheStatus,
} from 'zephyr-native-cache';

// Keep every remote behind a render-time boundary so the local shell can start.
// @ts-ignore
const StatsCard = React.lazy(() => import('mini/StatsCard'));
// @ts-ignore
const DeployCard = React.lazy(() => import('mini/DeployCard'));
// @ts-ignore
const CalorieCard = React.lazy(() => import('mini/CalorieCard'));

// @ts-ignore
const ActivityFeed = React.lazy(() => import('nestedMini/ActivityFeed'));
// @ts-ignore
const CacheInfo = React.lazy(() => import('nestedMini/CacheInfo'));
// @ts-ignore
const HydrationCard = React.lazy(() => import('nestedMini/HydrationCard'));

function App(): React.JSX.Element {
  const {status, latestUpdateEvent} = useCacheStatus();
  const {width, fontScale} = useWindowDimensions();
  const [showSources, setShowSources] = useState(false);
  const [devToolsExpanded, setDevToolsExpanded] = useState(false);
  const [showCalorie, setShowCalorie] = useState(false);
  const [showHydration, setShowHydration] = useState(false);
  const [toastExpanded, setToastExpanded] = useState(false);

  const hasUpdate = !!latestUpdateEvent;

  useEffect(() => {
    if (hasUpdate) setToastExpanded(true);
  }, [hasUpdate]);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const handleCheckUpdates = useCallback(() => {
    ZephyrNativeCache.checkForUpdates().catch(error => {
      if (__DEV__) console.warn('[cache] Failed to check for updates', error);
    });
  }, []);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear downloaded modules?',
      'This removes all cached modules. A network connection may be required after restart.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear cache',
          style: 'destructive',
          onPress: () => {
            ZephyrNativeCache.clearCache().catch(error => {
              if (__DEV__) console.warn('[cache] Failed to clear cache', error);
            });
          },
        },
      ],
    );
  }, []);

  const handleRestart = useCallback(() => {
    ZephyrNativeCache.reloadApp();
  }, []);

  const handleToggleSources = useCallback(() => {
    setShowSources(prev => !prev);
  }, []);

  const handleToggleDevTools = useCallback(() => {
    setDevToolsExpanded(prev => {
      Animated.timing(backdropOpacity, {
        toValue: prev ? 0 : 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
      return !prev;
    });
  }, [backdropOpacity]);

  const triggerOnDemandLoad = (setter: (v: boolean) => void) => () => setter(true);

  const statsEntry = findEntry(status.remotes, 'StatsCard');
  const deployEntry = findEntry(status.remotes, 'DeployCard');
  const calorieEntry = findEntry(status.remotes, 'CalorieCard');
  const feedEntry = findEntry(status.remotes, 'ActivityFeed');
  const cacheEntry = findEntry(status.remotes, 'CacheInfo');
  const hydrationEntry = findEntry(status.remotes, 'HydrationCard');

  return (
    <View style={styles.root} testID="app-shell">
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <Header />
      <View style={styles.demoNotice} testID="demo-notice">
        <Text style={styles.demoNoticeText}>
          Fictional sample data for demonstration only. Not medical advice or health monitoring.
        </Text>
      </View>
      <SafeAreaView style={styles.safeArea}>
        <UpdateBar
          visible={hasUpdate && !toastExpanded}
          onRestart={handleRestart}
          onExpand={() => setToastExpanded(true)}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}>
          <View
            style={[
              styles.grid,
              (width < 600 || fontScale > 1.2) && styles.gridSingleColumn,
            ]}>
            {/* Left column */}
            <View style={styles.column}>
              <View style={styles.cardSlot}>
                <ErrorBoundary name="StatsCard" onRetry={handleRestart}>
                  <React.Suspense fallback={<Placeholder height={150} />}>
                    <StatsCard />
                  </React.Suspense>
                </ErrorBoundary>
                {showSources && (
                  <SourceOverlay
                    name="StatsCard"
                    origin="mini"
                    entry={statsEntry}
                    loading="lazy"
                  />
                )}
              </View>
              <View style={styles.cardSlot}>
                <ErrorBoundary name="CacheInfo" onRetry={handleRestart}>
                  <React.Suspense fallback={<Placeholder height={200} />}>
                    <CacheInfo />
                  </React.Suspense>
                </ErrorBoundary>
                {showSources && (
                  <SourceOverlay
                    name="CacheInfo"
                    origin="nestedMini"
                    entry={cacheEntry}
                    loading="lazy"
                  />
                )}
              </View>
              <View style={styles.cardSlot}>
                {showCalorie ? (
                  <ErrorBoundary name="CalorieCard" onRetry={handleRestart}>
                    <React.Suspense fallback={<Placeholder height={195} />}>
                      <CalorieCard />
                    </React.Suspense>
                  </ErrorBoundary>
                ) : (
                  <Button
                    style={styles.loadButton}
                    accessibilityLabel="Load sample nutrition card"
                    testID="load-nutrition"
                    onPress={triggerOnDemandLoad(setShowCalorie)}>
                    <Text style={styles.loadButtonText}>Load Nutrition</Text>
                    <Text style={styles.loadButtonHint}>on-demand</Text>
                  </Button>
                )}
                {showSources && (
                  <SourceOverlay
                    name="CalorieCard"
                    origin="mini"
                    entry={calorieEntry}
                    loading="on-demand"
                  />
                )}
              </View>
              <View style={styles.cardSlot}>
                <MoodCard />
                {showSources && (
                  <SourceOverlay name="MoodCard" origin="host" />
                )}
              </View>
            </View>
            {/* Right column */}
            <View style={styles.column}>
              <View style={styles.cardSlot}>
                <ErrorBoundary name="ActivityFeed" onRetry={handleRestart}>
                  <React.Suspense fallback={<Placeholder height={180} />}>
                    <ActivityFeed />
                  </React.Suspense>
                </ErrorBoundary>
                {showSources && (
                  <SourceOverlay
                    name="ActivityFeed"
                    origin="nestedMini"
                    entry={feedEntry}
                    loading="lazy"
                  />
                )}
              </View>
              <View style={styles.cardSlot}>
                <ErrorBoundary name="DeployCard" onRetry={handleRestart}>
                  <React.Suspense fallback={<Placeholder height={170} />}>
                    <DeployCard />
                  </React.Suspense>
                </ErrorBoundary>
                {showSources && (
                  <SourceOverlay
                    name="DeployCard"
                    origin="mini"
                    entry={deployEntry}
                    loading="lazy"
                  />
                )}
              </View>
              <View style={styles.cardSlot}>
                <WeeklyGoals />
                {showSources && (
                  <SourceOverlay name="WeeklyGoals" origin="host" />
                )}
              </View>
              <View style={styles.cardSlot}>
                {showHydration ? (
                  <ErrorBoundary name="HydrationCard" onRetry={handleRestart}>
                    <React.Suspense fallback={<Placeholder height={150} />}>
                      <HydrationCard />
                    </React.Suspense>
                  </ErrorBoundary>
                ) : (
                  <Button
                    style={styles.loadButton}
                    accessibilityLabel="Load sample hydration card"
                    testID="load-hydration"
                    onPress={triggerOnDemandLoad(setShowHydration)}>
                    <Text style={styles.loadButtonText}>Load Hydration</Text>
                    <Text style={styles.loadButtonHint}>on-demand</Text>
                  </Button>
                )}
                {showSources && (
                  <SourceOverlay
                    name="HydrationCard"
                    origin="nestedMini"
                    entry={hydrationEntry}
                    loading="on-demand"
                  />
                )}
              </View>
            </View>
          </View>
        </ScrollView>
        <Animated.View
          pointerEvents={devToolsExpanded ? 'auto' : 'none'}
          style={[styles.backdrop, {opacity: backdropOpacity}]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close module diagnostics"
            accessibilityRole="button"
            onPress={handleToggleDevTools}
          />
        </Animated.View>
      </SafeAreaView>
      <Toast
        visible={toastExpanded}
        onRestart={handleRestart}
        onDismiss={() => setToastExpanded(false)}
      />
      <DevToolsPanel
        status={status}
        pollIntervalMs={status.pollIntervalMs}
        lastPollAt={status.lastPollAt}
        showSources={showSources}
        expanded={devToolsExpanded}
        onToggleExpanded={handleToggleDevTools}
        onCheckUpdates={handleCheckUpdates}
        onClearCache={handleClearCache}
        onToggleSources={handleToggleSources}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
  },
  gridSingleColumn: {
    flexDirection: 'column',
  },
  column: {
    flex: 1,
    gap: 8,
  },
  cardSlot: {
    position: 'relative',
  },
  demoNotice: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.2)',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  demoNoticeText: {
    color: '#c4b5fd',
    fontSize: 12,
    lineHeight: 17,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1,
  },
  loadButton: {
    backgroundColor: '#0f0f13',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderStyle: 'dashed' as const,
    padding: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  loadButtonText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  loadButtonHint: {
    color: '#4b5563',
    fontSize: 10,
    marginTop: 4,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});

export default App;
