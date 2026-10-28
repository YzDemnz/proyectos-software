import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { appFonts } from '../theme/typography';

type IntroScreenProps = {
  onFinished: () => void;
};

export function IntroScreen({ onFinished }: IntroScreenProps) {
  const depth = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let handledFinish = false;
    const finishIntro = () => {
      if (!handledFinish) {
        handledFinish = true;
        onFinished();
      }
    };

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(depth, {
          toValue: 1,
          duration: 1900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 1,
          duration: 1720,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1000),
      Animated.parallel([
        Animated.timing(lift, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: 760,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0.18,
          duration: 620,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    const fallbackTimer = setTimeout(finishIntro, 3900);

    animation.start(({ finished }) => {
      if (finished) {
        finishIntro();
      }
    });

    return () => {
      clearTimeout(fallbackTimer);
      animation.stop();
    };
  }, [depth, fade, glow, lift, onFinished]);

  const logoScale = depth.interpolate({
    inputRange: [0, 0.76, 1],
    outputRange: [0.44, 1.14, 1],
  });
  const logoOpacity = depth.interpolate({
    inputRange: [0, 0.22, 1],
    outputRange: [0, 0.68, 1],
  });
  const logoTranslateY = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -210],
  });
  const logoExitScale = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.72],
  });
  const glowScale = depth.interpolate({
    inputRange: [0, 1],
    outputRange: [0.42, 1],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]}>
      <View style={styles.stage}>
        <Animated.View
          style={[
            styles.logoWrap,
            {
              opacity: logoOpacity,
              transform: [
                { translateY: logoTranslateY },
                { scale: logoScale },
                { scale: logoExitScale },
              ],
            },
          ]}
        >
          <Text style={styles.logoText}>MicroApp</Text>
          <Animated.View
            style={[
              styles.neonLine,
              {
                opacity: glow,
                transform: [{ scaleX: glowScale }],
              },
            ]}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: '#000000',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  stage: {
    alignItems: 'center',
    height: 260,
    justifyContent: 'center',
    overflow: 'visible',
    width: '100%',
  },
  neonLine: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    height: 4,
    marginTop: 9,
    maxWidth: 280,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 20,
    width: 178,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 48,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    lineHeight: 58,
    textShadowColor: '#F59E0B',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
});
