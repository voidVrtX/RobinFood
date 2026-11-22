import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, TOLUCA } from '@/theme/palette';
import type { Donation, MapLocation } from '@/types/models';

export default function MapPanel({ donations = [], locations = [] }: { donations?: Donation[]; locations?: MapLocation[] }) {
  return <View style={styles.map}><Text style={styles.pin}>📍</Text><Text style={styles.label}>Donaciones cerca de ti · {donations.length} publicaciones · {locations.length} ubicaciones compartidas · {TOLUCA.address}</Text></View>;
}

const styles = StyleSheet.create({ map: { minHeight: 250, borderRadius: 18, backgroundColor: '#eee8d8', borderWidth: 1, borderColor: palette.line, justifyContent: 'center', alignItems: 'center', padding: 18, gap: 8 }, pin: { fontSize: 36 }, label: { color: palette.ink, fontWeight: '700', textAlign: 'center' } });
