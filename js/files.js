// Entrega arquivos gerados pelo app (backup, evento de calendário).

/** Baixa um arquivo sem sair da página. */
export function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * No iPhone, abre o menu Compartilhar (dá para "Salvar em Arquivos", AirDrop, e-mail…).
 * Onde não houver, baixa o arquivo. Retorna 'shared' | 'downloaded' | 'cancelled'.
 */
export async function shareOrDownload(text, filename, type) {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  download(file);
  return 'downloaded';
}
