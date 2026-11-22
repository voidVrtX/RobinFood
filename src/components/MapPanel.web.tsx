import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Donation, MapLocation } from '@/types/models';
import { TOLUCA, palette } from '@/theme/palette';
import { potentialRecipients, possibleSurplusLocations } from '@/data/tolucaRoutes';

export default function MapPanel({ donations = [], locations = [], selectedDonation = null, receptorLocation = null }: { donations?: Donation[]; locations?: MapLocation[]; selectedDonation?: Donation | null; receptorLocation?: { lat: number; lng: number } | null }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    let map: LeafletMap | undefined;
    let disposed = false;

    void import('leaflet').then(({ default: L }) => {
      if (disposed || !mapElement.current) return;
      setMapError('');

      map = L.map(mapElement.current, { scrollWheelZoom: false }).setView([TOLUCA.lat, TOLUCA.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const coordinates: [number, number][] = [];
      const addMarker = (latitude: number, longitude: number, color: string, title: string, description: string) => {
        const popup = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = title;
        const detail = document.createElement('div');
        detail.textContent = description;
        popup.append(heading, detail);

        L.circleMarker([latitude, longitude], {
          radius: 8,
          color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map!).bindPopup(popup);
        coordinates.push([latitude, longitude]);
      };

      if (locations.length) {
        locations.forEach((point) => {
          const color = point.type === 'recoleccion' ? palette.goldDark : '#387A55';
          const label = point.type === 'recoleccion' ? 'Punto de recolección' : 'Organización receptora';
          const phone = point.phone ? ` · Tel. ${point.phone}` : '';
          addMarker(point.latitude, point.longitude, color, point.name, `${label} · ${point.address} · ${point.schedule}${phone}`);
        });
      } else {
        possibleSurplusLocations.forEach((point) => {
          addMarker(point.latitude, point.longitude, palette.goldDark, point.name, `Punto sugerido de recolección · ${point.address} · ${point.schedule}`);
        });
        potentialRecipients.forEach((point) => {
          const phone = point.phone ? ` · Tel. ${point.phone}` : '';
          addMarker(point.latitude, point.longitude, '#387A55', point.name, `Posible organización receptora · ${point.address} · ${point.schedule}${phone}`);
        });
      }
      donations.forEach((donation) => {
        addMarker(donation.lat, donation.lng, '#B6291F', donation.title, `Publicación · ${donation.address}`);
      });
      if (receptorLocation) {
        addMarker(receptorLocation.lat, receptorLocation.lng, '#EC6FA8', 'Tu ubicación', 'Ubicación de tu cuenta');
      }
      if (selectedDonation) {
        addMarker(selectedDonation.lat, selectedDonation.lng, '#2563EB', 'Ubicación exacta del donador', selectedDonation.address);
        if (receptorLocation) {
          L.polyline([
            [receptorLocation.lat, receptorLocation.lng],
            [selectedDonation.lat, selectedDonation.lng],
          ], { color: '#2563EB', weight: 5, opacity: 0.75, dashArray: '10 8' }).addTo(map);
        }
      }

      if (coordinates.length > 1) map.fitBounds(coordinates, { padding: [24, 24], maxZoom: 14 });
      else if (coordinates.length === 1) map.setView(coordinates[0], 14);
    }).catch((reason: unknown) => {
      if (disposed) return;
      console.error('No se pudo cargar el mapa interactivo.', reason);
      setMapError('No se pudo cargar el mapa. Revisa tu conexión a internet e inténtalo de nuevo.');
    });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [donations, locations, selectedDonation, receptorLocation]);

  return (
    <View style={styles.container}>
      <View style={styles.frame} accessibilityLabel="Mapa de publicaciones y puntos sugeridos en Toluca">
        <div ref={mapElement} style={{ width: '100%', height: '100%', minHeight: 250 }} />
      </View>
      {mapError ? <Text accessibilityRole="alert" style={styles.error}>{mapError}</Text> : null}
      <View style={styles.legend}>
        <Text style={styles.item}><Text style={styles.publication}>●</Text> Publicaciones</Text>
        <Text style={styles.item}><Text style={styles.pickup}>●</Text> Puntos de recolección</Text>
        <Text style={styles.item}><Text style={styles.recipient}>●</Text> Posibles receptores</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  frame: { height: 290, overflow: 'hidden', borderRadius: 18, backgroundColor: '#eee', borderWidth: 1, borderColor: palette.line },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  item: { color: palette.inkSoft, fontSize: 12 },
  publication: { color: '#B6291F' },
  pickup: { color: palette.goldDark },
  recipient: { color: '#387A55' },
  error: { color: palette.danger, fontSize: 13 },
});
