export async function uriToCompressedImageData(uri: string, mimeType = 'image/jpeg', maxWidth = 900): Promise<string> {
  if (typeof document !== 'undefined' && /^blob:|^data:|^https?:/i.test(uri)) {
    return compressWithCanvas(uri, mimeType, maxWidth);
  }
  const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const type = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
  const dataUrl = `data:${type};base64,${base64}`;
  if (dataUrl.length > 500_000) {
    throw new Error('La imagen es demasiado grande para Firestore. Reduce el tamaño antes de publicarla.');
  }
  return dataUrl;
}

function compressWithCanvas(uri: string, mimeType: string, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(image.width, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const output = mimeType === 'image/png' ? 'image/png' : mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(output, output === 'image/png' ? undefined : 0.72);
      if (dataUrl.length > 500_000) {
        reject(new Error('La imagen es demasiado grande. Selecciona una versión más pequeña.'));
        return;
      }
      resolve(dataUrl);
    };
    image.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    image.src = uri;
  });
}
