import React from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';

import {Button} from './Button';

// --- Mini update bar (inline, sticky at top) ---

interface UpdateBarProps {
  visible: boolean;
  onRestart: () => void;
  onExpand: () => void;
}

export function UpdateBar({visible, onRestart, onExpand}: UpdateBarProps) {
  if (!visible) return null;

  return (
    <View style={barStyles.container} testID="update-bar">
      <View style={barStyles.content}>
        <Button
          onPress={onExpand}
          style={barStyles.expand}
          accessibilityLabel="Show update details">
          <View style={barStyles.dot} />
          <Text style={[barStyles.text, barStyles.mono]}>Update available</Text>
        </Button>
        <Button
          onPress={onRestart}
          style={barStyles.button}
          accessibilityLabel="Restart to apply module update"
          testID="update-bar-restart">
          <Text style={[barStyles.buttonText, barStyles.mono]}>Restart</Text>
        </Button>
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: {
    minHeight: 44,
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
  expand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
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
    minHeight: 44,
    justifyContent: 'center',
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
  if (!visible) return null;

  return (
    <View
      style={toastStyles.root}
      accessibilityViewIsModal
      pointerEvents="box-none">
      <View style={toastStyles.backdrop}>
        <Pressable
          accessibilityLabel="Dismiss module update"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
        />
      </View>
      <View
        accessibilityLiveRegion="assertive"
        style={toastStyles.card}
        testID="update-toast">
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
      </View>
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
    justifyContent: 'center',
    minHeight: 44,
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
    justifyContent: 'center',
    minHeight: 44,
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
