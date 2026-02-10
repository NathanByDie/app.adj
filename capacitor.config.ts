
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.median.android.dyynjol', // ID coincidente con tu assetlinks.json y google-services.json
  appName: 'ADJStudios',
  webDir: 'dist', // Directorio donde se compila tu web (usualmente 'dist' o 'build')
  server: {
    androidScheme: 'https',
    // Permitir navegación clara para desarrollo si es necesario
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    buildOptions: {
      keystorePath: null,
      keystoreAlias: null,
    }
  }
};

export default config;
