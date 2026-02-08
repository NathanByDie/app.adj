# Guía Completa para Exportar a Android con Capacitor

Esta guía detalla todos los pasos necesarios para convertir esta aplicación web en una aplicación nativa de Android, asegurando que todas las funcionalidades como Firebase, notificaciones push, gestos, y deep linking funcionen correctamente.

## 1. ¿Cómo funciona Capacitor? (La Magia Explicada)

Capacitor no "convierte" tu código React a código nativo. En su lugar, empaqueta tu aplicación web compilada (los archivos HTML, CSS y JavaScript de la carpeta `dist`) dentro de un proyecto nativo de Android. Este proyecto nativo contiene una **WebView** (un navegador a pantalla completa) que carga tu aplicación.

Las funcionalidades nativas (cámara, notificaciones, vibración) se logran a través de **Plugins de Capacitor**. Estos son puentes que permiten a tu código JavaScript (que corre en la WebView) llamar a APIs nativas de Android. Por lo tanto, todo tu código actual (`hooks`, `services`, gestos) funcionará tal cual, ya que se ejecuta en un entorno web moderno.

## 2. Requisitos Previos

Asegúrate de tener instalado lo siguiente en tu sistema:
- **Node.js y npm:** Esenciales para gestionar las dependencias del proyecto.
- **Android Studio:** El entorno de desarrollo oficial para Android.
- **Firebase CLI:** Si planeas desplegar las Cloud Functions. (`npm install -g firebase-tools`)

## 3. Instalación de Dependencias Nativas

Para que las funciones nativas de la app funcionen, necesitamos instalar los plugins de Capacitor correspondientes.

```bash
# Instala las herramientas principales de Capacitor y la plataforma Android
npm install @capacitor/core @capacitor/cli @capacitor/android

# Instala los plugins para las funcionalidades de la app
npm install @capacitor/push-notifications @capacitor/haptics @capacitor/keyboard @capacitor/status-bar

# Instala una herramienta para generar iconos y splash screens (opcional pero recomendado)
npm install -D @capacitor/assets
```
- `@capacitor/push-notifications`: Para recibir notificaciones push nativas.
- `@capacitor/haptics`: Para una vibración y retroalimentación táctil superior a la del navegador.
- `@capacitor/keyboard` y `@capacitor/status-bar`: Para un mejor control sobre el teclado y la barra de estado, dando una sensación más nativa.

## 4. Configuración del Proyecto Capacitor

El archivo `capacitor.config.ts` es el centro de control. Ya está configurado en el proyecto, pero es importante entender sus partes:

- `appId`: Identificador único de tu app (importante para la Play Store).
- `appName`: Nombre de la app.
- `webDir: 'dist'`: Indica a Capacitor que tu código web compilado está en la carpeta `dist`.
- `server.hostname`: **Crucial para el Deep Linking**. Permite que los enlaces a `adjstd.netlify.app` abran tu aplicación.

## 5. Creación y Sincronización del Proyecto Android

Este es el proceso central para generar y actualizar tu proyecto de Android.

1.  **Construir la Aplicación Web:**
    Cada vez que hagas cambios en el código, debes generar la versión de producción.
    ```bash
    npm run build
    ```

2.  **Añadir la Plataforma Android (solo la primera vez):**
    Este comando crea la carpeta `/android` con el proyecto de Android Studio.
    ```bash
    npx cap add android
    ```

3.  **Sincronizar Cambios (el paso más importante):**
    Este comando actualiza el proyecto de Android con tu código web más reciente y configura los plugins.
    ```bash
    npx cap sync
    ```
    `sync` hace varias cosas importantes:
    - Copia el contenido de la carpeta `dist` a la carpeta `android`.
    - Lee los plugins que instalaste y modifica el `AndroidManifest.xml` y otros archivos de configuración nativos para añadir los permisos y configuraciones necesarios.

## 6. Configuración Específica de Android

Después de sincronizar, hay algunos pasos manuales clave:

1.  **Configurar Firebase:**
    Copia el archivo `google-services.json` que está en la raíz de tu proyecto a la carpeta `android/app/`. Android Studio necesita este archivo para conectar la app con tu proyecto de Firebase.

2.  **Verificar Permisos en `AndroidManifest.xml`:**
    Abre el archivo `android/app/src/main/AndroidManifest.xml`. El comando `sync` ya debería haber añadido la mayoría de permisos, pero es bueno verificar:
    - **Internet:** `<uses-permission android:name="android.permission.INTERNET" />` (básico).
    - **Vibración:** `<uses-permission android:name="android.permission.VIBRATE" />` (añadido por el plugin Haptics).
    - **Micrófono:** La app usa `getUserMedia` para grabar audio. Asegúrate de que este permiso esté presente:
      ```xml
      <uses-permission android:name="android.permission.RECORD_AUDIO" />
      <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
      ```
    - **Notificaciones Push:** El plugin de Push Notifications se encarga de sus permisos.

3.  **Verificar Deep Linking (App Links):**
    Gracias a la configuración de `hostname` en `capacitor.config.ts`, `npx cap sync` debería haber añadido un `<intent-filter>` para manejar los enlaces. Dentro de la etiqueta `<activity>`, verifica que exista algo similar a esto:
    ```xml
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="adjstd.netlify.app" />
    </intent-filter>
    ```

## 7. Generar Iconos y Splash Screen

Para una apariencia profesional, genera los recursos nativos a partir de una imagen fuente.

1.  Crea una imagen de `1024x1024` píxeles (preferiblemente PNG o SVG) y guárdala como `assets/icon.png`.
2.  Ejecuta el siguiente comando:
    ```bash
    npx capacitor-assets generate --iconBackgroundColor '#000000' --splashBackgroundColor '#000000'
    ```
    Esto creará automáticamente los iconos y pantallas de bienvenida en todos los tamaños correctos para Android.

## 8. Abrir y Compilar en Android Studio

1.  **Abrir el Proyecto:**
    ```bash
    npx cap open android
    ```
    Android Studio se abrirá con tu proyecto nativo. Puede que tarde un poco en sincronizar Gradle la primera vez.

2.  **Ejecutar la App:**
    - Selecciona un emulador o conecta tu dispositivo Android.
    - Presiona el botón "Run" (el triángulo verde ▶️).

3.  **Generar un APK:**
    - Ve a `Build` > `Build Bundle(s) / APK(s)` > `Build APK(s)` para un archivo de prueba.
    - Para publicar en la Play Store, ve a `Build` > `Generate Signed Bundle / APK...` y sigue el asistente para crear una firma digital para tu app.

¡Y listo! Siguiendo estos pasos, tendrás una versión nativa de Android completamente funcional de tu aplicación. Recuerda ejecutar `npm run build` y `npx cap sync` cada vez que actualices el código web.
