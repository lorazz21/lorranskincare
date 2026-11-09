// Reduz as fotos antes de guardar: ocupam bem menos espaço e continuam nítidas.
// O navegador já aplica a rotação do celular (EXIF) ao desenhar a imagem.

const FULL_MAX = 1600; // lado maior da foto guardada, em pixels
const THUMB_MAX = 480; // lado maior da miniatura

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não consegui abrir essa imagem.'));
    };
    img.src = url;
  });
}

function resize(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0; // libera a memória do canvas (importante no iPhone)
      if (blob) resolve({ blob, width, height });
      else reject(new Error('Não consegui processar essa imagem.'));
    }, 'image/jpeg', quality);
  });
}

/** Foto da câmera ou da galeria → { blob, thumb, width, height } em JPEG. */
export async function prepareImage(file) {
  const img = await loadImage(file);
  const full = await resize(img, FULL_MAX, 0.85);
  const thumb = await resize(img, THUMB_MAX, 0.8);
  return { blob: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
}

/** Miniatura de uma foto já guardada (usada ao importar backup). */
export async function makeThumb(blob) {
  const img = await loadImage(blob);
  return (await resize(img, THUMB_MAX, 0.8)).blob;
}
