export const copyTextToClipboard = async (value: string) => {
  const text = value.trim();
  if (!text) return false;

  try {
    const desktopResult = await window.judicialDesktop?.copyToClipboard?.(text);
    if (desktopResult?.ok) return true;
  } catch {
    // Continue with browser fallbacks when the desktop bridge is unavailable.
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Some Electron contexts do not grant navigator.clipboard permission.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.left = '-9999px';
  textarea.style.position = 'fixed';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
};
