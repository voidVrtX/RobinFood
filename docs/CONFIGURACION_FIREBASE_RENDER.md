# Configuración de Firebase y Render

## 1. Preparar Firebase Console

En el proyecto `robinfood-fireb`:

1. En **Authentication → Sign-in method**, habilita **Email/Password**. Configura la plantilla de recuperación y los dominios autorizados que usarás en web y Render.
2. En **Authentication → Users**, crea manualmente una cuenta inicial para administración. No uses ninguna cuenta ni contraseña de demo.
3. En **Firestore Database**, crea la base en la región elegida para el proyecto. Revisa antes el costo/plan y el acceso regional.
4. En **Storage**, habilita el bucket `robinfood-fireb.firebasestorage.app`, revisa el plan de facturación y conserva las reglas del repositorio. Los archivos de publicaciones están protegidos por propietario/estado y se limitan a JPG, PNG o WebP de 5 MB.
5. Habilita el plan **Blaze** si Firebase lo exige para Functions, Cloud Storage, operaciones usadas o el volumen previsto. Functions usa la región `us-central1`; configura presupuesto y alertas.
6. La app y el índice de Firestore usan las colecciones definidas en `docs/MIGRACION_BACKEND.md`. Carga los índices con Firebase CLI cuando hayas revisado las reglas e índices locales.

No habilites reglas públicas. Nunca uses `allow read, write: if true`. El cliente no puede asignar roles; la cuenta inicial se aprovisiona una sola vez con Admin SDK confiable.

## 2. Bootstrap seguro de la primera administración

1. Crea una cuenta nueva (sin relación con las cuentas demo) en Firebase Authentication y conserva su UID.
2. En una estación confiable con permisos IAM mínimos y controlados, autentica Google Application Default Credentials mediante `gcloud auth application-default login`. No descargues ni guardes una clave privada de cuenta de servicio en el repositorio.
3. Desde la raíz del proyecto, instala las dependencias de Functions si no están instaladas y ejecuta en PowerShell:

   ```powershell
   $env:BOOTSTRAP_ADMIN_UID = "UID_DE_AUTH"
   node .\functions\scripts\bootstrap-admin.mjs
   Remove-Item Env:\BOOTSTRAP_ADMIN_UID
   ```

El script se fija al proyecto `robinfood-fireb`, exige que no exista otro perfil administrador y rehúsa promover un perfil ya existente. Solo entonces agrega el claim privilegiado y crea el perfil. El acceso a ADC permite modificar el proyecto y debe restringirse como una credencial; no lo copies al cliente, al repositorio ni a `EXPO_PUBLIC_*`.

## 3. Variables de entorno del cliente

Duplica `.env.example` como `.env` en desarrollo y completa `EXPO_PUBLIC_FIREBASE_API_KEY` con la **configuración web pública** de Firebase Console → Project settings → Your apps. No pegues la clave en documentación, logs, commits ni mensajes. La API key web no es una credencial de Admin SDK, pero debe restringirse por API/referrer según el despliegue. No sobrescribas `.env` existente.

La API key no estaba disponible en el contexto de esta integración, por lo que la variable queda vacía intencionalmente y la app muestra un error explícito hasta configurarla. Los valores restantes ya apuntan a `robinfood-fireb`. Para probar los fixtures locales, establece deliberadamente `EXPO_PUBLIC_DEMO_MODE=true`; el valor predeterminado es `false`.

En Firebase Console habilita Email/Password y registra el dominio de Render como dominio autorizado antes de iniciar sesión o enviar recuperación de contraseña.

## 4. Rules, índices y Functions

No se publicó ninguna configuración. Después de revisar el diff y confirmar explícitamente los recursos concretos a publicar, desde la raíz:

```powershell
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
npx firebase-tools deploy --only functions
```

La primera publicación requiere que Firestore/Storage estén habilitados. Functions requiere permisos IAM y, normalmente, facturación Blaze. No despliegues estas reglas/funciones hasta revisar el proyecto y confirmar la operación; este cambio solo deja los archivos listos.

## 5. Render Static Site

El blueprint `render.yaml` configura:

- Build: `npm ci && npm run build:web`.
- Publicación: `dist`, generada por `expo export -p web` (`web.output: static`).
- `EXPO_PUBLIC_DEMO_MODE=false` y la configuración pública del proyecto Firebase.

Al crear el Static Site en Render, proporciona la variable `EXPO_PUBLIC_FIREBASE_API_KEY` con el valor web de Firebase. Render compila Expo con esas variables y publica el contenido estático. El blueprint no añade rewrites: la app Expo actual usa una sola pantalla raíz y la exportación estática genera `index.html`. Si en el futuro se añaden rutas web no exportadas, revisa el artefacto `dist` antes de configurar rewrites.

Antes de publicar en Render, crea los índices y despliega Rules/Functions con aprobación separada; verifica Email/Password, dominios autorizados, Storage y facturación. No hay configuración ni despliegue de notificaciones push: los avisos actuales son in-app y se sincronizan en Firestore.
