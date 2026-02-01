
# Exportar a Android Studio con Capacitor

Para generar la carpeta `/android` y convertir esta aplicación web en una App Nativa, sigue estos pasos en tu terminal:

## 1. Instalar dependencias de Capacitor
Ejecuta el siguiente comando para instalar el núcleo de Capacitor y la plataforma Android:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

## 2. Inicializar Capacitor
Si es la primera vez (y si no existiera el archivo de configuración):

```bash
npx cap init
```

## 3. Construir tu aplicación web
Debes compilar tu código React/TypeScript en archivos HTML/JS/CSS estáticos. Dependiendo de tu "bundler" (Vite, Webpack, etc.), suele ser:

```bash
npm run build
```
*(Asegúrate de que esto genere una carpeta llamada `dist`. Si tu carpeta se llama `build`, cambia `webDir: 'dist'` a `webDir: 'build'` en el archivo `capacitor.config.ts`).*

## 4. Crear la carpeta Android
Este comando creará la carpeta `/android` con todos los archivos de Android Studio basados en tu código web:

```bash
npx cap add android
```

## 5. Sincronizar cambios
Cada vez que hagas cambios en tu código web (`App.tsx`, etc.), debes reconstruir y sincronizar:

```bash
npm run build
npx cap sync
```

## 6. Configuración de Firebase y Google Services
Para que el login de Google y Firebase funcionen:
1. Mueve el archivo `google-services.json` (que ya tienes en la raíz) dentro de la carpeta generada: `android/app/google-services.json`.

## 7. Abrir en Android Studio
Finalmente, para compilar el APK o correr en un emulador:

```bash
npx cap open android
```

---

**Nota sobre Median/OneSignal:**
Al exportar a Android Studio directamente con Capacitor, el plugin "puente" de Median (`window.median`) dejará de funcionar porque ya no estás dentro del contenedor de Median.
Para notificaciones Push nativas en este entorno, deberás instalar el plugin de Capacitor para OneSignal:
`npm install onesignal-cordova-plugin`
