import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Platform, Pressable, StyleSheet, Text, View} from 'react-native';

import {Button} from './Button';

// --- Mini update bar (inline, sticky at top) ---

interface UpdateBarProps {
  visible: boolean;
  onRestart: () => void;
  onExpand: () => void;
}

export function UpdateBar({visible, onRestart, onExpand}: UpdateBarProps) {
  const height = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(height, {
        toValue: visible ? 40 : 0,
        duration: 300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [visible, height, opacity]);

  return (
    <Animated.View style={[barStyles.container, {height, opacity}]} testID="update-bar">
      <Button onPress={onExpand} style={barStyles.content}>
        <View style={barStyles.dot} />
        <Text style={[barStyles.text, barStyles.mono]}>Update available</Text>
        <Button onPress={onRestart} style={barStyles.button} testID="update-bar-restart">
          <Text style={[barStyles.buttonText, barStyles.mono]}>Restart</Text>
        </Button>
      </Button>
    </Animated.View>
  );
}

const barStyles = StyleSheet.create({
  container: {
    backgroundColor: '#0f0f13',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.2)',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8b5cf6',
    marginRight: 10,
  },
  text: {
    color: '#d4d4d8',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  button: {
    backgroundColor: '#8b5cf6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  mono: {
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});

// --- Expanded toast overlay ---

interface ToastProps {
  visible: boolean;
  onRestart: () => void;
  onDismiss: () => void;
}

export function Toast({visible, onRestart, onDismiss}: ToastProps) {
  const translateY = useRef(new Animated.Value(-300)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -300,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible, mounted, translateY, backdropOpacity]);

  if (!mounted) return null;

  return (
    <View style={toastStyles.root} pointerEvents="box-none">
      <Animated.View
        style={[toastStyles.backdrop, {opacity: backdropOpacity}]}
        pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>
      <Animated.View style={[toastStyles.card, {transform: [{translateY}]}]} testID="update-toast">
        <View style={toastStyles.content}>
          <View style={toastStyles.iconContainer}>
            <Text style={toastStyles.icon}>↓</Text>
          </View>
          <View style={toastStyles.textContent}>
            <Text style={[toastStyles.headline, toastStyles.mono]}>
              Update available
            </Text>
            <Text style={toastStyles.body}>
              Restart the app to see the newest changes
            </Text>
          </View>
        </View>
        <View style={toastStyles.actions}>
          <Button onPress={onDismiss} style={toastStyles.secondaryButton} testID="update-toast-dismiss">
            <Text style={toastStyles.secondaryText}>Later</Text>
          </Button>
          <Button onPress={onRestart} style={toastStyles.primaryButton} testID="update-toast-restart">
            <Text style={toastStyles.primaryText}>Restart</Text>
          </Button>
        </View>
      </Animated.View>
    </View>
  );
}

const toastStyles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    backgroundColor: '#0f0f13',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    color: '#8b5cf6',
    fontSize: 20,
    fontWeight: '700',
  },
  textContent: {
    flex: 1,
  },
  headline: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  mono: {
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
});
