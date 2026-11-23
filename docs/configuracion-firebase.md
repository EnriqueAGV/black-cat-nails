# Configuración de Firebase (paso a paso)

Guía para conectar la app a un proyecto propio de Firebase y reproducir la entrega. Ver también la sección "Cómo ejecutar" del [README](../README.md).

Tiempo estimado: 20 a 30 minutos. Todo se hace en https://console.firebase.google.com y en una terminal dentro de la carpeta del repo.

## 0. Bajar el código
```bash
git clone https://github.com/Kikeagv/black-cat-nails-mobile.git
cd black-cat-nails-mobile
npm install
```

## 1. Crear el proyecto (si aún no existe)
1. Entra a https://console.firebase.google.com con tu cuenta de Google.
2. **Agregar proyecto** → nombre: `black-cat-nails` → puedes desactivar Google Analytics → **Crear proyecto**.
3. Quédate en el plan **Spark (gratis)**. No hace falta Blaze: las fotos se guardan comprimidas dentro de Firestore.

## 2. Registrar la app web y sacar el `firebaseConfig`
1. En la página principal del proyecto, haz clic en el ícono **`</>`** (Web).
2. Apodo: `black-cat-nails-web`. **No** marques Firebase Hosting → **Registrar app**.
3. Aparece un bloque como este:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "black-cat-nails-xxxx.firebaseapp.com",
     projectId: "black-cat-nails-xxxx",
     storageBucket: "black-cat-nails-xxxx.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
   Si ya cerraste esa pantalla: ⚙️ **Configuración del proyecto** → pestaña **General** → baja a **Tus apps** → elige la app web → **Configuración del SDK** → opción **Config**.

## 3. Crear el archivo `.env`
En la raíz del repo:
```bash
cp .env.example .env
```
Ábrelo y copia cada valor del paso 2 (sin comillas):

| En `firebaseConfig` | En `.env` |
| --- | --- |
| apiKey | `EXPO_PUBLIC_FIREBASE_API_KEY` |
| authDomain | `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| projectId | `EXPO_PUBLIC_FIREBASE_PROJECT_ID` |
| storageBucket | `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| messagingSenderId | `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| appId | `EXPO_PUBLIC_FIREBASE_APP_ID` |

Deja `EXPO_PUBLIC_USAR_EMULADORES=0`. El `.env` ya está en `.gitignore`: no se sube.

## 4. Activar los métodos de inicio de sesión
1. Menú izquierdo → **Compilación → Authentication** → **Comenzar**.
2. Pestaña **Sign-in method**:
   - **Correo electrónico/contraseña** → Habilitar → Guardar.
   - **Google** → Habilitar → elige tu correo como "correo de asistencia" → Guardar.
3. Vuelve a abrir **Google** y despliega **Configuración del SDK web**. Copia el **ID de cliente web** (termina en `.apps.googleusercontent.com`) y pégalo en `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` del `.env`.
4. Pestaña **Configuración → Dominios autorizados**: confirma que está `localhost` (viene por defecto). Así el botón de Google funciona en `npm run web`.

## 5. Crear la base de datos Firestore
1. Menú → **Compilación → Firestore Database** → **Crear base de datos**.
2. Ubicación: `nam5 (United States)` o la más cercana → Siguiente.
3. Elige **Iniciar en modo de producción** → Crear. (Las reglas buenas las subimos en el paso 7.)

## 6. Descargar la llave de servicio (solo para cargar los datos de prueba)
1. ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. **Generar nueva clave privada** → Generar clave. Se descarga un `.json`.
3. Renómbralo a `serviceAccount.json` y muévelo a la carpeta `scripts/` del repo.

⚠️ Esa llave da acceso total al proyecto. **No la compartas, no la subas a GitHub y no la muestres en capturas ni videos.** Ya está en `.gitignore`.

## 7. Subir las reglas de seguridad
```bash
npx firebase-tools@15 login
npm run reglas:deploy -- --project TU_PROJECT_ID
```
`TU_PROJECT_ID` es el `projectId` del paso 2. Debe terminar con `✔ Deploy complete!`.

## 8. Cargar los datos de demostración
```bash
npm run seed
```
Crea servicios, inventario, citas y las cuentas de prueba (contraseña `Password123` para todas; los correos aparecen en el README, sección "Cuentas de prueba"). Si ya lo corriste antes y quieres empezar limpio: `npm run seed -- --reset`.

## 9. Probar
```bash
npm run web
```
1. Inicia sesión con una cuenta de prueba (correo).
2. Cierra sesión y entra con **Continuar con Google** usando tu cuenta real: debe pedirte completar el perfil.
3. Revisa en la consola de Firebase → Firestore que aparezcan tus datos en `usuarias` y `actividad`.

En Expo Go (celular) funciona todo menos Google, que es la parte nativa. Google funciona en la versión web y en la app compilada de iOS (paso 10).

## 10. Google dentro de la app de iOS (paso a paso)
Necesitas una Mac con **Xcode** instalado (App Store). La primera compilación tarda de 5 a 15 minutos.

### 10.1 Preparar la Mac (una sola vez)
1. Abre Xcode una vez y acepta la licencia. Si te pide instalar "componentes adicionales" o la plataforma iOS, acepta.
2. En la terminal:
   ```bash
   xcode-select -p
   ```
   Debe mostrar `/Applications/Xcode.app/Contents/Developer`. Si muestra otra cosa:
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. Verifica que existe un simulador: `xcrun simctl list devices available | grep iPhone`.
   Si no sale ninguno: Xcode → Settings → Components (o Platforms) → descarga iOS.
4. CocoaPods: Expo lo usa para instalar el SDK de Google. Revisa con `pod --version`.
   Si no lo tienes: `brew install cocoapods`.

### 10.2 Registrar la app iOS en Firebase
1. Consola de Firebase → ⚙️ **Configuración del proyecto** → pestaña **General** → **Tus apps** → **Agregar app** → ícono de **Apple (iOS)**.
2. **ID del paquete de Apple:** `com.enriqueagv.blackcatnails` (exactamente así, tiene que coincidir con `app.json`).
3. Apodo: `black-cat-nails-ios`. El App Store ID se deja vacío → **Registrar app**.
4. **Descargar GoogleService-Info.plist**. Los pasos siguientes del asistente (agregar SDK, código de inicio) **sáltalos** con "Siguiente" → "Ir a la consola": ya están hechos en el código.

### 10.3 Copiar los dos valores al `.env`
1. Abre el `.plist` con TextEdit o VS Code (clic derecho → Abrir con).
2. Busca estas dos claves. El valor es la línea `<string>` que sigue:
   ```xml
   <key>CLIENT_ID</key>
   <string>1234567890-abcdef.apps.googleusercontent.com</string>
   <key>REVERSED_CLIENT_ID</key>
   <string>com.googleusercontent.apps.1234567890-abcdef</string>
   ```
3. En el `.env`:
   ```
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com
   GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.1234567890-abcdef
   ```
   Confirma también que `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (paso 4.3) esté lleno: el SDK nativo lo necesita para que Firebase acepte el token.
