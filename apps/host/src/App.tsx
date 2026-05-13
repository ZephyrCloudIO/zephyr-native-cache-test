import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from './components/Button';
import {DevToolsPanel} from './components/DevToolsPanel';
import {ErrorBoundary} from './components/ErrorBoundary';
import {Header} from './components/Header';
import {WeeklyGoals, MoodCard} from './components/HostCards';
import {Placeholder} from './components/Placeholder';
import {SourceOverlay} from './components/SourceOverlay';
import {Tappable} from './components/Tappable';
import {Toast, UpdateBar} from './components/Toast';
import {useNetworkStatus} from './hooks/useNetworkStatus';
import {ZephyrNativeCache, type CacheStatusRemoteEntry} from 'zephyr-native-cache';
import {useCacheStatus} from 'zephyr-native-cache/react';

// mini remote — StatsCard eager, rest lazy
// @ts-ignore
import StatsCard, {VERSION as statsCardVersion} from 'mini/StatsCard';
// @ts-ignore
const DeployCard = React.lazy(() => import('mini/DeployCard'));
// @ts-ignore
const CalorieCard = React.lazy(() => import('mini/CalorieCard'));

// nestedMini remote — ActivityFeed eager, rest lazy
// @ts-ignore
import ActivityFeed, {VERSION as activityFeedVersion} from 'nestedMini/ActivityFeed';
// @ts-ignore
const CacheInfo = React.lazy(() => import('nestedMini/CacheInfo'));
// @ts-ignore
const HydrationCard = React.lazy(() => import('nestedMini/HydrationCard'));

function findEntry(
  remotes: Record<string, CacheStatusRemoteEntry>,
  name: string,
): CacheStatusRemoteEntry | undefined {
  return (
    remotes[name] ??
    Object.values(remotes).find(
      e => e.remoteName.endsWith('/' + name) || e.remoteName === name,
    )
  );
}

function App(): React.JSX.Element {
  const {status, latestUpdateEvent} = useCacheStatus();
  const {isOnline} = useNetworkStatus();
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
  const appOpacity = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
      Animated.timing(appOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 100);
    return () => clearTimeout(timer);
  }, [appOpacity]);

  const handleCheckUpdates = useCallback(() => {
    ZephyrNativeCache.checkForUpdates().catch(error => {
      console.warn('[cache] Failed to check for updates', error);
    });
  }, []);

  const handleClearCache = useCallback(() => {
    ZephyrNativeCache.clearCache().catch(error => {
      console.warn('[cache] Failed to clear cache', error);
    });
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

  const triggerOnDemandLoad = (setter: (v: boolean) => void) => () => {
    LayoutAnimation.configureNext({
      duration: 300,
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.8,
      },
      create: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.8,
        property: LayoutAnimation.Properties.scaleY,
      },
    });
    setter(true);
  };

  const statsEntry = findEntry(status.remotes, 'StatsCard');
  const deployEntry = findEntry(status.remotes, 'DeployCard');
  const calorieEntry = findEntry(status.remotes, 'CalorieCard');
  const feedEntry = findEntry(status.remotes, 'ActivityFeed');
  const cacheEntry = findEntry(status.remotes, 'CacheInfo');
  const hydrationEntry = findEntry(status.remotes, 'HydrationCard');

  if (!ready) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.root, {opacity: appOpacity}]}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <Header />
      <SafeAreaView style={styles.safeArea}>
        <UpdateBar
          visible={hasUpdate && !toastExpanded}
          onRestart={handleRestart}
          onExpand={() => setToastExpanded(true)}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.grid}>
            {/* Left column */}
            <View style={styles.column}>
              <Tappable>
                <ErrorBoundary name="StatsCard">
                  <StatsCard />
                </ErrorBoundary>
                {showSources && (
                  <SourceOverlay
                    name="StatsCard"
                    origin="mini"
                    entry={statsEntry}
                    loading="eager"
                    version={statsCardVersion}
                  />
                )}
              </Tappable>
              <Tappable>
                <ErrorBoundary name="CacheInfo">
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
              </Tappable>
              <Tappable>
                {showCalorie ? (
                  <ErrorBoundary name="CalorieCard">
                    <React.Suspense fallback={<Placeholder height={195} />}>
                      <CalorieCard />
                    </React.Suspense>
                  </ErrorBoundary>
                ) : (
                  <Button
                    style={styles.loadButton}
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
              </Tappable>
              <Tappable>
                <MoodCard />
                {showSources && (
                  <SourceOverlay name="MoodCard" origin="host" />
                )}
              </Tappable>
            </View>
            {/* Right column */}
            <View style={styles.column}>
              <Tappable>
                <ErrorBoundary name="ActivityFeed">
                  <ActivityFeed />
                </ErrorBoundary>
                {showSources && (
                  <SourceOverlay
                    name="ActivityFeed"
                    origin="nestedMini"
                    entry={feedEntry}
                    loading="eager"
                    version={activityFeedVersion}
                  />
                )}
              </Tappable>
              <Tappable>
                <ErrorBoundary name="DeployCard">
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
              </Tappable>
              <Tappable>
                <WeeklyGoals />
                {showSources && (
                  <SourceOverlay name="WeeklyGoals" origin="host" />
                )}
              </Tappable>
              <Tappable>
                {showHydration ? (
                  <ErrorBoundary name="HydrationCard">
                    <React.Suspense fallback={<Placeholder height={150} />}>
                      <HydrationCard />
                    </React.Suspense>
                  </ErrorBoundary>
                ) : (
                  <Button
                    style={styles.loadButton}
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
              </Tappable>
            </View>
          </View>
        </ScrollView>
        <Animated.View
          pointerEvents={devToolsExpanded ? 'auto' : 'none'}
          style={[styles.backdrop, {opacity: backdropOpacity}]}>
          <Pressable
            style={StyleSheet.absoluteFill}
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
        isOnline={isOnline}
        pollIntervalMs={status.pollIntervalMs}
        lastPollAt={status.lastPollAt}
        showSources={showSources}
        expanded={devToolsExpanded}
        onToggleExpanded={handleToggleDevTools}
        onCheckUpdates={handleCheckUpdates}
        onClearCache={handleClearCache}
        onToggleSources={handleToggleSources}
      />
    </Animated.View>
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
  column: {
    flex: 1,
    gap: 8,
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
