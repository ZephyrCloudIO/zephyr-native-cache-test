import React, {useRef} from 'react';
import {Animated, Pressable, StyleSheet, Vibration} from 'react-native';

export function Tappable({children}: {children: React.ReactNode}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const onPressIn = () => {
    Vibration.vibrate(5);
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
    Animated.timing(glow, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
    Animated.timing(glow, {
      toValue: 0,
      duration: 400,
      useNativeDriver: false,
    }).start();
  };

  const opacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={{transform: [{scale}]}}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[styles.border, {opacity}]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
});
