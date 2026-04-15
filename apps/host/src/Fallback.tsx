import React, {useEffect, useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const DELAY = 500;

export default function Fallback() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut, () =>
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut),
    );

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, DELAY);

    return () => clearTimeout(timer);
  }, [opacity]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, {opacity}]}>
        <ActivityIndicator
          size="small"
          color="#8b5cf6"
          style={styles.spinner}
        />
        <Text style={styles.label}>Initializing modules...</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  spinner: {
    marginBottom: 12,
  },
  label: {
    color: '#6b7280',
    fontSize: 13,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});