4. El `.plist` no hace falta meterlo al repo (está en `.gitignore`).

### 10.4 Compilar y abrir en el simulador
Desde la raíz del repo:
```bash
npx expo run:ios
```
- Genera la carpeta `ios/`, instala los pods, compila y abre el simulador con la app.
- Si te pregunta qué simulador usar, elige cualquier iPhone.
- Deja esa terminal abierta: es el servidor de Metro.

¿En tu iPhone físico en vez del simulador? Conéctalo por cable, actívale el Modo desarrollador (Ajustes → Privacidad y seguridad) y corre `npx expo run:ios --device`. Xcode te pedirá iniciar sesión con tu Apple ID para firmar (Xcode → Settings → Accounts). El simulador es más rápido.

### 10.5 Probar
1. En la app: **Continuar con Google** → se abre la hoja de Google → elige tu cuenta.
2. Primera vez: aparece "Completa tu perfil" → llena nombre y teléfono.
3. Revisa en Firebase → Authentication → Usuarios que apareció tu cuenta con el ícono de Google.

### 10.6 Si falla
- **`No Firebase App` o pantalla "Configura Firebase"**: el `.env` no se leyó. Cierra Metro y corre `npx expo run:ios` otra vez.
- **La app se cierra al tocar Google**, o error de "URL scheme": `GOOGLE_IOS_URL_SCHEME` está vacío o mal copiado. Corrígelo y regenera: `npx expo prebuild --clean -p ios` y luego `npx expo run:ios`.
- **`auth/invalid-credential` o "audience" al volver de Google**: el `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` no es el del mismo proyecto. Cópialo otra vez del paso 4.3.
- **Error de CocoaPods (`pod install` failed)**: `cd ios && pod install --repo-update && cd ..` y vuelve a compilar.
- **"No code signing" en iPhone físico**: abre `ios/*.xcworkspace` en Xcode → target → Signing & Capabilities → elige tu Team (Apple ID).
- La carpeta `ios/` que se genera no la subas: se puede regenerar siempre.

## Si algo falla
- **Sale la pantalla "Configura Firebase"**: falta algún valor del `.env`. Revísalo y reinicia con `npx expo start -c`.
- **`auth/operation-not-allowed`**: no habilitaste correo o Google (paso 4).
- **`permission-denied` al usar la app**: no se subieron las reglas (paso 7).
- **`Falta scripts/serviceAccount.json`**: revisa el nombre y la carpeta (paso 6).
- **El popup de Google se cierra solo**: abre la app en `http://localhost:8081`, no con la IP.
