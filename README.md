# Robin Food

Aplicación Expo / React Native / React Native Web para coordinar donaciones de alimentos en Toluca. La aplicación usa Firebase para autenticación, datos compartidos, imágenes y operaciones autorizadas; el almacenamiento local con cuentas y datos ficticios solo funciona en modo demo explícito.

## Requisitos

- Node.js 20.19+ y npm.
- Para móvil: Xcode en macOS o Android Studio con SDK/emulador.
- Una app web Firebase del proyecto `robinfood-fireb`.

## Desarrollo

```powershell
npm ci
Copy-Item .env.example .env
# Completa EXPO_PUBLIC_FIREBASE_API_KEY en .env; no compartas ni registres el valor.
npx expo start
npx expo start --web
npx expo run:android
npx expo run:ios
npm test
npm run typecheck
npm run lint
npm run build:web
```

`.env.example` contiene los IDs públicos del proyecto y deja la API key vacía porque no estaba presente en el contexto de la integración. Firebase muestra un error explícito hasta completar la variable. No se sobrescribe ningún `.env` local.

Para fixtures estrictamente locales, establece `EXPO_PUBLIC_DEMO_MODE=true` deliberadamente antes de iniciar Expo. En producción y Render el valor debe ser `false`. Las cuentas, contraseñas y publicaciones demo nunca se migran ni se cargan en Firebase.

## Firebase y despliegue web

Consulta [docs/CONFIGURACION_FIREBASE_RENDER.md](./docs/CONFIGURACION_FIREBASE_RENDER.md) para habilitar Email/Password, crear Firestore y Storage, configurar facturación, bootstrap de la primera administración con Admin SDK confiable y preparar el Static Site de Render. El blueprint `render.yaml` publica el resultado de `npm run build:web` (`dist`).

La app no despliega reglas, índices, Functions, datos ni Render de forma automática. Los comandos de publicación están documentados, pero requieren revisar y confirmar el conjunto concreto antes de ejecutarlos.

El esquema y los permisos están descritos en [docs/MIGRACION_BACKEND.md](./docs/MIGRACION_BACKEND.md). El proyecto Firebase se selecciona con `.firebaserc`.

## Funcionalidad

- Inicio/cierre de sesión Firebase, persistencia web y móvil, recuperación por correo, cambio obligatorio de contraseña temporal y perfiles privados.
- Solicitudes de acceso sin registro público; creación de cuentas receptoras/donadoras solo por administración.
- Donaciones, reservas, mensajes, avisos internos, solicitudes y auditoría en colecciones separadas de Firestore.
- Reservas, cancelaciones y entregas verificadas en transacciones server-side; reglas por identidad, rol y participante.
- Fotos reales subidas a Storage bajo rutas controladas; el modo demo conserva imágenes y datos ficticios locales.
- Puntos sugeridos de Toluca seleccionables al publicar una donación y visibles en el mapa junto con las publicaciones y posibles receptores. Son datos informativos: confirma horarios y excedentes; no son socios verificados ni datos sembrados en backend.
- Las notificaciones push no están implementadas. Solo existen avisos dentro de la app sincronizados por Firestore.
- Mapa OSM, filtros, navegación por rol, soporte, reportes, CSV e interfaz responsiva.

## Cuentas demo

Las siguientes cuentas solo existen en la base local de demostración. No las crees en Firebase ni reutilices sus contraseñas:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador demo | admin@robinfood.mx | Admin#2026 |
| Donador demo | donador@robinfood.mx | Donador#2026 |
| Receptor demo | receptor@robinfood.mx | Receptor#2026 |
| Donador demo | void@robinfood.mx | Void#2026 |
| Donador demo | ana.perez@robinfood.mx | Ana#20262 |
| Receptor demo | juan.lopez@robinfood.mx | Juan#20262 |
| Receptor demo | comedor.sanjose@robinfood.mx | Comedor#2026 |
| Donador demo suspendido | fruvertodo@robinfood.mx | Fruta#2026 |
| Receptor demo | lucia.ramirez@robinfood.mx | Lucia#2026 |

## Estructura

- `app/`: punto de entrada Expo Router.
- `src/services/foodService.ts`: adaptador entre Firebase y demo local.
- `src/services/firebase/`: configuración, autenticación, Firestore, Functions y Storage del cliente.
- `src/services/db/`: almacenamiento y seed solo de demostración.
- `functions/`: operaciones server-side y bootstrap controlado de administración.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json`: seguridad e índices; no desplegados.
- `src/data/tolucaRoutes.ts`: puntos sugeridos que se muestran en el mapa y se pueden elegir como ubicación de recolección al publicar.
- `__tests__/`: pruebas locales de servicios, permisos y cálculos.

Consulta `docs/DECISIONES.md` para las limitaciones funcionales que ya estaban pendientes.
