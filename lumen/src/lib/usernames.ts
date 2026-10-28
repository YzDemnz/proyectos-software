export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function usernameError(value: string): string | null {
  return normalizeUsername(value) ? null : 'Escribe un nombre de usuario.';
}
