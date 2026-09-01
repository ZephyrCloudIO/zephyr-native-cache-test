import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function Button({style, children, onPress, disabled, ...rest}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{disabled: !!disabled}}
      style={{flex: StyleSheet.flatten(style)?.flex as number | undefined}}
      {...rest}>
      <View pointerEvents="none" style={[style, disabled && disabledStyle.view]}>
        {children}
      </View>
    </Pressable>
  );
}

const disabledStyle = StyleSheet.create({
  view: {
    opacity: 0.4,
  },
});
