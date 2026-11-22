import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Persistence } from 'firebase/auth';

class ReactNativePersistence {
  static readonly type = 'LOCAL';
  readonly type = 'LOCAL';

  async _isAvailable(): Promise<boolean> {
    try {
      await AsyncStorage.setItem('firebase:auth:availability', '1');
      await AsyncStorage.removeItem('firebase:auth:availability');
      return true;
    } catch {
      return false;
    }
  }

  async _set(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('No se pudo persistir la sesión de Firebase.');
    await AsyncStorage.setItem(key, serialized);
  }

  async _get<T>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(key);
    return value === null ? null : JSON.parse(value) as T;
  }

  async _remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }

  _addListener(_key: string, _listener: (value: unknown) => void): void {}

  _removeListener(_key: string, _listener: (value: unknown) => void): void {}
}

export const reactNativePersistence: Persistence = ReactNativePersistence;
