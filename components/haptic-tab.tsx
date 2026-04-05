import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const SPRING_CONFIG = {
  damping: 10,
  stiffness: 400,
  mass: 0.4,
  overshootClamping: false,
};

export function HapticTab(props: BottomTabBarButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      style={[props.style as any, { alignItems: 'center', justifyContent: 'center' }]}
      accessibilityRole={props.accessibilityRole}
      accessibilityState={props.accessibilityState}
      testID={props.testID}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      onPressIn={(ev) => {
        scale.value = withSpring(0.82, SPRING_CONFIG);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        props.onPressIn?.(ev);
      }}
      onPressOut={(ev) => {
        scale.value = withSpring(1, SPRING_CONFIG);
        props.onPressOut?.(ev);
      }}
    >
      <Animated.View style={animatedStyle}>
        {props.children}
      </Animated.View>
    </Pressable>
  );
}
