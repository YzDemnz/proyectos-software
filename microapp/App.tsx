import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FreeDashboardScreen } from './src/screens/FreeDashboardScreen';
import { IntroScreen } from './src/screens/IntroScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OnboardingFlowScreen } from './src/screens/OnboardingFlowScreen';
import { api } from './src/services/api';
import { appFontAssets } from './src/theme/typography';
import type { Product } from './src/types';

type AppRoute = 'login' | 'setup' | 'dashboard';

export default function App() {
  const [fontsLoaded] = useFonts(appFontAssets);
  const [showIntro, setShowIntro] = useState(true);
  const [route, setRoute] = useState<AppRoute>('login');
  const [businessName, setBusinessName] = useState('');
  const [businessGiro, setBusinessGiro] = useState('General');
  const [businessLogoUri, setBusinessLogoUri] = useState('');
  const [products, setProducts] = useState<Product[]>([]);

  const openExistingAccount = async () => {
    try {
      const data = await api.bootstrap();
      setBusinessName(data.businessProfile.name);
      setBusinessGiro(data.businessProfile.giro);
      setBusinessLogoUri(data.businessProfile.logoUri);
      setProducts(data.products);
    } catch {
      setBusinessName('Mi negocio');
      setBusinessGiro('General');
      setBusinessLogoUri('');
      setProducts([]);
    }

    setRoute('dashboard');
  };

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style={showIntro ? 'light' : 'dark'} />
      {!showIntro && route === 'login' && (
        <LoginScreen
          onCreateAccountPress={() => setRoute('setup')}
          onLoginPress={() => void openExistingAccount()}
          visible
        />
      )}
      {!showIntro && route === 'setup' && (
        <OnboardingFlowScreen
          initialName={businessName}
          onContinue={({ giro, logoUri, name, starterProducts }) => {
            setBusinessName(name);
            setBusinessGiro(giro);
            setBusinessLogoUri(logoUri);
            setProducts(starterProducts);
            setRoute('dashboard');
          }}
        />
      )}
      {!showIntro && route === 'dashboard' && (
        <FreeDashboardScreen
          initialGiro={businessGiro}
          initialLogoUri={businessLogoUri}
          businessName={businessName || 'Mi negocio'}
          initialProducts={products}
        />
      )}
      {showIntro && <IntroScreen onFinished={() => setShowIntro(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0C',
  },
});
