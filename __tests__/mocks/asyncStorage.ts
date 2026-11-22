const data = new Map<string, string>();

const storage = {
  getItem: async (key: string) => data.get(key) ?? null,
  setItem: async (key: string, value: string) => { data.set(key, value); },
  removeItem: async (key: string) => { data.delete(key); },
  clear: async () => { data.clear(); },
  getAllKeys: async () => [...data.keys()],
  multiGet: async (keys: string[]) => keys.map((key) => [key, data.get(key) ?? null] as [string, string | null]),
  multiSet: async (entries: [string, string][]) => { for (const [key, value] of entries) data.set(key, value); },
  multiRemove: async (keys: string[]) => { for (const key of keys) data.delete(key); },
};

export default storage;
