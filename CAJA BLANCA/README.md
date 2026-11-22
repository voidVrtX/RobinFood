# Caja blanca

Cuatro pruebas Selenium que verifican acciones, accesibilidad y estados visibles de los roles Receptor, Donador y Administración:

1. `01_receptor_reserva_y_cancela.cjs`: comprueba los estados de reserva, el formato del código y la cancelación.
2. `02_donador_actualiza_perfil.cjs`: actualiza el perfil y comprueba que el cambio quede reflejado.
3. `03_admin_exporta_reporte.cjs`: verifica la vista previa administrativa y solicita la exportación CSV.
4. `04_ciclo_integral_y_estados.cjs`: comprueba las transiciones de publicación a reserva y entrega, y la revisión administrativa.

## Ejecución

Desde la raíz del proyecto, inicia la app web:

```powershell
npm run web
```

En otra terminal, ejecuta las cuatro pruebas:

```powershell
Get-ChildItem ".\CAJA BLANCA\0*.cjs" | Where-Object Name -ne "selenium_helpers.cjs" | ForEach-Object {
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

También se puede ejecutar cada archivo por separado con `node ".\CAJA BLANCA\<nombre>.cjs"`.
Se requiere Google Chrome. Por defecto, Selenium abre `http://localhost:8081`; para usar otra dirección, define `ROBINFOOD_URL`.
