export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimatedKg(quantity: number, unit: string): number {
  const kgPerUnit: Record<string, number> = { kg: 1, piezas: 0.18, porciones: 0.35, litros: 1, cajas: 8 };
  return quantity * (kgPerUnit[unit] ?? 1);
}
