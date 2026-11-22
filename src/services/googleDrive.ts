type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  error?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => GoogleTokenClient;
          revoke: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_FOLDER_ID = process.env.EXPO_PUBLIC_GOOGLE_DRIVE_FOLDER_ID || '1KfdGtxix6gpkZTN0jKhBIASgrdEo4IZ7';
let tokenClient: GoogleTokenClient | null = null;
let accessToken: string | null = null;

export function getGoogleDriveFolderId(): string {
  return DRIVE_FOLDER_ID;
}

export async function loadGoogleIdentityServices(): Promise<void> {
  if (typeof document === 'undefined') throw new Error('Google Drive solo está disponible en navegador web.');
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Identity Services.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'));
    document.head.appendChild(script);
  });
}

export async function connectGoogleDrive(): Promise<string> {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error('Falta EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID en el entorno.');
  await loadGoogleIdentityServices();
  if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services no está disponible.');
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error || !response.access_token) {
          pendingReject?.(new Error(response.error || 'No se pudo autorizar Google Drive.'));
          return;
        }
        accessToken = response.access_token;
        pendingResolve?.(response.access_token);
      },
      error_callback: (error) => {
        pendingReject?.(new Error(typeof error === 'object' && error ? 'Google no autorizó la carpeta.' : 'No se pudo autorizar Google Drive.'));
      },
    });
  }
  return new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    tokenClient?.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });
}

let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;

export function isGoogleDriveConnected(): boolean {
  return accessToken !== null;
}

export function disconnectGoogleDrive(): void {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
}

export async function uploadImageToGoogleDrive(uri: string, fileName: string): Promise<string> {
  if (!accessToken) await connectGoogleDrive();
  const response = await fetch(uri);
  if (!response.ok) throw new Error('No se pudo leer la foto seleccionada.');
  const blob = await response.blob();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
    throw new Error('Usa una imagen JPG, PNG o WebP.');
  }
  if (blob.size > 10 * 1024 * 1024) throw new Error('La imagen debe pesar 10 MB o menos.');

  const metadata = {
    name: fileName,
    mimeType: blob.type,
    parents: [DRIVE_FOLDER_ID],
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, fileName);

  const upload = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!upload.ok) throw new Error(`Google Drive rechazó la subida (${upload.status}).`);
  const file = await upload.json() as { id: string };
  if (!file.id) throw new Error('Google Drive no devolvió el identificador de la foto.');

  const permission = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!permission.ok) throw new Error('La foto se subió, pero no pudo hacerse pública.');

  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(file.id)}&sz=w1200`;
}
