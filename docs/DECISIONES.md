# Decisiones de implementación

- El ZIP Figma Make es un prototipo Vite de una sola página, con roles, muestras de alimentos, componentes y validación de entrega; se tomó como referencia funcional. La identidad visual usa los tokens aprobados crema/dorado/negro, no el azul de la maqueta.
- La imagen de 32 pantallas no estaba adjunta; se implementó según las descripciones escritas y se priorizó una base utilizable y verificable.
- La especificación anuncia nueve cuentas pero enumera ocho; se añadió una cuenta receptora ficticia `lucia.ramirez@robinfood.mx` para alcanzar nueve.
- La referencia declara “9 cuentas” al sumar admin + cuatro donadores + cuatro receptores. Esta entrega usa nueve cuentas en total (1 admin, 4 donadores, 4 receptores), incluyendo la cuenta adicional anterior.
- El mapa web usa iframe de OpenStreetMap sin clave; no se añadió Leaflet interactivo ni sincronización de pin. El nativo usa react-native-maps.
- Las estadísticas históricas son agregados para dar contexto; el impacto se marca como estimación. No se simulan miles de filas.
- Las sesiones se guardan 30 días en almacenamiento local. Las cuentas demo no tienen aceptación de términos guardada para permitir verificar la aceptación inicial.
- Se priorizaron auth, reglas de servicio, publicación, reserva, entrega, admin esencial, soporte, reportes y documentación. No se afirma que las 32 pantallas estén completas. Se aplazaron el CRUD detallado de usuarios, flujo completo de edición/borradores, escáner QR, PDF nativo, permisos OS para notificaciones/ubicación, modo oscuro global y traducción integral al inglés.
- Las capturas remotas usan URLs Unsplash con imagen alternativa; la publicación permite elegir una imagen del dispositivo. No se almacenan en una nube.
- El aviso legal contiene el contenido esencial y fecha/version solicitados, además de una nota de revisión jurídica; no sustituye asesoría legal profesional.
