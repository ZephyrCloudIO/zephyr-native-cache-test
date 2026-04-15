import React, {useRef} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Vibration,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function Button({style, children, onPress, disabled, ...rest}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Vibration.vibrate(3);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.95,
        useNativeDriver: true,
        tension: 200,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 0.7,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 200,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
      style={{flex: StyleSheet.flatten(style)?.flex as number | undefined}}
      {...rest}>
      <Animated.View
        style={[
          style,
          {transform: [{scale}], opacity},
          disabled && disabledStyle.view,
        ]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const disabledStyle = StyleSheet.create({
  view: {
    opacity: 0.4,
  },
});
