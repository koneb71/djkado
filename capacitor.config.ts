import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.djkado.app',
  appName: 'DJKado',
  webDir: 'dist',
  // Served from https://localhost inside the WebView → secure context (AudioWorklet, WASM, IndexedDB all OK)
  server: { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0b0d10',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#0b0d10', showSpinner: false, androidScaleType: 'CENTER_CROP' },
    StatusBar: { style: 'DARK', backgroundColor: '#0b0d10', overlaysWebView: false },
  },
};

export default config;
