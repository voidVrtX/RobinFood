export interface TolucaRoutePoint {
  name: string;
  address: string;
  schedule: string;
  latitude: number;
  longitude: number;
  phone?: string;
}

export const possibleSurplusLocations: TolucaRoutePoint[] = [
  {
    name: 'Pastelerías Esperanza (Hidalgo)',
    address: 'Av. Miguel Hidalgo 1301, Reforma y FFCC Nacionales, 50070 Toluca',
    schedule: 'Diario 7:00–21:00',
    latitude: 19.2901554,
    longitude: -99.6382314,
  },
  {
    name: 'Pastelerías Esperanza (Rayón)',
    address: 'Ignacio López Rayón 5110, Barrio de Sta. Clara, 50000 Toluca',
    schedule: 'Diario 7:00–21:00',
    latitude: 19.2903778,
    longitude: -99.6530373,
  },
  {
    name: 'Fonda Degollado',
    address: 'Santos Degollado 107, Centro, 50000 Toluca',
    schedule: 'Diario 8:00–19:00',
    latitude: 19.2940124,
    longitude: -99.6542907,
  },
  {
    name: 'Gran Cardenal, el Sabor de Casa',
    address: 'Ignacio Allende 115, Centro, 50000 Toluca',
    schedule: 'Lun–Vie 8:00–17:00, Sáb 8:00–16:00, Dom 8:00–13:00',
    latitude: 19.2887963,
    longitude: -99.6556963,
  },
  {
    name: 'Fonda Don Javier',
    address: 'República de Brasil 207, Américas Cárdenas, 50130 Toluca',
    schedule: 'Lun–Sáb 8:00–18:00 (Dom cerrado)',
    latitude: 19.2807987,
    longitude: -99.6474318,
  },
];

export const potentialRecipients: TolucaRoutePoint[] = [
  {
    name: 'Casa Hogar Alegría',
    address: 'Lanceros de Toluca 208, Héroes del 5 de Mayo, 50170 Toluca',
    schedule: 'Lun–Sáb 9:00–20:00',
    phone: '722 208 9255',
    latitude: 19.262224,
    longitude: -99.6746534,
  },
  {
    name: 'Hogares Providencia',
    address: 'C. Huitzilopochtli 102, Barrio de Sta. Bárbara, 50050 Toluca',
    schedule: 'Abierto 24 h',
    phone: '722 214 1616',
    latitude: 19.298754,
    longitude: -99.658205,
  },
  {
    name: 'Por Una Niñez Feliz A.C.',
    address: 'Sta. Magdalena S/N, Ejido Altamirano, San Mateo Oxtotitlán, 50100 Toluca',
    schedule: 'Lun–Sáb 9:00–17:00',
    phone: '722 217 1482',
    latitude: 19.3002606,
    longitude: -99.702988,
  },
];

export function getDirectionsUrl(point: Pick<TolucaRoutePoint, 'latitude' | 'longitude'>): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`;
}
