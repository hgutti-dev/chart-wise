// Anti open-redirect (FR-012, SC-009). Helper PURO: dada una `callbackUrl` no confiable
// (query param controlado por el usuario), devuelve una ruta interna segura o el fallback.
// Solo se acepta una ruta relativa same-origin; cualquier URL absoluta, protocol-relative
// o con truco de backslash se descarta.
const DEFAULT_REDIRECT = "/profile";

export function resolveInternalRedirect(
  callbackUrl: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof callbackUrl !== "string" || callbackUrl.length === 0) {
    return fallback;
  }

  // Debe empezar por una sola "/". Se rechaza "//host" (protocol-relative) y "/\host"
  // (backslash, que los navegadores normalizan a "//"), ambos rutas hacia otro origen.
  if (callbackUrl[0] !== "/" || callbackUrl[1] === "/" || callbackUrl[1] === "\\") {
    return fallback;
  }

  // Red de seguridad: resolver contra un origen ficticio y confirmar que no escapó de él.
  try {
    const base = "https://internal.invalid";
    const resolved = new URL(callbackUrl, base);
    if (resolved.origin !== base) {
      return fallback;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
