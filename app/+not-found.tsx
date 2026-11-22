import React from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme/palette';

export default function NotFound() {
  return <View style={styles.page}><Text style={styles.robin}>🐦</Text><Text style={styles.title}>No encontramos esta pantalla</Text><Text style={styles.body}>Regresa al inicio de Robin Food para continuar.</Text><Link href="/" style={styles.link}>Volver al inicio</Link></View>;
}

const styles = StyleSheet.create({ page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: palette.cream }, robin: { fontSize: 56 }, title: { color: palette.ink, fontSize: 22, fontWeight: '800', textAlign: 'center' }, body: { color: palette.muted, textAlign: 'center' }, link: { color: palette.goldDark, fontWeight: '800', textDecorationLine: 'underline' } });
