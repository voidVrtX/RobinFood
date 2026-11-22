import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { Donation, MapLocation } from '@/types/models';
import { TOLUCA, palette } from '@/theme/palette';
import { potentialRecipients, possibleSurplusLocations } from '@/data/tolucaRoutes';

export default function MapPanel({ donations = [], locations = [], selectedDonation = null, receptorLocation = null }: { donations?: Donation[]; locations?: MapLocation[]; selectedDonation?: Donation | null; receptorLocation?: { lat: number; lng: number } | null }) {
  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        <MapView style={StyleSheet.absoluteFill} initialRegion={{ latitude: TOLUCA.lat, longitude: TOLUCA.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 }}>
          {locations.length ? locations.map((point) => (
            <Marker key={`location-${point.id}`} coordinate={{ latitude: point.latitude, longitude: point.longitude }} title={point.name} description={`${point.type === 'recoleccion' ? 'Punto de recolección' : 'Organización receptora'} · ${point.address} · ${point.schedule}${point.phone ? ` · Tel. ${point.phone}` : ''}`} pinColor={point.type === 'recoleccion' ? palette.goldDark : '#387A55'} />
          )) : <>
            {possibleSurplusLocations.map((point) => (
              <Marker key={`pickup-${point.name}`} coordinate={{ latitude: point.latitude, longitude: point.longitude }} title={point.name} description={`Punto sugerido de recolección · ${point.address} · ${point.schedule}`} pinColor={palette.goldDark} />
            ))}
            {potentialRecipients.map((point) => (
              <Marker key={`recipient-${point.name}`} coordinate={{ latitude: point.latitude, longitude: point.longitude }} description={`Posible organización receptora · ${point.address} · ${point.schedule}${point.phone ? ` · Tel. ${point.phone}` : ''}`} title={point.name} pinColor="#387A55" />
            ))}
          </>}
          {donations.map((donation) => (
            <Marker key={`donation-${donation.id}`} coordinate={{ latitude: donation.lat, longitude: donation.lng }} title={donation.title} description={`Publicación · ${donation.address}`} pinColor="#B6291F" />
          ))}
          {receptorLocation ? (
            <Marker coordinate={{ latitude: receptorLocation.lat, longitude: receptorLocation.lng }} title="Tu ubicación" pinColor="#EC6FA8" />
          ) : null}
          {selectedDonation ? (
            <Marker coordinate={{ latitude: selectedDonation.lat, longitude: selectedDonation.lng }} title="Ubicación exacta del donador" description={selectedDonation.address} pinColor="#2563EB" />
          ) : null}
          {selectedDonation && receptorLocation ? (
            <Polyline
              coordinates={[
                { latitude: receptorLocation.lat, longitude: receptorLocation.lng },
                { latitude: selectedDonation.lat, longitude: selectedDonation.lng },
              ]}
              strokeColor="#2563EB"
              strokeWidth={5}
            />
          ) : null}
        </MapView>
      </View>
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
  frame: { height: 290, overflow: 'hidden', borderRadius: 18, backgroundColor: '#eee' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  item: { color: palette.inkSoft, fontSize: 12 },
  publication: { color: '#B6291F' },
  pickup: { color: palette.goldDark },
  recipient: { color: '#387A55' },
});
