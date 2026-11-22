# Backend de Robin Food

La integración aprobada para esta etapa es Firebase, no la propuesta histórica de PostgreSQL/Supabase. La app conserva el repositorio local solo cuando `EXPO_PUBLIC_DEMO_MODE=true`; el valor predeterminado y el entorno de Render usan Firebase.

## Colecciones

| Colección | Contenido y acceso |
|---|---|
| `users/{uid}` | Perfil privado, rol asignado por backend, estado y preferencias. Solo la persona y administración pueden leerlo; las escrituras pasan por Functions. |
| `donations/{id}` | Una publicación por documento, coordenadas, vigencia, estado y rutas de fotos de Storage. Las publicaciones disponibles son visibles a cuentas activas; las reservadas se limitan a sus participantes. |
| `reservations/{id}` | Relación entre publicación, receptor y donador, estado e historial; nunca contiene el código de entrega. Solo participantes y administración pueden leerla. |
| `reservationSecrets/{reservationId}` | Código de entrega y hash/intentos; solo el receptor de esa reserva puede leerlo. Escritura y validación exclusivamente en Functions. |
| `notifications/{id}` | Avisos dentro de la app, particionados por `userId`; no es un servicio push. |
| `messages/{id}` | Mensajes privados por `conversationId`; solo participantes y administración pueden leerlos. |
| `accessRequests/{id}` | Solicitudes de acceso, correo y estado; lectura administrativa y creación mediante callable con validación y límite de solicitudes. |
| `auditLog/{id}` | Registro append-only escrito por Functions y visible solo para administración. |
| `reports/{id}` | Agregados sin datos personales; lectura autenticada, escrituras de backend. No se cargan estadísticas demo en Firebase. |
| `rateLimits/{id}` | Controles internos de abuso; no accesibles desde cliente. |

Las preferencias viven en el perfil `users/{uid}.prefs`. No se guarda toda la base en un único documento. `firestore.indexes.json` declara los índices usados para reservas y vencimientos.

## Confianza y operaciones

- Firebase Authentication es la identidad; la sesión web la persiste Firebase y la sesión móvil usa AsyncStorage como persistencia de Auth. AsyncStorage/localStorage no son fuente de datos compartidos.
- El cliente no puede crear perfiles, cambiar roles/estados, escribir documentos de dominio ni leer auditoría o mensajes de otras cuentas. Las reglas deniegan el resto por defecto.
- Las funciones callable derivan el actor del token verificado y vuelven a comprobar perfil/estado/rol. No confían en IDs de actor del cliente.
- `reserveDonation`, `cancelReservation`, `cancelDonation` y `validateDelivery` comprueban y escriben estado, notificaciones y auditoría en transacciones server-side. El código de entrega tiene intentos limitados y no aparece en documentos de reserva ni avisos.
- `createAccount` solo admite receptor/donador y solo administración autenticada. La cuenta `admin` inicial se habilita mediante el procedimiento de bootstrap descrito en `CONFIGURACION_FIREBASE_RENDER.md`; no existe ascenso de rol desde la app.
- El cliente sube imágenes a `staging/{uid}/` con límite de 5 MB y tipos JPG/PNG/WebP. Functions valida y copia los objetos; Firestore almacena rutas, no URI locales ni URLs de descarga.
- La recuperación de contraseña usa Firebase Auth Email/Password. Las solicitudes de acceso no son registro público.

## Demo y datos existentes

Las cuentas, contraseñas y publicaciones de `src/services/db/seed.ts` son exclusivamente datos de demostración locales. No hay migración automática ni seed de esos datos en Firebase. Cambiar a Firebase no copia ni sincroniza la base local. Para probar datos reales, crea cuentas autorizadas y publicaciones desde los flujos conectados.

Los establecimientos autorizados se almacenan en la colección `locations` de Firestore y el cliente obtiene únicamente ubicaciones con `active=true`. Los puntos visibles pueden elegirse al crear una publicación. La operación `upsertLocation` solo acepta cuentas administradoras. Los horarios y datos deben mantenerse directamente con cada establecimiento.
