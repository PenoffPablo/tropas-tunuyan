/** Configuración pública de la tienda (variables NEXT_PUBLIC_*, con valores por defecto). */
export const TIENDA = {
  nombre: 'Tropas Tunuyán',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_TIENDA || '5492622000000',
  alias: process.env.NEXT_PUBLIC_ALIAS_COBRO || 'TROPAS.TUNUYAN.MP',
  titular: process.env.NEXT_PUBLIC_TITULAR_COBRO || 'Tropas Tunuyán',
  cvu: process.env.NEXT_PUBLIC_CVU_COBRO || '',
  ubicacion: 'Tunuyán, Valle de Uco, Mendoza',
  /** Dirección oficial del sitio (sin barra final). Vacía = rutas relativas al dominio actual. */
  urlSitio: (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, ''),
} as const;

export function urlWhatsAppTienda(mensaje?: string): string {
  const base = `https://wa.me/${TIENDA.whatsapp}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}

/** Colores de muestra para los chips de color. */
export const COLOR_DOTS: Record<string, string> = {
  negro: '#18181b',
  'verde oliva': '#556b2f',
  oliva: '#556b2f',
  marrón: '#5c4033',
  marron: '#5c4033',
  coyote: '#81613c',
  arena: '#c2b280',
  azul: '#1e3a8a',
  'azul marino': '#172554',
  gris: '#6b7280',
  blanco: '#f8fafc',
  multicolor: 'conic-gradient(#556b2f, #c2b280, #18181b, #556b2f)',
  único: '#3f3f46',
  unico: '#3f3f46',
};

export function colorDot(color: string): string {
  return COLOR_DOTS[color.trim().toLowerCase()] ?? '#71717a';
}
