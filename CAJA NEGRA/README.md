# Caja negra

Cuatro pruebas de flujos visibles para las personas usuarias, con cobertura de Receptor, Donador y Administración:

1. `01_receptor_reserva_donacion.cjs`: explora alimentos, reserva uno y comprueba la confirmación y el código.
2. `02_donador_publica_donacion.cjs`: publica alimentos y comprueba que aparezcan en la aplicación.
3. `03_admin_crea_usuario.cjs`: crea una cuenta Receptor y comprueba que se genere su contraseña temporal.
4. `04_flujo_completo_donacion.cjs`: recorre la publicación, reserva, validación de entrega y revisión administrativa.

## Ejecución

Desde la raíz del proyecto, inicia la app web:

```powershell
npm run web
```

En otra terminal, ejecuta las cuatro pruebas:

```powershell
Get-ChildItem ".\CAJA NEGRA\0*.cjs" | Where-Object Name -ne "selenium_helpers.cjs" | ForEach-Object {
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

También se puede ejecutar cada archivo por separado con `node ".\CAJA NEGRA\<nombre>.cjs"`.
Se requiere Google Chrome. Por defecto, Selenium abre `http://localhost:8081`; para usar otra dirección, define `ROBINFOOD_URL`.
