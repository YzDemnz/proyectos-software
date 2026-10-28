import * as ImagePicker from 'expo-image-picker';

const MAX_IMAGE_BYTES = 600 * 1024;
const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function estimateBase64Bytes(value: string) {
  return Math.ceil((value.length * 3) / 4);
}

export async function pickImageDataUri() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permite acceso a tus fotos para agregar el logo.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    base64: true,
    mediaTypes: ['images'],
    quality: 0.72,
  });

  if (result.canceled) {
    throw new Error('No se selecciono ninguna foto.');
  }

  const asset = result.assets[0];
  if (!asset?.base64) {
    throw new Error('No se pudo preparar la foto.');
  }

  const size = asset.fileSize || estimateBase64Bytes(asset.base64);
  if (size > MAX_IMAGE_BYTES) {
    throw new Error('Usa una foto menor a 600 KB.');
  }

  const mimeType = SAFE_IMAGE_TYPES.has(asset.mimeType || '')
    ? asset.mimeType
    : 'image/jpeg';

  return `data:${mimeType};base64,${asset.base64}`;
}
