import React, { useContext } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { palette } from '@/theme/palette';
import { LanguageContext, ThemeContext, translate } from '@/theme/AppContext';

export function Button({ label, secondary, danger, style, ...props }: Omit<PressableProps, 'style'> & { label: string; secondary?: boolean; danger?: boolean; style?: StyleProp<ViewStyle> }) {
  const dark = useContext(ThemeContext);
  const language = useContext(LanguageContext);
  const translatedLabel = translate(label, language);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? translatedLabel}
      style={({ pressed }) => [styles.button, dark && styles.darkButton, secondary && styles.secondary, secondary && dark && styles.darkSecondary, danger && styles.danger, pressed && styles.pressed, style]}
      {...props}
    >
      <Text style={[styles.buttonText, dark && styles.darkButtonText, secondary && styles.secondaryText, secondary && dark && styles.darkSecondaryText]}>{translatedLabel}</Text>
    </Pressable>
  );
}

export function Card({ children, style, ...props }: ViewProps) {
  const dark = useContext(ThemeContext);
  return <View style={[styles.card, style, dark && styles.darkCard]} {...props}>{children}</View>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  const dark = useContext(ThemeContext);
  const language = useContext(LanguageContext);
  return <Text accessibilityRole="header" style={[styles.heading, dark && styles.darkText]}>{typeof children === 'string' ? translate(children, language) : children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const dark = useContext(ThemeContext);
  const language = useContext(LanguageContext);
  return <Text style={[styles.label, dark && styles.darkText]}>{typeof children === 'string' ? translate(children, language) : children}</Text>;
}

export function TextField(props: React.ComponentProps<typeof TextInput>) {
  const dark = useContext(ThemeContext);
  const language = useContext(LanguageContext);
  const placeholder = props.placeholder ? translate(props.placeholder, language) : undefined;
  return <TextInput {...props} placeholder={placeholder} accessibilityLabel={props.accessibilityLabel ?? placeholder} style={[styles.input, dark && styles.darkInput, props.style]} placeholderTextColor={dark ? '#bcb8ae' : palette.muted} />;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 19, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.gold, borderWidth: 1, borderColor: palette.goldDark },
  darkButton: { backgroundColor: '#d9ae5f' },
  secondary: { backgroundColor: '#fff', borderColor: palette.line },
  darkSecondary: { backgroundColor: '#292929', borderColor: '#454545' },
  danger: { backgroundColor: palette.danger, borderColor: palette.danger },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonText: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  darkButtonText: { color: '#171717' },
  secondaryText: { color: palette.ink },
  darkSecondaryText: { color: '#f4f1e8' },
  card: { borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: '#fff', padding: 17, gap: 10, shadowColor: '#271c05', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  darkCard: { backgroundColor: '#242424', borderColor: '#3b3b3b', shadowOpacity: 0 },
  heading: { color: palette.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  darkText: { color: '#f4f1e8' },
  label: { color: palette.inkSoft, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#fff', borderColor: palette.line, borderWidth: 1, borderRadius: 12, color: palette.ink, fontSize: 16 },
  darkInput: { backgroundColor: '#202020', borderColor: '#454545', color: '#f4f1e8' },
});
