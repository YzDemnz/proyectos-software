import { useEffect, useRef, type ComponentType } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BarChart3,
  BriefcaseBusiness,
  PackageCheck,
  ShieldCheck,
  UserRound,
  Zap,
  type LucideProps,
} from 'lucide-react-native';

import { appFonts } from '../theme/typography';

type IconComponent = ComponentType<LucideProps>;

type LoginScreenProps = {
  onCreateAccountPress: () => void;
  onLoginPress: () => void;
  visible: boolean;
};

const benefits: Array<{
  icon: IconComponent;
  tone: 'blue' | 'green' | 'violet';
  title: string;
  text: string;
}> = [
  {
    icon: Zap,
    tone: 'blue',
    title: 'Registra ventas en segundos',
    text: 'Crea tickets y cobra facil desde tu celular.',
  },
  {
    icon: PackageCheck,
    tone: 'green',
    title: 'Evita quedarte sin productos',
    text: 'Lleva el control de tu inventario y stock bajo.',
  },
  {
    icon: UserRound,
    tone: 'violet',
    title: 'Recuerda quien te debe',
    text: 'Controla tus fiados y da seguimiento a tus clientes.',
  },
];

export function LoginScreen({
  onCreateAccountPress,
  onLoginPress,
  visible,
}: LoginScreenProps) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      entrance.setValue(0);
      return;
    }

    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      delay: 80,
      useNativeDriver: true,
    }).start();
  }, [entrance, visible]);

  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.shell,
            {
              opacity: entrance,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.brandBlock}>
            <View style={styles.logoMark}>
              <BriefcaseBusiness size={30} color="#FFFFFF" strokeWidth={2.6} />
              <View style={styles.logoBars}>
                <BarChart3 size={19} color="#FFFFFF" strokeWidth={3} />
              </View>
            </View>
            <View>
              <Text style={styles.brandName}>MicroApp</Text>
              <Text style={styles.brandAccent}>al Dia</Text>
            </View>
          </View>

          <Text style={styles.headline}>
            Controla ventas, inventario y fiados desde tu celular
          </Text>

          <View style={styles.benefitStack}>
            {benefits.map((benefit) => (
              <BenefitCard key={benefit.title} {...benefit} />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onCreateAccountPress}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Empezar gratis</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onLoginPress}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Ya tengo cuenta</Text>
          </Pressable>

          <View style={styles.footerRow}>
            <ShieldCheck size={15} color="#667085" strokeWidth={2.3} />
            <Text style={styles.footerText}>
              Tus datos estan seguros con nosotros
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BenefitCard({
  icon: Icon,
  text,
  title,
  tone,
}: {
  icon: IconComponent;
  text: string;
  title: string;
  tone: 'blue' | 'green' | 'violet';
}) {
  return (
    <View style={styles.benefitCard}>
      <View style={[styles.benefitIcon, styles[`${tone}Icon`]]}>
        <Icon
          size={28}
          color={
            tone === 'blue' ? '#075CFF' : tone === 'green' ? '#129A46' : '#4237FF'
          }
          strokeWidth={2.7}
        />
      </View>
      <View style={styles.benefitCopy}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 30,
  },
  shell: {
    alignSelf: 'center',
    maxWidth: 430,
    width: '100%',
  },
  brandBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 26,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#075CFF',
    borderRadius: 8,
    height: 58,
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#075CFF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    width: 58,
  },
  logoBars: {
    bottom: 10,
    position: 'absolute',
    right: 8,
  },
  brandName: {
    color: '#071344',
    fontSize: 27,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    lineHeight: 29,
  },
  brandAccent: {
    color: '#075CFF',
    fontSize: 25,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    lineHeight: 27,
  },
  headline: {
    alignSelf: 'center',
    color: '#071344',
    fontSize: 20,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    lineHeight: 27,
    maxWidth: 360,
    textAlign: 'center',
  },
  benefitStack: {
    gap: 12,
    marginTop: 28,
  },
  benefitCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 112,
    paddingHorizontal: 18,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
  },
  benefitIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    marginRight: 18,
    width: 56,
  },
  blueIcon: {
    backgroundColor: '#EAF1FF',
  },
  greenIcon: {
    backgroundColor: '#EAF8EF',
  },
  violetIcon: {
    backgroundColor: '#F0EEFF',
  },
  benefitCopy: {
    flex: 1,
  },
  benefitTitle: {
    color: '#071344',
    fontSize: 15,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    lineHeight: 19,
  },
  benefitText: {
    color: '#475467',
    fontSize: 13,
    fontFamily: appFonts.regular,
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 8,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#075CFF',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 36,
    minHeight: 58,
    shadowColor: '#075CFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 56,
  },
  secondaryButtonText: {
    color: '#075CFF',
    fontSize: 15,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 25,
  },
  footerText: {
    color: '#667085',
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    marginLeft: 7,
  },
  pressed: {
    opacity: 0.72,
  },
});
