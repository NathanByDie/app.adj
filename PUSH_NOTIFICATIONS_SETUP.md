
# Guía de Configuración para Notificaciones Push Nativas

Para que las notificaciones push funcionen, necesitas completar dos pasos: instalar las dependencias en tu app cliente (Capacitor) y desplegar la Cloud Function en tu proyecto de Firebase.

## Paso 1: Configurar la App Cliente (Capacitor)

1.  **Instalar el plugin de Notificaciones Push de Capacitor:**
    Abre tu terminal en la raíz del proyecto y ejecuta:
    ```bash
    npm install @capacitor/push-notifications
    ```

2.  **Sincronizar los cambios con la plataforma nativa:**
    Después de instalar el plugin, es crucial sincronizarlo con tu proyecto de Android.
    ```bash
    npx cap sync android
    ```

3.  **Abrir en Android Studio:**
    Abre tu proyecto en Android Studio para asegurarte de que todo se haya sincronizado correctamente.
    ```bash
    npx cap open android
    ```
    Android Studio podría tardar unos minutos en sincronizar Gradle.

## Paso 2: Configurar y Desplegar la Cloud Function

La Cloud Function es el "cerebro" que envía la notificación. Se activa cada vez que se crea un nuevo mensaje en la base de datos.

1.  **Instalar Firebase CLI:**
    Si no lo tienes, instálalo globalmente. Necesitarás Node.js.
    ```bash
    npm install -g firebase-tools
    ```

2.  **Iniciar sesión en Firebase:**
    ```bash
    firebase login
    ```

3.  **Inicializar Firebase Functions en tu proyecto:**
    En la raíz de tu proyecto, ejecuta:
    ```bash
    firebase init functions
    ```
    Sigue los pasos:
    - **Choose a project:** Selecciona `Use an existing project` y elige tu proyecto `adjstudios`.
    - **Language:** Selecciona `JavaScript`.
    - **ESLint:** Puedes decir que sí (`Y`) para capturar posibles errores.
    - **Install dependencies:** Di que sí (`Y`) para instalar las dependencias con npm.

    Esto creará la carpeta `functions` si no existe. Como ya te he proporcionado los archivos, puedes **reemplazar** el `index.js` y `package.json` generados por los que te he dado.

4.  **Navegar a la carpeta `functions` e instalar dependencias:**
    Asegúrate de que las dependencias del `package.json` estén instaladas.
    ```bash
    cd functions
    npm install
    cd .. 
    ```

5.  **Desplegar la función:**
    Desde la raíz de tu proyecto, ejecuta el siguiente comando para subir y activar la función en Firebase:
    ```bash
    firebase deploy --only functions
    ```

¡Y listo! Una vez que el despliegue termine, la función estará activa. La próxima vez que un usuario envíe un mensaje a otro, la función se ejecutará y enviará una notificación push al dispositivo del destinatario.
