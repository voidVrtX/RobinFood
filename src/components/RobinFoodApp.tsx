import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Platform, Pressable as NativePressable, ScrollView as NativeScrollView, Share,
  StyleSheet, Text as NativeText, useWindowDimensions, View as NativeView,
  type PressableProps, type PressableStateCallbackType, type ScrollViewProps, type StyleProp, type TextProps, type TextStyle, type ViewProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, BarChart3, Bell, Check, CircleHelp, Clipboard, Home, LogOut, MapPin, Menu,
  Plus, Search, Settings, UserRound, Users, Utensils,
} from 'lucide-react-native';
import * as ClipboardAPI from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAppStore } from '@/store/appStore';
import { palette, TERMS_VERSION, TOLUCA } from '@/theme/palette';
import { LanguageContext, ThemeContext, translate } from '@/theme/AppContext';
import type { Category, Donation, MapLocation, PublicUser, Role } from '@/types/models';
import MapPanel from './MapPanel';
import { Button, Card, Heading, Label, TextField } from './Controls';
import {
  acceptAccessRequestAsAdmin, acceptTerms, cancelReservation, createUser, exportCsv, getImpact,
  cancelDonation, expireStaleRecords, markNotificationsRead, moderateDonation, publishDonation, requestAccess, sendSupportMessage,
  replySupportMessage, requestPasswordReset, resetDemo, resolvePhoto, setUserStatus, signIn, snapshot, updateLocation, updatePassword, updatePreferences, updateProfile, validateDelivery, getMapLocations,
} from '@/services/foodService';
import { haversineKm } from '@/utils/geo';
import { isDemoMode } from '@/services/firebase/mode';
import { possibleSurplusLocations } from '@/data/tolucaRoutes';

function translatedChildren(children: React.ReactNode, language: 'es' | 'en'): React.ReactNode {
  if (typeof children === 'string') return translate(children, language);
  if (Array.isArray(children)) return children.map((child) => translatedChildren(child, language));
  return children;
}

function darkSurfaceStyle(style: StyleProp<ViewStyle>, dark: boolean): StyleProp<ViewStyle> {
  if (!dark) return style;
  const flat = StyleSheet.flatten(style);
  if (!flat) return style;
  const surfaces: Record<string, string> = {
    '#ffffff': '#242424', '#fff': '#242424', '#fbf6ea': '#171717',
    '#fffdf8': '#25231f', '#f5ead1': '#302a1e', '#f8efd9': '#302a1e',
    '#fffaf0': '#2b271f', '#ffefed': '#3a2422', '#eaf8ee': '#1f3325',
  };
  const normalize = (color: unknown) => typeof color === 'string' ? color.toLowerCase() : undefined;
  const background = normalize(flat.backgroundColor);
  const border = normalize(flat.borderColor);
  const borderBottom = normalize(flat.borderBottomColor);
  const borderRight = normalize(flat.borderRightColor);
  const updates: ViewStyle = {
    ...(background && surfaces[background] ? { backgroundColor: surfaces[background] } : {}),
    ...(border === palette.line.toLowerCase() ? { borderColor: '#3b3b3b' } : {}),
    ...(borderBottom === palette.line.toLowerCase() ? { borderBottomColor: '#3b3b3b' } : {}),
    ...(borderRight === palette.line.toLowerCase() ? { borderRightColor: '#3b3b3b' } : {}),
  };
  return Object.keys(updates).length ? [style, updates] : style;
}

function themedTextStyle(style: StyleProp<TextStyle>, dark: boolean): StyleProp<TextStyle> {
  if (!dark) return style;
  const rawColor = StyleSheet.flatten(style)?.color;
  const color = typeof rawColor === 'string' ? rawColor.toLowerCase() : undefined;
  const lightTextColors: string[] = [palette.ink, palette.inkSoft, palette.muted].map((value) => value.toLowerCase());
  return !color || lightTextColors.includes(color)
    ? [style, { color: '#f4f1e8' }]
    : color === '#b6291f' ? [style, { color: '#ff958c' }]
    : style;
}

function View(props: ViewProps) {
  const dark = useContext(ThemeContext);
  return <NativeView {...props} style={darkSurfaceStyle(props.style, dark)} />;
}

function Pressable(props: PressableProps) {
  const dark = useContext(ThemeContext);
  const styleProp = props.style;
  const style = typeof styleProp === 'function'
    ? (state: PressableStateCallbackType) => darkSurfaceStyle(styleProp(state), dark)
    : darkSurfaceStyle(styleProp, dark);
  return <NativePressable {...props} style={style} />;
}

function ScrollView(props: ScrollViewProps) {
  const dark = useContext(ThemeContext);
  return <NativeScrollView {...props} style={darkSurfaceStyle(props.style, dark)} contentContainerStyle={darkSurfaceStyle(props.contentContainerStyle, dark)} />;
}

function Text(props: TextProps) {
  const dark = useContext(ThemeContext);
  const language = useContext(LanguageContext);
  return <NativeText {...props} style={themedTextStyle(props.style, dark)}>{translatedChildren(props.children, language)}</NativeText>;
}

function DonationPhoto({ path, title, style }: { path?: string; title: string; style: StyleProp<ViewStyle> }) {
  const [uri, setUri] = useState<string | null>(() => (isDemoMode && path ? path : null));
  useEffect(() => {
    let active = true;
    if (!path) {
      setUri(null);
    } else if (isDemoMode) {
      setUri(path);
    } else {
      void resolvePhoto(path).then((resolved) => {
        if (active) setUri(resolved);
      }).catch(() => {
        if (active) setUri(null);
      });
    }
    return () => { active = false; };
  }, [path]);

  return (
    <View style={[style, { overflow: 'hidden' }]}>
      {uri
        ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setUri(null)} />
        : <View style={[StyleSheet.absoluteFill, styles.imageFallback]}><Text style={styles.robin}>🐦</Text><Text>{title}</Text></View>}
    </View>
  );
}

type Screen =
  | 'welcome' | 'login' | 'access' | 'forgot' | 'terms' | 'about' | 'password'
  | 'inicio' | 'explorar' | 'reservas' | 'publicar' | 'entregas' | 'notificaciones'
  | 'perfil' | 'configuracion' | 'ayuda' | 'contacto' | 'usuarios' | 'publicaciones'
  | 'reportes' | 'estadisticas' | 'solicitudes' | 'mas' | 'detalle';

const demoAccounts = [
  { role: 'Administrador · Admin Robin Food', email: 'admin@robinfood.mx', password: 'Admin#2026' },
  { role: 'Donador · Pastelerías Esperanza (Hidalgo)', email: 'donador@robinfood.mx', password: 'Donador#2026' },
  { role: 'Receptor · Casa Hogar Alegría', email: 'receptor@robinfood.mx', password: 'Receptor#2026' },
];
const imageFallback = 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=800&q=80';
const visibleDemo = isDemoMode;
const categoryLabels: Record<Category, string> = { frutas: 'Frutas', verduras: 'Verduras', pan: 'Panadería', otros: 'Preparados y otros' };

