# Arquitectura y límites

## Capas

1. `src/types/models.ts`: modelos y roles compartidos.
2. `src/services/db/`: almacenamiento JSON con clave versionada `robinfood:v1:database`, migración y transacción serializada. `LocalRepo<T>` expone operaciones CRUD/query. AsyncStorage usa localStorage en web.
3. `src/services/foodService.ts`: validación Zod, autorización por rol en operaciones sensibles, transacciones de reserva/publicación/entrega, expiración, auditoría y agregados.
4. `src/store/appStore.ts`: Zustand conserva el perfil de sesión sin hash y sincroniza datos al hidratar/actualizar.
5. `src/components/RobinFoodApp.tsx`: composición de UI adaptativa y acciones de producto; `MapPanel.web.tsx` / `.native.tsx` aíslan mapas.

## Datos y concurrencia

La base demo se guarda localmente por navegador/dispositivo; no se comparte entre usuarios ni permite transacciones distribuidas. `atomic()` serializa cambios y conserva una copia anterior para revertir errores. Esta protección solo opera dentro de una instancia de la app. Reservas simultáneas entre dispositivos requieren transacciones de servidor.

Las cuentas seed usan SHA-256 y salt aleatorio mediante Expo Crypto. Es una demostración educativa; en producción debe usarse proveedor de identidad, hashes Argon2id/bcrypt solo en servidor, MFA/recuperación real, HTTPS y autorización server-side. Los valores demo no son datos personales reales.

## Migración

Mantener los contratos de `Repo<T>` y sustituir `LocalRepo` con una implementación de API. Autenticar el usuario en servidor. Persistir usuario, donación, reserva, notificación, mensaje, solicitud de acceso, auditoría y configuración en tablas independientes. Mover archivos a almacenamiento con ACL, validar el estado y la vigencia dentro de la misma transacción de reserva, emitir notificaciones del servidor y no confiar en métricas calculadas por el cliente.

Los mapas web consultan el iframe público de OpenStreetMap; el móvil usa `react-native-maps`. Debe revisarse atribución, límites del proveedor y política de privacidad antes de producción.