export function RobinFoodApp() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const storeUser = useAppStore((state) => state.user);
  const database = useAppStore((state) => state.database);
  const ready = useAppStore((state) => state.ready);
  const initializationError = useAppStore((state) => state.initializationError);
  const hydrate = useAppStore((state) => state.hydrate);
  const setUser = useAppStore((state) => state.setUser);
  const refresh = useAppStore((state) => state.refresh);
  const logout = useAppStore((state) => state.logout);
  const [page, setPage] = useState<Screen>('welcome');
  const [previousPage, setPreviousPage] = useState<Screen>('login');
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | 'todas'>('todas');
  const [sort, setSort] = useState<'recientes' | 'cercanas' | 'vencen'>('recientes');
  const dark = storeUser?.prefs.darkMode === 'dark';
  const [showDemo, setShowDemo] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [initialTermsPending, setInitialTermsPending] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accessModal, setAccessModal] = useState(false);
  const [termsOnLogin, setTermsOnLogin] = useState(false);
  const [requestType, setRequestType] = useState<'alta' | 'reset_password'>('alta');
  const [requestName, setRequestName] = useState('');
  const [requestRole, setRequestRole] = useState<Role>('receptor');
  const [requestMessage, setRequestMessage] = useState('');
  const [publishTitle, setPublishTitle] = useState('');
  const [publishQuantity, setPublishQuantity] = useState('5');
  const [publishUnit, setPublishUnit] = useState<Donation['unit']>('kg');
  const [publishCategory, setPublishCategory] = useState<Category>('frutas');
  const [publishAddress, setPublishAddress] = useState(TOLUCA.address);
  const [publishPoint, setPublishPoint] = useState<(typeof possibleSurplusLocations)[number] | null>(null);
  const [publishPhoto, setPublishPhoto] = useState(isDemoMode ? imageFallback : '');
  const [publishPhotos, setPublishPhotos] = useState<string[]>([]);
  const [publishDriveUrl, setPublishDriveUrl] = useState('');
  const [publishDuration, setPublishDuration] = useState<'15m' | '30m' | '1h' | '3h' | 'custom' | 'manual'>('3h');
  const [customDurationMinutes, setCustomDurationMinutes] = useState('60');
  const [deliveryCode, setDeliveryCode] = useState('');
  const [selectedReservation, setSelectedReservation] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('donador');
  const [tempPassword, setTempPassword] = useState('');
  const [supportText, setSupportText] = useState('');
  const [activeConversation, setActiveConversation] = useState('');
  const [impact, setImpact] = useState({ rescuedKg: 0, meals: 0, co2Kg: 0, deliveries: 0 });
  const [mapLocations, setMapLocations] = useState<MapLocation[]>([]);

  const currentUser = storeUser;
  const accountData = database;
  const allDonations = useMemo(() => accountData?.donations ?? [], [accountData]);
  const allReservations = accountData?.reservations ?? [];
  const userReservations = allReservations.filter((reservation) => currentUser && (
    currentUser.role === 'admin' || (currentUser.role === 'receptor' && reservation.receptorId === currentUser.id)
    || (currentUser.role === 'donador' && reservation.donorId === currentUser.id)
  ));
  const userDonations = allDonations.filter((donation) => currentUser && (currentUser.role === 'admin' || donation.donorId === currentUser.id));
  const filteredDonations = useMemo(() => {
    const userLat = currentUser?.prefs.location ? currentUser.lat ?? TOLUCA.lat : TOLUCA.lat;
    const userLng = currentUser?.prefs.location ? currentUser.lng ?? TOLUCA.lng : TOLUCA.lng;
    const filtered = allDonations.filter((item) => item.status === 'disponible'
      && (currentUser?.role !== 'donador' || item.donorId === currentUser.id)
      && (category === 'todas' || item.category === category)
      && `${item.title} ${item.address} ${categoryLabels[item.category]}`.toLowerCase().includes(search.toLowerCase()));
    return filtered.sort((a, b) => {
      if (sort === 'vencen') {
        if (a.availableUntil === null) return b.availableUntil === null ? 0 : 1;
        if (b.availableUntil === null) return -1;
        return a.availableUntil.localeCompare(b.availableUntil);
      }
      if (sort === 'cercanas') return haversineKm(userLat, userLng, a.lat, a.lng) - haversineKm(userLat, userLng, b.lat, b.lng);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [allDonations, category, currentUser, search, sort]);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (window.localStorage.getItem('robinfood:termsAccepted:v1') !== 'true') {
      setInitialTermsPending(true);
      setAccepted(false);
    }
  }, []);
  useEffect(() => {
    if (ready && storeUser) {
      const timer = setTimeout(() => {
        if (storeUser.mustChangePassword) setPage('password');
        else if (storeUser.acceptedTermsVersion !== TERMS_VERSION) {
          setTermsOnLogin(true);
          setPage('terms');
        } else setPage((screen) => ['welcome', 'login'].includes(screen) ? 'inicio' : screen);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [ready, storeUser]);
  useEffect(() => {
    if (toast.length === 0) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!currentUser || isDemoMode) return;
    let active = true;
    void getMapLocations().then((locations) => {
      if (active) setMapLocations(locations);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las ubicaciones.');
    });
    return () => { active = false; };
  }, [currentUser]);
  useEffect(() => {
    if (!currentUser && !isDemoMode) return undefined;
    let active = true;
    const update = async () => {
      try {
        await expireStaleRecords();
        await refresh();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron actualizar las publicaciones vencidas.');
      }
    };
    const timer = setInterval(update, 60_000);
    void getImpact().then(setImpact).catch((reason: unknown) => {
      if (active && currentUser) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el impacto.');
    });
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [currentUser, refresh]);

  const notify = (text: string) => { setError(''); setToast(text); };
  const run = async (operation: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
      if (success) notify(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ocurrió un error. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  const afterAuthentication = async (result: Awaited<ReturnType<typeof signIn>>) => {
    await setUser(result.user);
    if (result.mustChangePassword) setPage('password');
    else if (result.requiresTerms) { setTermsOnLogin(true); setAccepted(false); setPage('terms'); }
    else setPage('inicio');
  };
  const login = async () => {
    setBusy(true);
    setError('');
    try { await afterAuthentication(await signIn(email, password)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.'); }
    finally { setBusy(false); }
  };
  const acceptLegal = async () => {
    if (!accepted || !currentUser) { setError('Marca la casilla para aceptar los términos.'); return; }
    setBusy(true);
    setError('');
    try {
      await acceptTerms(currentUser.id);
      await setUser({
        ...currentUser,
        acceptedTermsVersion: TERMS_VERSION,
        acceptedTermsAt: new Date().toISOString(),
      });
      setTermsOnLogin(false);
      setPage('inicio');
      setToast('Términos aceptados.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la aceptación.');
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => { await logout(); setPage('login'); setError(''); };
  const setSelectedPhoto = (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.mimeType?.startsWith('image/')) { setError('El archivo debe ser una imagen.'); return; }
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setError('La imagen debe pesar 5 MB o menos.'); return; }
    if (!publishPhotos.includes(asset.uri) && publishPhotos.length >= 4) { setError('Puedes adjuntar hasta cuatro fotos.'); return; }
    setPublishPhotos((photos) => photos.includes(asset.uri) ? photos : [...photos, asset.uri]);
    setPublishPhoto(asset.uri);
  };
  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError('Permite el acceso a fotos desde la configuración del dispositivo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 4,
    });
    if (!result.canceled) {
      const selected = result.assets.filter((asset) => !publishPhotos.includes(asset.uri));
      if (selected.length > 4 - publishPhotos.length) setError('Puedes adjuntar hasta cuatro fotos.');
      selected.slice(0, 4 - publishPhotos.length).forEach(setSelectedPhoto);
    }
  };
  const chooseCameraImage = async () => {
    if (!currentUser?.prefs.camera) { setError('Activa el permiso de cámara desde Configuración.'); return; }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setError('Permite el acceso a la cámara desde la configuración del dispositivo.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]?.uri) setSelectedPhoto(result.assets[0]);
  };
  const doPublish = async () => {
    if (!currentUser) return;
    const durations: Record<Exclude<typeof publishDuration, 'custom' | 'manual'>, number> = {
      '15m': 15, '30m': 30, '1h': 60, '3h': 180,
    };
    const durationMinutes = publishDuration === 'manual' ? null
      : publishDuration === 'custom' ? Number(customDurationMinutes)
        : durations[publishDuration];
    if (durationMinutes !== null && (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1)) {
      setError('La duración personalizada debe ser un número entero de minutos mayor que cero.');
      return;
    }
    const expiresAt = durationMinutes === null ? null : Date.now() + durationMinutes * 60_000;
    if (expiresAt !== null && !Number.isFinite(new Date(expiresAt).getTime())) {
      setError('La duración seleccionada supera el límite admitido.');
      return;
    }
    const availableUntil = expiresAt === null ? null : new Date(expiresAt).toISOString();
    let published = false;
    await run(async () => {
      await publishDonation(currentUser.id, {
        title: publishTitle, description: 'Alimento en buen estado. Coordina la recolección por Robin Food.',
        category: publishCategory, quantity: Number(publishQuantity), unit: publishUnit,
        photos: publishPhotos.length ? publishPhotos : [publishPhoto], address: publishAddress,
        lat: publishPoint?.latitude ?? (currentUser.prefs.location ? currentUser.lat ?? TOLUCA.lat : TOLUCA.lat),
        lng: publishPoint?.longitude ?? (currentUser.prefs.location ? currentUser.lng ?? TOLUCA.lng : TOLUCA.lng),
        availableUntil,
      });
      setPublishTitle('');
      setPublishPhotos([]);
      setPublishPhoto(isDemoMode ? imageFallback : '');
      setPublishDriveUrl('');
      setPublishPoint(null);
      setPublishAddress(TOLUCA.address);
      published = true;
    }, 'Donación publicada y receptores cercanos notificados.');
    if (published) setPage('inicio');
  };
  const reserve = async (donation: Donation) => {
    if (!currentUser) return;
    await run(async () => {
      const { reserveDonation } = await import('@/services/foodService');
      const reservationId = await reserveDonation(currentUser.id, donation.id);
      const db = await snapshot();
      const reservation = db.reservations.find((item) => item.id === reservationId);
      setSelectedReservation(reservationId);
      setToast(`¡Reserva confirmada! Código ${reservation?.code.slice(0, 3)}-${reservation?.code.slice(3)}.`);
    });
    setPage('reservas');
  };
  const validateCode = async () => {
    if (!currentUser || !selectedReservation) { setError('Selecciona una reserva activa primero.'); return; }
    await run(() => validateDelivery(currentUser.id, selectedReservation, deliveryCode), '¡Entrega realizada! Gracias por ser parte de Robin Food.');
    setDeliveryCode('');
  };
  const saveProfile = async () => {
    if (!currentUser) return;
    await run(async () => {
      const user = await updateProfile(currentUser.id, profileName, profilePhone);
      await setUser(user);
    }, 'Perfil actualizado.');
  };
  const updatePreference = async (key: 'notifications' | 'location' | 'darkMode' | 'language', value: boolean | 'system' | 'light' | 'dark' | 'es' | 'en') => {
    if (!currentUser) return;
    await run(async () => {
      const user = await updatePreferences(currentUser.id, { [key]: value } as Partial<PublicUser['prefs']>);
      await setUser(user);
    }, 'Preferencia guardada.');
  };
  const setDevicePermission = async (key: 'location' | 'camera') => {
    if (!currentUser) return;
    await run(async () => {
      const enabled = currentUser.prefs[key];
      if (!enabled) {
        if (key === 'location') {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted) throw new Error('No se autorizó el acceso a ubicación.');
          const position = await Location.getCurrentPositionAsync({});
          const user = await updateLocation(currentUser.id, position.coords.latitude, position.coords.longitude);
          await setUser(user);
          return;
        }
        if (key === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) throw new Error('No se autorizó el acceso a la cámara.');
        }
      }
      const user = await updatePreferences(currentUser.id, { [key]: !enabled });
      await setUser(user);
    }, 'Permiso actualizado.');
  };

  const admin = currentUser?.role === 'admin';
  const nav: { key: Screen; title: string; icon: typeof Home }[] = currentUser?.role === 'admin'
    ? [{ key: 'inicio', title: 'Resumen', icon: Home }, { key: 'usuarios', title: 'Usuarios', icon: Users }, { key: 'publicaciones', title: 'Publicaciones', icon: Utensils }, { key: 'reportes', title: 'Reportes', icon: BarChart3 }, { key: 'mas', title: 'Más', icon: Menu }]
    : currentUser?.role === 'donador'
      ? [{ key: 'inicio', title: 'Inicio', icon: Home }, { key: 'publicar', title: 'Publicar', icon: Plus }, { key: 'entregas', title: 'Mis entregas', icon: Clipboard }, { key: 'notificaciones', title: 'Avisos', icon: Bell }, { key: 'perfil', title: 'Perfil', icon: UserRound }]
      : [{ key: 'inicio', title: 'Inicio', icon: Home }, { key: 'explorar', title: 'Explorar', icon: Search }, { key: 'reservas', title: 'Mis reservas', icon: Clipboard }, { key: 'notificaciones', title: 'Avisos', icon: Bell }, { key: 'perfil', title: 'Perfil', icon: UserRound }];

  if (!ready) return <View style={styles.loading}><Text style={styles.robin}>🐦</Text><Text style={styles.brand}>ROBIN FOOD</Text><Text style={styles.muted}>Comparte. Aprovecha. Reduce.</Text></View>;

  const renderWelcome = () => (
    <View style={styles.authPanel}>
      <Text style={styles.robin}>🐦</Text><Text style={styles.brand}>ROBIN FOOD</Text>
      <Text style={styles.hero}>Comparte.{"\n"}Aprovecha.{"\n"}Reduce.</Text>
      <Text style={styles.body}>Conectamos alimentos que pueden aprovecharse con personas y comunidades de Toluca.</Text>
      <Button label="Comenzar" onPress={() => setPage('login')} />
      <View style={styles.row}><Button secondary label="Términos" onPress={() => setPage('terms')} /><Button secondary label="Acerca de" onPress={() => setPage('about')} /></View>
    </View>
  );
  const renderLogin = () => (
    <View style={styles.authPanel}>
      <Text style={styles.robin}>🐦</Text><Text style={styles.brand}>ROBIN FOOD</Text>
      <Heading>Bienvenida/o</Heading><Text style={styles.muted}>Inicia sesión para continuar</Text>
      <Label>Correo electrónico</Label>
      <TextField autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="tu@correo.com" value={email} onChangeText={setEmail} returnKeyType="next" />
      <Label>Contraseña</Label>
      <TextField secureTextEntry autoComplete="current-password" placeholder="Tu contraseña" value={password} onChangeText={setPassword} onSubmitEditing={() => void login()} returnKeyType="go" />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {initializationError ? <Text accessibilityRole="alert" style={styles.error}>{initializationError}</Text> : null}
      <Button label={busy ? 'Validando…' : 'Entrar'} disabled={busy} onPress={() => void login()} />
      <Pressable onPress={() => { setRequestType('reset_password'); setPage('forgot'); }} accessibilityRole="link"><Text style={styles.link}>¿Olvidaste tu contraseña?</Text></Pressable>
      {visibleDemo ? <Card style={styles.demoBox}><Pressable onPress={() => setShowDemo(!showDemo)} accessibilityRole="button"><Text style={styles.strong}>Cuentas demo {showDemo ? '−' : '+'}</Text></Pressable>{showDemo ? demoAccounts.map((account) => <Pressable key={account.email} style={styles.chip} onPress={() => { setEmail(account.email); setPassword(account.password); }}><Text style={styles.chipText}>{account.role} · {account.email}</Text></Pressable>) : null}</Card> : null}
      <Text style={styles.bodySmall}>¿No tienes cuenta? El acceso lo otorga administración.</Text>
      <Button secondary label="Solicitar acceso" onPress={() => { setRequestType('alta'); setPage('access'); }} />
      <View style={styles.row}><Button secondary label="Términos" onPress={() => setPage('terms')} /><Button secondary label="Acerca de" onPress={() => setPage('about')} /></View>
    </View>
  );
  const renderPublicRequest = () => (
    <View style={styles.formPanel}>
      <Pressable style={styles.back} onPress={() => setPage('login')}><ArrowLeft size={18} color={palette.ink} /><Text>Regresar</Text></Pressable>
      <Heading>{requestType === 'reset_password' ? 'Solicitar restablecimiento' : 'Solicitar acceso'}</Heading>
      <Text style={styles.muted}>{requestType === 'reset_password' && !isDemoMode
        ? 'Te enviaremos un enlace de recuperación si el correo está registrado.'
        : 'La solicitud se enviará al equipo administrador. No hay registro público.'}</Text>
      {requestType === 'alta' ? <><Label>Nombre</Label><TextField placeholder="Tu nombre" value={requestName} onChangeText={setRequestName} /><Label>Rol deseado</Label><View style={styles.row}><Button secondary label={requestRole === 'receptor' ? '✓ Receptor' : 'Receptor'} onPress={() => setRequestRole('receptor')} /><Button secondary label={requestRole === 'donador' ? '✓ Donador' : 'Donador'} onPress={() => setRequestRole('donador')} /></View></> : null}
      <Label>Correo</Label><TextField autoCapitalize="none" keyboardType="email-address" placeholder="tu@correo.com" value={email} onChangeText={setEmail} />
      {requestType === 'alta' ? <><Label>Mensaje (opcional)</Label><TextField multiline placeholder="Cuéntanos cómo podemos ayudarte" value={requestMessage} onChangeText={setRequestMessage} style={styles.multiline} /></> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={requestType === 'reset_password' ? 'Enviar enlace de recuperación' : 'Enviar solicitud'} onPress={() => void run(async () => {
        if (requestType === 'reset_password' && !isDemoMode) {
          await requestPasswordReset(email);
        } else if (requestType === 'alta') {
          const subject = encodeURIComponent(`Solicitud para ser ${requestRole === 'donador' ? 'donador' : 'receptor'} - ${requestName || email}`);
          const body = encodeURIComponent(`Hola Robin Food,\n\nQuiero solicitar acceso como ${requestRole === 'donador' ? 'donador' : 'receptor'}.\n\nNombre: ${requestName || 'No especificado'}\nCorreo: ${email}\n\nMotivo:\n${requestRequestMessage(requestMessage)}\n\nSaludos.`);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=erik.osbaldovm@gmail.com&su=${subject}&body=${body}`, '_blank', 'noopener,noreferrer');
          } else {
            await Linking.openURL(`mailto:erik.osbaldovm@gmail.com?subject=${subject}&body=${body}`);
          }
          await requestAccess({ type: 'alta', name: requestName || email, email, desiredRole: requestRole, message: requestRequestMessage(requestMessage) });
          setAccessModal(true);
        } else {
          await requestAccess({ type: 'reset_password', name: requestName || 'Solicitud de restablecimiento', email, desiredRole: requestRole, message: requestMessage });
        }
        setPage('login');
      }, requestType === 'reset_password' && !isDemoMode
        ? 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.'
        : 'Solicitud enviada. Administración te contactará con una contraseña temporal.')} />
    </View>
  );
  const renderPasswordChange = () => (
    <View style={styles.formPanel}><Heading>Cambia tu contraseña</Heading><Text style={styles.muted}>Crea una contraseña con 8 caracteres, mayúscula, número y símbolo.</Text>
      <TextField secureTextEntry placeholder="Nueva contraseña" value={newPassword} onChangeText={setNewPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Guardar contraseña" onPress={() => currentUser && void run(async () => {
        await updatePassword(currentUser.id, newPassword);
        await setUser({ ...currentUser, mustChangePassword: false });
        if (currentUser.acceptedTermsVersion !== TERMS_VERSION) { setTermsOnLogin(true); setPage('terms'); } else setPage('inicio');
      }, 'Contraseña actualizada.')} />
    </View>
  );
  const renderTerms = () => (
    <View style={styles.panel}>
      <Pressable style={styles.back} onPress={() => setPage(currentUser ? 'inicio' : 'login')}><ArrowLeft size={18} color={palette.ink} /><Text>Regresar</Text></Pressable>
      <Heading>Términos y condiciones</Heading><Text style={styles.muted}>Versión {TERMS_VERSION} · Última actualización: 5 de noviembre de 2026</Text>
      <View style={styles.row}><Button secondary label="Términos" onPress={() => undefined} /><Button secondary label="Privacidad" onPress={() => setToast('Aviso de privacidad incluido al final de este documento.')} /></View>
      <ScrollView style={styles.legalBox}>
        {LEGAL_SECTIONS.map(([title, body]) => <View key={title} style={styles.legalSection}><Text style={styles.strong}>{title}</Text><Text style={styles.body}>{body}</Text></View>)}
        <Text style={styles.bodySmall}>Este documento es una plantilla informativa; debe ser revisado por un profesional jurídico antes de operar comercialmente.</Text>
      </ScrollView>
      {termsOnLogin && currentUser ? <Pressable style={styles.row} onPress={() => setAccepted(!accepted)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }}><View style={styles.checkbox}>{accepted ? <Check size={16} color={palette.ink} /> : null}</View><Text style={styles.body}>He leído y acepto los Términos y el Aviso de Privacidad.</Text></Pressable> : null}
      {termsOnLogin ? <Button label="Aceptar y continuar" onPress={() => void acceptLegal()} /> : null}
    </View>
  );
  const renderAbout = () => (
    <View style={styles.panel}><Pressable style={styles.back} onPress={() => setPage(currentUser ? 'perfil' : 'login')}><ArrowLeft size={18} color={palette.ink} /><Text>Regresar</Text></Pressable>
      <View style={styles.center}><Text style={styles.robin}>🐦</Text><Heading>Robin Food</Heading><Text style={styles.brandSlogan}>Comparte. Aprovecha. Reduce.</Text></View>
      <Card><Text style={styles.strong}>Qué es Robin Food</Text><Text style={styles.body}>Conectamos negocios y personas con alimentos excedentes con quienes los necesitan, reduciendo el desperdicio y fortaleciendo la comunidad en Toluca y alrededores. Inspirado en Robin Hood: quitarle al desperdicio para darle a quien lo necesita.</Text></Card>
      <Heading>Cómo funciona</Heading><View style={styles.grid}><Card><Text style={styles.strong}>1 · Publica</Text><Text>El donador comparte alimentos disponibles.</Text></Card><Card><Text style={styles.strong}>2 · Reserva</Text><Text>El receptor aparta y recibe un código.</Text></Card><Card><Text style={styles.strong}>3 · Recoge</Text><Text>Se valida la entrega y se estima el impacto.</Text></Card></View>
      <Heading>Impacto en vivo · estimación</Heading><View style={styles.metrics}><Metric label="kg rescatados" value={impact.rescuedKg} /><Metric label="Entregas" value={impact.deliveries} /><Metric label="CO₂e evitado" value={`${impact.co2Kg} kg`} /></View>
      <Card><Text style={styles.strong}>Hecho por</Text><Text>Robin Food · tecnología para una comunidad que comparte.</Text><Button secondary label="Sígueme en Instagram · @osbaldomoto" accessibilityLabel="Abrir Instagram de osbaldomoto" onPress={() => void Linking.openURL('https://www.instagram.com/osbaldomoto/')} /></Card>
      <Text style={styles.muted}>© 2026 Robin Food. Todos los derechos reservados.</Text>
    </View>
  );
  if (!currentUser) {
    return <ThemeContext.Provider value={dark}><LanguageContext.Provider value="es"><SafeAreaView style={[styles.safe, dark && styles.darkSafe]}><View style={[styles.authWrap, isDesktop && styles.authDesktop]}>
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        {initialTermsPending
          ? <View style={styles.panel}><Heading>Términos y condiciones</Heading><ScrollView style={styles.legalBox}>{LEGAL_SECTIONS.map(([title, body]) => <View key={title} style={styles.legalSection}><Text style={styles.strong}>{title}</Text><Text style={styles.body}>{body}</Text></View>)}</ScrollView><Pressable style={styles.row} onPress={() => setAccepted(!accepted)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }}><View style={styles.checkbox}>{accepted ? <Check size={16} color={palette.ink} /> : null}</View><Text style={styles.body}>He leído y acepto los Términos y el Aviso de Privacidad.</Text></Pressable><Button label="Aceptar" disabled={!accepted} onPress={() => { if (Platform.OS === 'web' && typeof window !== 'undefined') window.localStorage.setItem('robinfood:termsAccepted:v1', 'true'); setInitialTermsPending(false); setAccepted(false); }} /></View>
          : page === 'welcome' ? renderWelcome() : page === 'access' || page === 'forgot' ? renderPublicRequest() : page === 'terms' ? renderTerms() : page === 'about' ? renderAbout() : renderLogin()}
      </ScrollView>
    </View>{toast ? <Toast text={toast} /> : null}{accessModal ? <AccessThanksModal onClose={() => setAccessModal(false)} /> : null}</SafeAreaView></LanguageContext.Provider></ThemeContext.Provider>;
  }

  const renderDonationCard = (donation: Donation) => {
    const distance = haversineKm(currentUser.prefs.location ? currentUser.lat ?? TOLUCA.lat : TOLUCA.lat, currentUser.prefs.location ? currentUser.lng ?? TOLUCA.lng : TOLUCA.lng, donation.lat, donation.lng);
    const donor = accountData?.users.find((user) => user.id === donation.donorId);
    return <Card key={donation.id} style={styles.donationCard}>
      <Pressable onPress={() => { setPreviousPage(page); setSelectedDonation(donation); setPage('detalle'); }} accessibilityRole="button" accessibilityLabel={`Ver ${donation.title}`} style={{ gap: 10 }}>
        <DonationPhoto path={donation.photos[0]} title={donation.title} style={styles.foodImage} />
        <Text style={styles.strong}>{donation.title}</Text><Text style={styles.body}>{donation.quantity} {donation.unit} · {categoryLabels[donation.category]}</Text>
        <Text style={styles.muted}>{donation.donorDisplayName ?? donor?.businessName ?? donor?.name ?? 'Donador Robin Food'} · {distance.toFixed(1)} km</Text>
        <Text numberOfLines={1} style={styles.muted}><MapPin size={14} color={palette.goldDark} /> {donation.address}</Text>
      </Pressable>
      {currentUser.role === 'receptor' ? <Button label="Ver y reservar" onPress={() => void reserve(donation)} /> : <Button secondary label="Ver detalle" onPress={() => { setSelectedDonation(donation); setPage('detalle'); }} />}
      {currentUser.role === 'donador' && donation.donorId === currentUser.id && donation.status === 'disponible' ? <Button danger label="Cancelar publicación" onPress={() => void run(() => cancelDonation(currentUser.id, donation.id, 'Cancelada por el donador.'), 'Publicación cancelada.')} /> : null}
    </Card>;
  };

  const renderFilters = () => <View style={styles.filterPanel}>
    <View style={styles.row}><Search size={18} color={palette.muted} /><TextField placeholder="Buscar alimentos o ubicación" value={search} onChangeText={setSearch} style={styles.searchInput} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {(['todas', 'frutas', 'verduras', 'pan', 'otros'] as const).map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.filterChip, category === item && styles.filterChipActive]}><Text style={category === item ? styles.chipText : styles.bodySmall}>{item === 'todas' ? 'Todas' : categoryLabels[item]}</Text></Pressable>)}
    </ScrollView>
    <View style={styles.row}>{(['recientes', 'cercanas', 'vencen'] as const).map((item) => <Pressable key={item} onPress={() => setSort(item)} style={[styles.filterChip, sort === item && styles.filterChipActive]}><Text style={styles.bodySmall}>{item === 'recientes' ? 'Más recientes' : item === 'cercanas' ? 'Más cercanas' : 'Vencen pronto'}</Text></Pressable>)}</View>
  </View>;

  const renderHome = () => {
    if (admin) {
      const historical = accountData?.reports.at(-1);
      const cards = [
        ['Usuarios', (accountData?.users.length ?? 0) + (historical?.users ?? 0)],
        ['Donaciones', (accountData?.donations.length ?? 0) + (historical?.donations ?? 0)],
        ['Reservas', (accountData?.reservations.length ?? 0) + (historical?.reservations ?? 0)],
        ['Entregas', impact.deliveries],
      ];
      return <View style={styles.content}>
        <Heading>Panel de administración</Heading><Text style={styles.muted}>Actividad local · Toluca y alrededores</Text>
        <View style={styles.metrics}>{cards.map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} dark />)}</View>
        <View style={styles.grid}>
          <Card><Text style={styles.strong}>Solicitudes pendientes</Text><Text style={styles.body}>{accountData?.accessRequests.filter((item) => item.status === 'pendiente').length ?? 0} por revisar</Text><Button secondary label="Revisar solicitudes" onPress={() => setPage('solicitudes')} /></Card>
          <Card><Text style={styles.strong}>Impacto estimado</Text><Text style={styles.body}>{impact.rescuedKg} kg · {impact.meals} raciones · {impact.co2Kg} kg CO₂e</Text><Button secondary label="Ver estadísticas" onPress={() => setPage('estadisticas')} /></Card>
        </View>
        <Heading>Actividad reciente</Heading>
        {(accountData?.auditLog.slice(-5).reverse() ?? []).map((entry) => <Card key={entry.id}><Text style={styles.strong}>{entry.action} · {entry.entity}</Text><Text style={styles.muted}>{entry.detail ?? entry.entityId} · {new Date(entry.createdAt).toLocaleString('es-MX')}</Text></Card>)}
      </View>;
    }
    if (currentUser.role === 'donador') {
      return <View style={styles.content}>
        <View style={styles.heroCard}><Text style={styles.eyebrow}>ROBIN FOOD · DONADOR</Text><Heading>Hola, {currentUser.name.split(' ')[0]}</Heading><Text style={styles.body}>Comparte alimentos en buen estado con tu comunidad.</Text><Button label="Publicar donación" onPress={() => setPage('publicar')} /></View>
        <Heading>Mis publicaciones</Heading>
        {userDonations.length ? <View style={styles.grid}>{userDonations.slice(0, 6).map(renderDonationCard)}</View> : <EmptyState text="Aún no tienes publicaciones." action="Publicar alimentos" onPress={() => setPage('publicar')} />}
        <Button secondary label="Validar entrega" onPress={() => setPage('entregas')} />
      </View>;
    }
    return <View style={styles.content}>
      <View style={styles.heroCard}><Text style={styles.eyebrow}>TOLUCA, ESTADO DE MÉXICO</Text><Heading>Alimentos cerca de ti</Heading><Text style={styles.body}>Comparte. Aprovecha. Reduce.</Text></View>
      <MapPanel
        donations={filteredDonations}
        locations={mapLocations}
        selectedDonation={selectedDonation}
        receptorLocation={currentUser.prefs.location && currentUser.lat != null && currentUser.lng != null ? { lat: currentUser.lat, lng: currentUser.lng } : null}
      />
      {renderFilters()}
      <View style={styles.rowBetween}><Heading>Donaciones cerca de ti</Heading><Text style={styles.muted}>{filteredDonations.length} disponibles</Text></View>
      {filteredDonations.length ? <View style={styles.grid}>{filteredDonations.map(renderDonationCard)}</View> : <EmptyState text="No encontramos donaciones con esos filtros." action="Quitar filtros" onPress={() => { setSearch(''); setCategory('todas'); }} />}
    </View>;
  };

  const renderReservations = () => {
    const active = userReservations.filter((item) => item.status === 'confirmada');
    const done = userReservations.filter((item) => item.status !== 'confirmada');
    return <View style={styles.content}><Heading>{currentUser.role === 'receptor' ? 'Mis reservas' : 'Reservas y entregas'}</Heading>
      {active.length === 0 ? <EmptyState text="No tienes reservas activas." action="Explorar donaciones" onPress={() => setPage('explorar')} /> : null}
      {[...active, ...done].map((reservation) => {
        const donation = allDonations.find((item) => item.id === reservation.donationId);
        if (!donation) return null;
        const receiver = accountData?.users.find((user) => user.id === reservation.receptorId);
        return <Card key={reservation.id}>
          <Text style={styles.strong}>{donation.title}</Text><Text style={styles.body}>{reservation.status === 'confirmada' ? 'Confirmada' : reservation.status === 'entregada' ? 'Entregada' : reservation.status === 'cancelada' ? 'Cancelada' : 'Expirada'}</Text>
          {reservation.status === 'confirmada' && currentUser.role === 'receptor' ? <><Text style={styles.muted}>Código de entrega</Text><Text accessibilityLabel={`Código ${reservation.code}`} style={styles.code}>{reservation.code.slice(0, 3)}-{reservation.code.slice(3)}</Text><Button secondary label="Copiar código" onPress={() => void ClipboardAPI.setStringAsync(reservation.code).then(() => notify('Código copiado.'))} /><Button secondary label="Cancelar reserva" danger onPress={() => void run(() => cancelReservation(currentUser.id, reservation.id), 'Reserva cancelada.')} /></> : null}
          {reservation.status === 'confirmada' && currentUser.role !== 'receptor' ? <Text style={styles.body}>Receptor: {receiver?.name ?? 'Cuenta Robin Food'}</Text> : null}
          <Text style={styles.muted}>{donation.address}</Text>
          <Button secondary label="Cómo llegar" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${donation.lat},${donation.lng}`)} />
        </Card>;
      })}
    </View>;
  };

  const renderPublish = () => <View style={styles.formPanel}>
    <Heading>Publicar donación</Heading><Text style={styles.muted}>Paso 1 de 4 · Alimentos para compartir</Text>
    <View style={styles.row}>
      <Button secondary label="Elegir de galería" onPress={() => void chooseImage()} />
      <Button secondary label="Tomar foto" onPress={() => void chooseCameraImage()} />
    </View>
    {publishPhoto
      ? <Image source={{ uri: publishPhoto }} style={styles.publishImage} />
      : <View style={[styles.publishImage, styles.imageFallback]}><Text style={styles.robin}>🐦</Text><Text>Selecciona una foto para tu publicación</Text></View>}
    <Label>Enlace público de Google Drive</Label>
    <TextField
      autoCapitalize="none"
      placeholder="https://drive.google.com/file/d/..."
      value={publishDriveUrl}
      onChangeText={(value) => {
        setPublishDriveUrl(value);
        setPublishPhoto(value);
        setPublishPhotos(value.trim() ? [value.trim()] : []);
      }}
    />
    <Button secondary label="Abrir carpeta de fotos en Drive" onPress={() => void Linking.openURL('https://drive.google.com/drive/folders/1KfdGtxix6gpkZTN0jKhBIASgrdEo4IZ7?usp=sharing').catch(() => setError('No se pudo abrir Google Drive.'))} />
    <Text style={styles.muted}>Sube la foto a Google Drive, abre “Compartir” y activa “Cualquier persona con el enlace” como lector. Pegando el enlace no se requiere Firebase Storage.</Text>
    <Label>Nombre del alimento</Label><TextField placeholder="Ej. Manzanas rojas" value={publishTitle} onChangeText={setPublishTitle} maxLength={60} />
    <Label>Categoría</Label><View style={styles.row}>{(['frutas', 'verduras', 'pan', 'otros'] as const).map((value) => <Button key={value} secondary label={publishCategory === value ? `✓ ${categoryLabels[value]}` : categoryLabels[value]} onPress={() => setPublishCategory(value)} />)}</View>
    <Label>Cantidad y unidad</Label><View style={styles.row}><TextField keyboardType="decimal-pad" value={publishQuantity} onChangeText={setPublishQuantity} style={styles.flexInput} />{(['kg', 'piezas', 'porciones', 'litros', 'cajas'] as const).map((unit) => <Pressable key={unit} onPress={() => setPublishUnit(unit)} style={[styles.filterChip, publishUnit === unit && styles.filterChipActive]}><Text>{unit}</Text></Pressable>)}</View>
    <Label>Ubicación de recolección</Label><TextField value={publishAddress} onChangeText={(value) => { setPublishAddress(value); setPublishPoint(null); }} />
    <Text style={styles.muted}>También puedes usar un punto sugerido para fijar la publicación en el mapa.</Text>
    <View style={styles.row}>{possibleSurplusLocations.map((point) => <Button key={point.name} secondary={publishPoint?.name !== point.name} label={point.name} onPress={() => { setPublishAddress(point.address); setPublishPoint(point); }} />)}</View>
    <Label>Duración de la publicación</Label>
    <View style={styles.row}>
      {([
        ['15m', '15 minutos'], ['30m', '30 minutos'], ['1h', '1 hora'],
        ['3h', '3 horas'], ['custom', 'Personalizada'], ['manual', 'Hasta eliminarla'],
      ] as const).map(([value, label]) => (
        <Button key={value} secondary={publishDuration !== value} label={label} onPress={() => setPublishDuration(value)} />
      ))}
    </View>
    {publishDuration === 'custom' ? <TextField keyboardType="number-pad" placeholder="Duración personalizada en minutos" value={customDurationMinutes} onChangeText={setCustomDurationMinutes} /> : null}
    <Text style={styles.muted}>{publishDuration === 'manual' ? 'La publicación seguirá activa hasta que el donador la elimine.' : 'La publicación se ocultará automáticamente al vencer el plazo seleccionado.'}</Text>
    <Text style={styles.muted}>{currentUser.prefs.location ? 'Usa tu ubicación autorizada.' : 'Ubicación de referencia: Toluca. Activa ubicación en Configuración para usar el GPS.'}</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}<Button label={busy ? 'Publicando…' : 'Publicar donación'} disabled={busy} onPress={() => void doPublish()} />
  </View>;

  const renderDeliveries = () => {
    const active = userReservations.filter((item) => item.status === 'confirmada');
    return <View style={styles.content}><Heading>Validar entrega</Heading><Text style={styles.muted}>Selecciona la reserva y captura el código de 6 caracteres del receptor.</Text>
      {active.length === 0 ? <EmptyState text="No hay entregas pendientes de validar." action="Volver al inicio" onPress={() => setPage('inicio')} /> : null}
      {active.map((item) => {
        const donation = allDonations.find((entry) => entry.id === item.donationId);
        const receiver = accountData?.users.find((user) => user.id === item.receptorId);
        return <Pressable key={item.id} onPress={() => setSelectedReservation(item.id)} style={[styles.reservationChoice, selectedReservation === item.id && styles.selectedChoice]}><Text style={styles.strong}>{donation?.title ?? 'Donación'}</Text><Text>{receiver?.name ?? 'Receptor'}</Text></Pressable>;
      })}
      <TextField autoCapitalize="characters" maxLength={7} placeholder="K7M-4PX" value={deliveryCode} onChangeText={(text) => setDeliveryCode(text.toUpperCase())} />
      {error ? <Text style={styles.error}>{error}</Text> : null}<Button label="Confirmar entrega" onPress={() => void validateCode()} />
      {userDonations.map((donation) => <Card key={donation.id}><Text style={styles.strong}>{donation.title}</Text><Text>{donation.status}</Text></Card>)}
    </View>;
  };

  const renderNotifications = () => {
    const notices = accountData?.notifications.filter((item) => item.userId === currentUser.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [];
    return <View style={styles.content}><View style={styles.rowBetween}><Heading>Notificaciones</Heading><Pressable onPress={() => void run(() => markNotificationsRead(currentUser.id), 'Notificaciones marcadas como leídas.')}><Text style={styles.link}>Marcar todas leídas</Text></Pressable></View>
      {notices.length === 0 ? <EmptyState text="No tienes notificaciones." action="Ir al inicio" onPress={() => setPage('inicio')} /> : notices.map((notice) => <Pressable key={notice.id} onPress={() => notice.entityId && (setSelectedDonation(allDonations.find((item) => item.id === notice.entityId) ?? null), setPage('detalle'))}><Card style={[styles.notice, !notice.read && styles.unread]}><Text style={styles.strong}>{notice.title}</Text><Text>{notice.body}</Text><Text style={styles.muted}>{new Date(notice.createdAt).toLocaleString('es-MX')}</Text></Card></Pressable>)}
    </View>;
  };

  const renderProfile = () => <View style={styles.content}><Heading>Mi perfil</Heading><Card style={styles.profileHero}><Text style={styles.avatar}>{currentUser.name.slice(0, 1).toUpperCase()}</Text><Text style={styles.strong}>{currentUser.name}</Text><Text style={styles.muted}>{roleName(currentUser.role)} · {currentUser.email}</Text></Card>
    <Label>Nombre</Label><TextField value={profileName || currentUser.name} onChangeText={setProfileName} /><Label>Teléfono</Label><TextField keyboardType="phone-pad" value={profilePhone || currentUser.phone || ''} onChangeText={setProfilePhone} placeholder="Opcional" /><Button label="Guardar perfil" onPress={() => void saveProfile()} />
    <Button secondary label="Mis publicaciones" onPress={() => setPage(currentUser.role === 'donador' ? 'inicio' : 'reservas')} />
    {['configuracion', 'ayuda', 'contacto', 'terms', 'about'].map((route) => <Button key={route} secondary label={routeLabel(route)} onPress={() => setPage(route as Screen)} />)}
    <Button secondary label="Cerrar sesión" onPress={() => void signOut()} />
  </View>;

  const renderSettings = () => <View style={styles.content}><Heading>Configuración</Heading>
    <ToggleRow title="Avisos dentro de la app" detail="Mostrar novedades y avisos en tu bandeja local." value={currentUser.prefs.notifications} onPress={() => void updatePreference('notifications', !currentUser.prefs.notifications)} />
    <Text style={styles.muted}>Los avisos se sincronizan dentro de la aplicación. Las notificaciones push aún no están disponibles.</Text>
    <ToggleRow title="Ubicación" detail="Usar GPS para distancias y publicar donaciones." value={currentUser.prefs.location} onPress={() => void setDevicePermission('location')} />
    <ToggleRow title="Cámara" detail="Permitir tomar fotos de alimentos desde la cámara." value={currentUser.prefs.camera} onPress={() => void setDevicePermission('camera')} />
    <ToggleRow title="Modo oscuro" detail="Tema oscuro de la aplicación" value={dark} onPress={() => void updatePreference('darkMode', dark ? 'light' : 'dark')} />
    <View style={styles.row}><Text style={styles.strong}>Idioma</Text><Button secondary label={currentUser.prefs.language === 'es' ? 'Español ✓' : 'Español'} onPress={() => void updatePreference('language', 'es')} /><Button secondary label={currentUser.prefs.language === 'en' ? 'English ✓' : 'English'} onPress={() => void updatePreference('language', 'en')} /></View>
    {Platform.OS === 'web'
      ? <Text style={styles.muted}>Los permisos del navegador se administran desde el icono de ajustes junto a la dirección del sitio.</Text>
      : <Button secondary label="Administrar permisos del dispositivo" onPress={() => void Linking.openSettings().catch(() => setError('No se pudieron abrir los ajustes del dispositivo.'))} />}
    <Button secondary label="Cambiar contraseña" onPress={() => setPage('password')} /><Button secondary label="Ver términos y privacidad" onPress={() => setPage('terms')} />
    {admin && isDemoMode ? <Button secondary danger label="Restablecer datos demo" onPress={() => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (window.confirm('Se reemplazarán los datos locales con la demostración inicial. ¿Continuar?')) void run(async () => { await resetDemo(); await logout(); setPage('login'); }, 'Datos demo restablecidos.');
      } else Alert.alert('Restablecer datos demo', 'Se reemplazarán los datos locales con la demostración inicial.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restablecer', style: 'destructive', onPress: () => void run(async () => { await resetDemo(); await logout(); setPage('login'); }, 'Datos demo restablecidos.') },
      ]);
    }} /> : null}
  </View>;

  const renderHelp = () => <View style={styles.content}><Heading>Centro de ayuda</Heading><TextField placeholder="Buscar una pregunta" value={search} onChangeText={setSearch} />
    {FAQ.filter(([question, answer]) => `${question} ${answer}`.toLowerCase().includes(search.toLowerCase())).map(([question, answer]) => <Card key={question}><Text style={styles.strong}>{question}</Text><Text>{answer}</Text></Card>)}
    <Button label="Contactar soporte" onPress={() => setPage('contacto')} />
  </View>;

  const renderContact = () => {
    const conversationIds = [...new Set((accountData?.messages ?? []).map((item) => item.conversationId))];
    const activeId = admin ? (activeConversation || conversationIds[0] || '') : currentUser.id;
    const messages = accountData?.messages.filter((item) => item.conversationId === activeId) ?? [];
    return <View style={styles.content}><Heading>Contacto y soporte</Heading><Text style={styles.muted}>{isDemoMode ? 'Conversación guardada localmente para esta demostración.' : 'Los mensajes se guardan y sincronizan de forma privada con el equipo de Robin Food.'}</Text>
      {admin ? <ScrollView horizontal contentContainerStyle={styles.row}>{conversationIds.map((conversationId) => {
        const sender = accountData?.users.find((user) => user.id === conversationId);
        return <Pressable key={conversationId} onPress={() => setActiveConversation(conversationId)} style={[styles.filterChip, activeId === conversationId && styles.filterChipActive]}><Text>{sender?.name ?? conversationId}</Text></Pressable>;
      })}</ScrollView> : null}
      <ScrollView style={styles.chat}>{messages.map((item) => <View key={item.id} style={[styles.chatBubble, item.fromUserId === currentUser.id ? styles.chatMine : styles.chatSupport]}><Text>{item.text}</Text><Text style={styles.tiny}>{new Date(item.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</Text></View>)}</ScrollView>
      <TextField multiline placeholder="Escribe tu mensaje" value={supportText} onChangeText={setSupportText} style={styles.multiline} />
      <Button label={admin ? 'Responder' : 'Enviar mensaje'} onPress={() => currentUser && void run(async () => {
        if (admin) {
          if (!activeId) throw new Error('Selecciona una conversación para responder.');
          await replySupportMessage(currentUser.id, activeId, supportText);
        } else await sendSupportMessage(currentUser.id, supportText);
        setSupportText('');
      }, admin ? 'Respuesta enviada.' : 'Mensaje enviado a soporte.')} />
    </View>;
  };

  const renderUsers = () => <View style={styles.content}><Heading>Gestión de usuarios</Heading><Text style={styles.muted}>{accountData?.users.length ?? 0} cuentas locales</Text>
    <Card><Text style={styles.strong}>Crear cuenta (solo administración)</Text><TextField placeholder="Nombre" value={newUserName} onChangeText={setNewUserName} /><TextField placeholder="Correo" autoCapitalize="none" value={newUserEmail} onChangeText={setNewUserEmail} />
      <View style={styles.row}>{(['donador', 'receptor'] as const).map((role) => <Button key={role} secondary label={newUserRole === role ? `✓ ${roleName(role)}` : roleName(role)} onPress={() => setNewUserRole(role)} />)}</View>
      {tempPassword ? <Card style={styles.tempCard}><Text style={styles.strong}>Contraseña temporal (cópiala ahora)</Text><Text selectable style={styles.code}>{tempPassword}</Text><Button secondary label="Copiar" onPress={() => void ClipboardAPI.setStringAsync(tempPassword).then(() => notify('Contraseña copiada.'))} /></Card> : null}
      <Button label="Crear usuario" onPress={() => currentUser && void run(async () => { const result = await createUser(currentUser.id, { role: newUserRole, name: newUserName, email: newUserEmail }); setTempPassword(result.temporaryPassword); setNewUserName(''); setNewUserEmail(''); }, 'Cuenta creada. Entrega la contraseña temporal de forma segura.')} />
    </Card>
    {(accountData?.users ?? []).filter((item) => item.status !== 'eliminado').map((user) => <Card key={user.id} style={styles.userCard}><Text style={styles.avatarSmall}>{user.name.slice(0, 1)}</Text><View style={styles.flex}><Text style={styles.strong}>{user.name}</Text><Text>{roleName(user.role)} · {user.email}</Text><Text style={styles.muted}>Estado: {user.status} · Último acceso: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('es-MX') : 'Sin registro'}</Text></View>
      {user.id !== currentUser.id ? <Button secondary label={user.status === 'suspendido' ? 'Reactivar' : 'Suspender'} onPress={() => void run(() => setUserStatus(currentUser.id, user.id, user.status === 'suspendido' ? 'activo' : 'suspendido', 'Acción solicitada desde administración.'))} /> : null}
    </Card>)}
  </View>;

  const renderPublications = () => <View style={styles.content}><Heading>Gestionar publicaciones</Heading><TextField placeholder="Buscar publicaciones" value={search} onChangeText={setSearch} />
    {allDonations.filter((item) => `${item.title} ${item.address}`.toLowerCase().includes(search.toLowerCase())).map((donation) => <Card key={donation.id}><Text style={styles.strong}>{donation.title}</Text><Text>{donation.status} · {donation.quantity} {donation.unit}</Text><Text style={styles.muted}>{donation.address}</Text><View style={styles.row}>
      <Button secondary label="Editar (marcar revisada)" onPress={() => currentUser && void run(() => moderateDonation(currentUser.id, donation.id, 'edit', 'Revisión administrativa de publicación.'))} />
      <Button danger label="Retirar" onPress={() => currentUser && void run(() => moderateDonation(currentUser.id, donation.id, 'remove', 'Retirada por moderación administrativa.'))} />
    </View></Card>)}
  </View>;

  const renderReports = () => <View style={styles.content}><Heading>Reportes e impacto</Heading><Text style={styles.muted}>Los indicadores de impacto son estimaciones, no certificaciones.</Text>
    <View style={styles.metrics}><Metric label="Alimento rescatado (estimación)" value={`${impact.rescuedKg} kg`} dark /><Metric label="Raciones (estimación)" value={impact.meals} dark /><Metric label="CO₂e (estimación)" value={`${impact.co2Kg} kg`} dark /></View>
    <Card><Text style={styles.strong}>Vista previa de exportación</Text><Text>Usuarios: {accountData?.users.length ?? 0} · Publicaciones: {allDonations.length} · Reservas: {allReservations.length}</Text><Text style={styles.bodySmall}>{isDemoMode ? 'Incluye datos de demostración locales.' : 'Incluye datos compartidos visibles para esta cuenta.'} Cifras de impacto estimadas.</Text>
      {(['users', 'donations', 'reservations'] as const).map((kind) => <Button key={kind} secondary label={`Exportar CSV · ${kind}`} onPress={() => void run(async () => downloadCsv(await exportCsv(kind), `${kind}-robinfood.csv`), `Exportación de ${kind} lista.`)} />)}
      <Button label="Imprimir / Guardar PDF" onPress={() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.print();
        else void Share.share({ message: `Robin Food · ${impact.rescuedKg} kg estimados rescatados. Cifras de impacto estimadas.` });
      }} />
    </Card><Button secondary label="Ver estadísticas" onPress={() => setPage('estadisticas')} />
  </View>;

  const renderStats = () => <View style={styles.content}><Heading>Estadísticas</Heading><Text style={styles.muted}>Tendencia histórica agregada · estimaciones</Text>
    <Card><Text style={styles.strong}>Donaciones vs. reservas</Text><View style={styles.chart}>{[42, 68, 51, 82, 61, 93, 73].map((height, index) => <View key={index} style={styles.barGroup}><View style={[styles.bar, { height }]} /><View style={[styles.bar, styles.barSecondary, { height: height * 0.66 }]} /><Text style={styles.tiny}>{['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul'][index]}</Text></View>)}</View><View style={styles.row}><Text>■ Donaciones</Text><Text style={styles.muted}>■ Reservas</Text></View></Card>
    <View style={styles.metrics}><Metric label="kg rescatados (estimación)" value={impact.rescuedKg} /><Metric label="Raciones (estimación)" value={impact.meals} /><Metric label="CO₂e (estimación)" value={`${impact.co2Kg} kg`} /></View>
  </View>;

  const renderRequests = () => <View style={styles.content}><Heading>Solicitudes de acceso</Heading>
    {(accountData?.accessRequests ?? []).filter((item) => item.status === 'pendiente').map((item) => <Card key={item.id}><Text style={styles.strong}>{item.name}</Text><Text>{item.type} · {item.email}</Text><Text>{item.message}</Text><View style={styles.row}><Button label="Aprobar" onPress={() => currentUser && void run(async () => {
      if (item.type === 'alta') {
        const created = await createUser(currentUser.id, { role: item.desiredRole ?? 'receptor', name: item.name, email: item.email });
        setTempPassword(created.temporaryPassword);
      }
      await acceptAccessRequestAsAdmin(currentUser.id, item.id, true, 'Aprobada por administración.');
    }, 'Solicitud aprobada. Revisa la contraseña temporal en Usuarios.')} /><Button danger label="Rechazar" onPress={() => currentUser && void run(() => acceptAccessRequestAsAdmin(currentUser.id, item.id, false, 'Solicitud revisada por administración.'))} /></View></Card>)}
    {(accountData?.accessRequests ?? []).filter((item) => item.status === 'pendiente').length === 0 ? <EmptyState text="No hay solicitudes pendientes." action="Volver al panel" onPress={() => setPage('inicio')} /> : null}
    <Button secondary label="Bandeja de soporte" onPress={() => setPage('contacto')} />
  </View>;

  const renderDonationDetail = () => {
    if (!selectedDonation) return <EmptyState text="No encontramos esa donación." action="Volver" onPress={() => setPage('inicio')} />;
    const donor = accountData?.users.find((user) => user.id === selectedDonation.donorId);
    return <View style={styles.content}><Pressable style={styles.back} onPress={() => setPage(previousPage)}><ArrowLeft size={18} color={palette.ink} /><Text>Regresar</Text></Pressable>
        <DonationPhoto path={selectedDonation.photos[0]} title={selectedDonation.title} style={styles.detailImage} />
      <Heading>{selectedDonation.title}</Heading><Text style={styles.body}>{selectedDonation.quantity} {selectedDonation.unit} · {categoryLabels[selectedDonation.category]}</Text>
      <Text style={styles.body}>{selectedDonation.description ?? 'Alimento disponible para compartir.'}</Text><Text style={styles.body}>Donador: {selectedDonation.donorDisplayName ?? donor?.businessName ?? donor?.name ?? 'Donador Robin Food'}</Text><Text style={styles.body}>{selectedDonation.address}</Text>
      {currentUser.role === 'receptor' ? <Button label="Reservar donación" onPress={() => void reserve(selectedDonation)} /> : null}
      <Button secondary label="Trazar ruta al donador" onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${currentUser.lat ?? TOLUCA.lat},${currentUser.lng ?? TOLUCA.lng}&destination=${selectedDonation.lat},${selectedDonation.lng}`).catch(() => setError('No se pudo abrir la ruta.'))} />
      <Button secondary label="Compartir" onPress={() => void Share.share({ message: `${selectedDonation.title} · ${selectedDonation.address}` })} />
    </View>;
  };

  const mainContent = page === 'inicio' ? renderHome()
    : page === 'explorar' ? <View style={styles.content}>{renderFilters()}<View style={styles.grid}>{filteredDonations.map(renderDonationCard)}</View></View>
    : page === 'reservas' ? renderReservations()
    : page === 'publicar' ? renderPublish()
    : page === 'entregas' ? renderDeliveries()
    : page === 'notificaciones' ? renderNotifications()
    : page === 'perfil' ? renderProfile()
    : page === 'configuracion' ? renderSettings()
    : page === 'ayuda' ? renderHelp()
    : page === 'contacto' ? renderContact()
    : page === 'usuarios' ? renderUsers()
    : page === 'publicaciones' ? renderPublications()
    : page === 'reportes' ? renderReports()
    : page === 'estadisticas' ? renderStats()
    : page === 'solicitudes' ? renderRequests()
    : page === 'mas' ? <View style={styles.content}><Heading>Más herramientas</Heading>{[['estadisticas', 'Estadísticas'], ['solicitudes', 'Solicitudes de acceso'], ['contacto', 'Bandeja de soporte'], ['configuracion', 'Configuración']].map(([key, title]) => <Button key={key} secondary label={title} onPress={() => setPage(key as Screen)} />)}</View>
    : page === 'detalle' ? renderDonationDetail()
    : page === 'terms' ? renderTerms()
    : page === 'about' ? renderAbout()
    : page === 'password' ? renderPasswordChange()
    : renderHome();

  const isAdminPage = admin && ['inicio', 'usuarios', 'publicaciones', 'reportes', 'estadisticas', 'solicitudes', 'mas'].includes(page);
  return <ThemeContext.Provider value={dark}><LanguageContext.Provider value={currentUser.prefs.language}><SafeAreaView style={[styles.safe, dark && styles.darkSafe]}>
    <View style={[styles.appShell, isDesktop && styles.desktopShell]}>
      {isDesktop ? <View style={[styles.sidebar, sidebarCollapsed && styles.sidebarCollapsed, isAdminPage && styles.sidebarDark]}>
        <View style={[styles.sideBrand, sidebarCollapsed && styles.sideBrandCollapsed]}>
          <Text style={styles.robinSmall}>🐦</Text>
          {!sidebarCollapsed ? <Text style={[styles.strong, isAdminPage && styles.white]}>ROBIN FOOD</Text> : null}
          {Platform.OS === 'web' ? <Pressable accessibilityRole="button" accessibilityLabel="Pantalla completa" onPress={() => void toggleFullscreen()} style={styles.fullscreenButton}><Text style={styles.fullscreenText}>⛶</Text></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={sidebarCollapsed ? 'Mostrar menú' : 'Ocultar menú'} onPress={() => setSidebarCollapsed((value) => !value)} style={styles.collapseButton}><Menu size={18} color={isAdminPage ? '#fff' : palette.ink} /></Pressable>
        </View>
        {nav.map((item) => <NavItem key={item.key} active={page === item.key} title={item.title} icon={item.icon} dark={dark || Boolean(isAdminPage)} collapsed={sidebarCollapsed} onPress={() => setPage(item.key)} />)}
        <View style={styles.sideSpacer} />
        <NavItem title="Configuración" icon={Settings} dark={dark || Boolean(isAdminPage)} collapsed={sidebarCollapsed} onPress={() => setPage('configuracion')} />
        <NavItem title="Ayuda" icon={CircleHelp} dark={dark || Boolean(isAdminPage)} collapsed={sidebarCollapsed} onPress={() => setPage('ayuda')} />
        <NavItem title="Cerrar sesión" icon={LogOut} dark={dark || Boolean(isAdminPage)} collapsed={sidebarCollapsed} onPress={() => void signOut()} />
      </View> : null}
      <View style={styles.main}>
        {!isDesktop ? <View style={styles.mobileHeader}><Text style={styles.brandSmall}>🐦 Robin Food</Text><View style={styles.row}><Pressable onPress={() => void toggleFullscreen()} accessibilityLabel="Pantalla completa"><Text>⛶</Text></Pressable><Pressable onPress={() => setPage('notificaciones')} accessibilityLabel="Abrir notificaciones"><Bell size={22} color={dark ? '#f4f1e8' : palette.ink} /></Pressable></View></View> : null}
        <ScrollView contentContainerStyle={[styles.scrollContent, isDesktop && styles.desktopContent]}>
          {error ? <Pressable onPress={() => setError('')}><Text accessibilityRole="alert" style={styles.errorBanner}>{error}  ×</Text></Pressable> : null}
          {mainContent}
          <View style={styles.footer}><Text style={styles.muted}>Robin Food · {roleName(currentUser.role)} · {isDemoMode ? 'Datos locales' : 'Red compartida'}</Text><Pressable onPress={() => setPage('terms')}><Text style={styles.link}>Términos y privacidad</Text></Pressable></View>
        </ScrollView>
        {!isDesktop ? <View style={styles.bottomNav}>{nav.map((item) => <NavItem key={item.key} active={page === item.key} title={item.title} icon={item.icon} dark={dark} compact onPress={() => setPage(item.key)} />)}</View> : null}
      </View>
    </View>
    {toast ? <Toast text={toast} /> : null}
  </SafeAreaView></LanguageContext.Provider></ThemeContext.Provider>;
}
function AccessThanksModal({ onClose }: { onClose: () => void }) {
  return <View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.robin}>🐦</Text><Heading>Gracias por contactarnos</Heading><Text style={styles.body}>Hemos recibido tu solicitud de acceso. Espera nuestra respuesta; el equipo de Robin Food revisará tu información.</Text><Button label="Cerrar" onPress={onClose} /></View></View>;
}
function Metric({ label, value, dark = false }: { label: string; value: string | number; dark?: boolean }) {
  return <Card style={[styles.metricCard, dark && styles.metricDark]}><Text style={[styles.metricValue, dark && styles.white]}>{value}</Text><Text style={[styles.muted, dark && styles.darkMuted]}>{label}</Text></Card>;
}
function Toast({ text }: { text: string }) {
  return <View pointerEvents="none" style={styles.toast}><Check color="#fff" size={18} /><Text style={styles.toastText}>{text}</Text></View>;
}
function EmptyState({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  return <Card style={styles.empty}><Text style={styles.robin}>🐦</Text><Text style={styles.body}>{text}</Text><Button secondary label={action} onPress={onPress} /></Card>;
}
function NavItem({ title, icon: Icon, active, compact, dark, collapsed = false, onPress }: { title: string; icon: typeof Home; active?: boolean; compact?: boolean; dark?: boolean; collapsed?: boolean; onPress: () => void }) {
  const language = useContext(LanguageContext);
  const [hovered, setHovered] = useState(false);
  return <Pressable
    accessibilityRole="tab"
    accessibilityState={{ selected: active }}
    accessibilityLabel={translate(title, language)}
    onHoverIn={() => setHovered(true)}
    onHoverOut={() => setHovered(false)}
    onPress={onPress}
    style={[compact ? styles.bottomTab : styles.navItem, collapsed && styles.navItemCollapsed, active && (dark ? styles.navActiveDark : styles.navActive)]}
  >
    <Icon size={20} color={active && dark ? palette.gold : active ? palette.ink : dark ? '#d9d4c8' : palette.muted} />{!collapsed ? <Text numberOfLines={1} style={[compact ? styles.tiny : styles.navText, dark && styles.darkMuted, active && styles.strong, active && dark && { color: palette.gold }]}>{title}</Text> : null}
    {collapsed && hovered ? <View pointerEvents="none" style={styles.navTooltip}><Text style={styles.navTooltipText}>{translate(title, language)}</Text></View> : null}
  </Pressable>;
}
function ToggleRow({ title, detail, value, onPress }: { title: string; detail: string; value: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: value }} style={styles.toggleRow}><View style={styles.flex}><Text style={styles.strong}>{title}</Text><Text style={styles.muted}>{detail}</Text></View><View style={[styles.toggle, value && styles.toggleOn]}><View style={[styles.toggleKnob, value && styles.toggleKnobOn]} /></View></Pressable>;
}
function roleName(role: Role) { return role === 'admin' ? 'Administración' : role === 'donador' ? 'Donador' : 'Receptor'; }
function requestRequestMessage(message: string) { return message.trim() || 'Me gustaría participar en Robin Food y apoyar a la comunidad.'; }
async function toggleFullscreen() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
}
function routeLabel(route: string) { return ({ configuracion: 'Configuración', ayuda: 'Ayuda y preguntas frecuentes', contacto: 'Contactar soporte', terms: 'Términos y condiciones', about: 'Acerca de Robin Food' } as Record<string, string>)[route] ?? route; }
function downloadCsv(csv: string, fileName: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Share.share({ message: csv });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

const FAQ = [
  ['¿Qué es Robin Food?', 'Una plataforma comunitaria que conecta donadores de alimentos excedentes con personas y organizaciones receptoras.'],
  ['¿Cómo publico alimentos?', 'Entra a Publicar, agrega una foto, nombre, categoría, cantidad, ubicación y disponibilidad.'],
  ['¿Cómo reservo?', 'Explora las donaciones disponibles y toca Reservar. Recibirás un código de entrega.'],
  ['¿Cómo uso el código de entrega?', 'Muéstralo al donador al recoger los alimentos; el donador lo captura para confirmar.'],
  ['¿Qué pasa si no llego a tiempo?', 'La reserva vence cuando termina la disponibilidad; contacta soporte si necesitas ayuda.'],
  ['¿Cómo cancelo?', 'Abre Mis reservas y cancela hasta una hora antes del vencimiento.'],
  ['¿Cómo obtengo una cuenta?', 'El acceso lo otorga administración; envía una solicitud desde Iniciar sesión.'],
  ['¿Qué alimentos se pueden donar?', 'Frutas, verduras, pan, alimentos preparados el mismo día y productos empacados vigentes en buen estado.'],
  ['¿Qué alimentos NO se deben donar?', 'Alimentos caducados, descompuestos o que requieran cadena de frío no comprobable; consulta siempre las reglas sanitarias.'],
  ['¿Cómo reporto un problema?', 'Usa Ayuda → Contactar soporte para enviar un mensaje local al equipo.'],
  ['¿Cómo cambio mi contraseña?', 'Abre Perfil → Configuración → Cambiar contraseña.'],
  ['¿Cómo se protegen mis datos?', 'Esta demostración almacena datos localmente; consulta el Aviso de Privacidad y no compartas credenciales.'],
];

const LEGAL_SECTIONS: [string, string][] = [
  ['Aviso importante', 'Versión 1.0 · Última actualización: 5 de noviembre de 2026. Robin Food es una demostración local. Este documento es una plantilla informativa y debe ser revisado por un profesional jurídico antes de operar comercialmente.'],
  ['1. Aceptación de los términos', 'Al iniciar sesión y usar Robin Food declaras que leíste, entendiste y aceptaste estos Términos y el Aviso de Privacidad. Si no estás de acuerdo, no debes usar la Aplicación. Los cambios de versión pueden requerir aceptación nuevamente.'],
  ['2. Definiciones', 'La Plataforma conecta a quienes tienen alimentos excedentes en buen estado con quienes los necesitan. Administrador gestiona cuentas, publicaciones y soporte; Donador publica alimentos; Receptor reserva y recoge; Donación es la publicación de alimentos; Reserva es el apartado temporal identificado con un código de entrega.'],
  ['3. Descripción del servicio', 'Robin Food facilita el contacto, ubicación y coordinación entre usuarios. No produce, almacena, transporta, vende ni distribuye alimentos y no es parte de la donación. Los alimentos se donan gratuitamente; no está permitido cobrar ni condicionar la entrega.'],
  ['4. Cuentas y acceso', 'El acceso es por invitación: no hay registro público. El administrador crea las cuentas. Protege tus credenciales, cambia la contraseña temporal, proporciona datos veraces y mantén la información actualizada. Las cuentas son personales. Debes ser mayor de edad o contar con autorización de tu tutor.'],
  ['5. Obligaciones del donador', 'Publica únicamente alimentos aptos para consumo, en buen estado y dentro de su vigencia. Describe cantidad, conservación y alérgenos conocidos; usa fotos reales; respeta higiene y cadena de frío aplicables (incluida NOM-251-SSA1-2009); indica ubicación y vigencia reales; valida la entrega con el código. No publiques alimentos descompuestos ni que hayan perdido refrigeración necesaria.'],
  ['6. Obligaciones del receptor', 'Reserva solo lo que puedas recoger, sigue las instrucciones y el horario, revisa el alimento antes de aceptarlo, informa al donador sobre alergias y presenta el código. No revendas alimentos ni compartas datos de otros usuarios.'],
  ['7. Reservas, códigos y entregas', 'Cada donación tiene una reserva activa. La primera reserva confirmada es válida. El código identifica la entrega y se confirma cuando el donador lo valida. La reserva vence con la publicación. El receptor puede cancelar hasta una hora antes; el donador puede cancelar con motivo y se notifica al receptor.'],
  ['8. Alimentos permitidos y prohibidos', 'Son ejemplos permitidos frutas, verduras, pan, preparados del día manejados higiénicamente y productos empacados vigentes. Se prohíben alimentos vencidos o descompuestos, empaques abiertos o dañados, alimentos que requieren refrigeración sin cadena comprobable, alcohol, tabaco, medicamentos y productos prohibidos por ley.'],
  ['9. Ubicación y permisos', 'La ubicación sirve para mostrar donaciones cercanas y situar publicaciones; es opcional y, si se rechaza, se usa Toluca como referencia. La aplicación puede solicitar cámara, fotos y notificaciones. Puedes revocar permisos desde Configuración o desde el dispositivo.'],
  ['10. Contenido del usuario', 'Eres responsable de los textos, fotos y mensajes que publicas y garantizas tener derecho a usarlos. Concedes una licencia limitada para mostrar el contenido dentro de la Plataforma. Se prohíbe contenido ofensivo, engañoso, discriminatorio o que exponga datos personales de terceros.'],
  ['11. Conducta prohibida', 'No suplantes identidades, acoses, amenaces, intentes acceder sin autorización, extraigas datos masivamente, introduzcas código malicioso, satures el servicio, publiques donaciones falsas ni reserves sin intención de recoger.'],
  ['12. Chat y soporte', 'El chat es para soporte; no compartas contraseñas, datos bancarios ni información sensible. Las conversaciones pueden conservarse para resolver incidencias y atender incumplimientos.'],
  ['13. Inocuidad y responsabilidad', 'Robin Food es un intermediario tecnológico. La responsabilidad de calidad, seguridad, inocuidad y etiquetado corresponde al donador; la decisión de consumir corresponde al receptor. Las estimaciones de impacto no son certificaciones. Ante síntomas, busca atención médica y avisa a soporte. Nada limita derechos irrenunciables reconocidos por la ley mexicana.'],
  ['14. Suspensión y terminación', 'Administración puede advertir, restringir, suspender o eliminar cuentas y contenidos que incumplan los términos o representen riesgos. Puedes pedir la baja a soporte. Se conservará lo estrictamente necesario para obligaciones legales y estadísticas anonimizadas.'],
  ['15. Disponibilidad y modo demostración', 'La aplicación se ofrece según disponibilidad y puede tener interrupciones. En esta versión los datos se almacenan localmente; borrar el almacenamiento puede eliminarlos. Las cuentas y datos demo son ficticios.'],
  ['16. Propiedad intelectual', 'El nombre, logotipo, diseño, código y textos pertenecen a sus titulares y están protegidos por la legislación aplicable. Las imágenes de terceros pertenecen a sus autores.'],
  ['17. Privacidad y datos personales', 'El tratamiento se rige por el Aviso de Privacidad y la LFPDPPP. Puedes ejercer acceso, rectificación, cancelación, oposición y revocar consentimiento contactando a soporte desde Ayuda → Contacto.'],
  ['18. Modificaciones', 'Robin Food puede modificar estos términos. Los cambios se notificarán en la Aplicación y podrán requerir nueva aceptación.'],
  ['19. Ley aplicable y jurisdicción', 'Se aplican las leyes de los Estados Unidos Mexicanos; para interpretación y cumplimiento se señalan los tribunales competentes de Toluca de Lerdo, Estado de México, conforme a la ley aplicable.'],
  ['20. Contacto', 'Para dudas, solicitudes ARCO o reportes usa Ayuda → Contacto dentro de la Aplicación o escribe por mensaje directo a Instagram @osbaldomoto.'],
  ['Aviso de Privacidad', 'Responsable: equipo Robin Food; contacto en la app e Instagram @osbaldomoto. Recabamos nombre, correo, teléfono, rol, estado e historial de accesos; publicaciones, reservas, notificaciones, mensajes, ubicación solo con permiso, fotos y preferencias. No recabamos datos sensibles ni financieros. Finalidades primarias: operar cuenta, coordinar donaciones y entregas, mostrar cercanía, notificar, soporte, seguridad y estadísticas anonimizadas. Finalidades secundarias: mejorar el servicio y reportar impacto agregado; puedes oponerte contactando soporte. El donador y receptor ven solo los datos necesarios para la entrega; no vendemos datos y solo transferimos a autoridades cuando la ley lo exige. En esta demostración, almacenamiento local en dispositivo/navegador; borrar datos puede eliminarlos. Usamos hash de contraseñas, controles de rol y auditoría como medidas de demo. Puedes ejercer derechos ARCO, revocar consentimiento y solicitar eliminación vía soporte. El almacenamiento local web permite persistencia de sesión/preferencias. Menores requieren autorización de su tutor. El aviso puede cambiar; actualización: 5 de noviembre de 2026.'],
];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.cream }, darkSafe: { backgroundColor: '#171717' },
  modalBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(17,17,17,0.58)', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 200 },
  modalCard: { width: '100%', maxWidth: 460, gap: 14, alignItems: 'center', padding: 24, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: palette.line },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ink, gap: 12 },
  authWrap: { flex: 1, justifyContent: 'center' }, authDesktop: { alignSelf: 'center', width: '100%', maxWidth: 520, paddingVertical: 30 },
  authScroll: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  authPanel: { gap: 12, padding: 24, borderRadius: 24, backgroundColor: '#fff', borderColor: palette.line, borderWidth: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  formPanel: { gap: 12, padding: 22, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: palette.line, width: '100%', maxWidth: 680, alignSelf: 'center' },
  panel: { padding: 20, gap: 16, backgroundColor: '#fff', borderRadius: 22, borderColor: palette.line, borderWidth: 1, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  appShell: { flex: 1, flexDirection: 'row', width: '100%', height: '100%' }, desktopShell: { alignSelf: 'center', width: '100%' },
  sidebar: { width: 246, padding: 18, backgroundColor: '#fff', borderRightColor: palette.line, borderRightWidth: 1, gap: 8 },
  sidebarCollapsed: { width: 72, paddingHorizontal: 10 },
  sideBrandCollapsed: { justifyContent: 'center', flexWrap: 'wrap' },
  collapseButton: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fullscreenButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fullscreenText: { fontSize: 18, color: palette.ink },
  sidebarDark: { backgroundColor: palette.ink, borderRightColor: '#333' }, sideBrand: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, marginBottom: 15 },
  sideSpacer: { flex: 1 }, main: { flex: 1, minWidth: 0 },   scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 18, width: '100%', alignSelf: 'center' }, desktopContent: { padding: 30 },
  mobileHeader: { height: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, backgroundColor: '#fff', borderBottomColor: palette.line, borderBottomWidth: 1 },
  brand: { textAlign: 'center', fontSize: 15, letterSpacing: 4, color: palette.goldDark, fontWeight: '800' }, brandSmall: { fontWeight: '800', color: palette.ink, fontSize: 17 }, brandSlogan: { color: palette.goldDark, fontWeight: '700' }, robin: { fontSize: 46, textAlign: 'center' }, robinSmall: { fontSize: 27 },
  hero: { fontSize: 44, lineHeight: 48, fontWeight: '900', color: palette.ink, letterSpacing: -1 }, body: { color: palette.inkSoft, fontSize: 15, lineHeight: 23 }, bodySmall: { color: palette.muted, fontSize: 13, lineHeight: 19 }, muted: { color: palette.muted, fontSize: 13, lineHeight: 20 }, strong: { color: palette.ink, fontWeight: '800', fontSize: 16 }, link: { color: palette.goldDark, fontWeight: '700', textDecorationLine: 'underline' }, error: { color: palette.danger, fontWeight: '600' }, errorBanner: { backgroundColor: '#ffefed', color: '#b6291f', padding: 12, borderRadius: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, center: { alignItems: 'center', gap: 8 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, content: { gap: 16 }, flex: { flex: 1, minWidth: 0 },
  demoBox: { backgroundColor: '#fffdf8' }, chip: { padding: 10, borderRadius: 20, backgroundColor: palette.cream, minHeight: 42, justifyContent: 'center' }, chipText: { color: palette.ink, fontWeight: '700', fontSize: 13 },
  heroCard: { padding: 22, gap: 11, backgroundColor: '#f5ead1', borderRadius: 22, borderWidth: 1, borderColor: '#ead7ad' }, eyebrow: { color: palette.goldDark, fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  filterPanel: { gap: 11, padding: 14, backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: palette.line }, searchInput: { flex: 1, borderWidth: 0, minHeight: 42, paddingHorizontal: 0 }, filterChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 22, borderWidth: 1, borderColor: palette.line, minHeight: 38, justifyContent: 'center' }, filterChipActive: { backgroundColor: palette.gold, borderColor: palette.goldDark },
  donationCard: { width: 285, flexGrow: 1, flexBasis: 230, overflow: 'hidden' },   foodImage: { height: 150, width: '100%', borderRadius: 12, backgroundColor: palette.cream }, publishImage: { height: 210, width: '100%', borderRadius: 15, backgroundColor: palette.cream }, detailImage: { width: '100%', height: 300, borderRadius: 18, backgroundColor: palette.cream }, imageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5ead1' },
  code: { textAlign: 'center', fontSize: 27, fontWeight: '900', letterSpacing: 5, color: palette.goldDark, paddingVertical: 8 }, notice: { borderLeftWidth: 4, borderLeftColor: palette.line }, unread: { borderLeftColor: palette.gold, backgroundColor: '#fffaf0' }, profileHero: { alignItems: 'center', padding: 24 }, avatar: { width: 64, height: 64, borderRadius: 32, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', backgroundColor: palette.gold, fontSize: 30, fontWeight: '800' }, avatarSmall: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: palette.gold, fontWeight: '800', fontSize: 19 }, userCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricCard: { flexGrow: 1, flexBasis: 145, minWidth: 130, padding: 15 }, metricDark: { backgroundColor: palette.ink, borderColor: '#303030' }, metricValue: { color: palette.ink, fontSize: 25, fontWeight: '900' }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, white: { color: '#fff' }, darkMuted: { color: '#c4beb2' },
  metricDarkText: { color: '#fff' }, footer: { paddingTop: 16, borderTopColor: palette.line, borderTopWidth: 1, gap: 7 }, bottomNav: { minHeight: 66, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#fff', borderTopColor: palette.line, borderTopWidth: 1, paddingHorizontal: 4, paddingBottom: 3 }, bottomTab: { minWidth: 52, maxWidth: 90, minHeight: 54, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12 }, navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 46, borderRadius: 12 }, navItemCollapsed: { justifyContent: 'center', paddingHorizontal: 10 }, navActive: { backgroundColor: '#f8efd9' }, navActiveDark: { backgroundColor: '#302919' }, navText: { color: palette.muted, fontWeight: '600', fontSize: 14 }, tiny: { fontSize: 10, color: palette.muted }, toast: { position: 'absolute', bottom: 86, left: 18, right: 18, minHeight: 48, padding: 13, borderRadius: 14, backgroundColor: palette.ink, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', zIndex: 100 }, toastText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  navTooltip: { position: 'absolute', left: 58, top: 8, zIndex: 300, backgroundColor: palette.ink, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  navTooltipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 24 }, back: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 }, multiline: { minHeight: 100, textAlignVertical: 'top' }, flexInput: { flex: 1, minWidth: 60 }, checkbox: { width: 24, height: 24, borderWidth: 1, borderRadius: 5, borderColor: palette.goldDark, alignItems: 'center', justifyContent: 'center' }, legalBox: { maxHeight: 420, padding: 12, backgroundColor: palette.cream, borderRadius: 12 }, legalSection: { paddingBottom: 14, gap: 4 }, tempCard: { backgroundColor: palette.cream },
  toggleRow: { minHeight: 67, padding: 13, borderRadius: 14, borderColor: palette.line, borderWidth: 1, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 14 }, toggle: { width: 49, height: 29, borderRadius: 16, backgroundColor: '#ddd', padding: 3, justifyContent: 'center' }, toggleOn: { backgroundColor: palette.gold }, toggleKnob: { width: 23, height: 23, borderRadius: 12, backgroundColor: '#fff' }, toggleKnobOn: { alignSelf: 'flex-end' }, reservationChoice: { padding: 14, borderRadius: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: palette.line, gap: 5 }, selectedChoice: { borderColor: palette.goldDark, backgroundColor: '#fff8e9' },
  chat: { maxHeight: 360 }, chatBubble: { padding: 12, borderRadius: 15, marginVertical: 5, maxWidth: '84%' }, chatMine: { alignSelf: 'flex-end', backgroundColor: '#f3e5c4' }, chatSupport: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: palette.line },   chart: { minHeight: 145, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingVertical: 14 }, barGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 }, bar: { width: 12, backgroundColor: palette.gold, borderTopLeftRadius: 5, borderTopRightRadius: 5 }, barSecondary: { backgroundColor: palette.inkSoft },
});
