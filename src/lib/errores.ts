/** Errores de negocio devueltos por las RPC (RAISE EXCEPTION ... USING HINT). */
export type CodigoError =
  | 'STOCK_INSUFICIENTE'
  | 'TOTAL_DESACTUALIZADO'
  | 'CATALOGO_DESACTUALIZADO'
  | 'TURNO_CERRADO'
  | 'TURNO_YA_ABIERTO'
  | 'PIN_INVALIDO'
  | 'PIN_BLOQUEADO'
  | 'CREDENCIAL_REQUERIDA';

export class ErrorOperacion extends Error {
  readonly codigo: CodigoError | null;
  constructor(mensaje: string, codigo: string | null | undefined) {
    super(mensaje);
    this.name = 'ErrorOperacion';
    this.codigo = (codigo as CodigoError) || null;
  }
}

type ErrorPostgrest = { message: string; hint?: string | null; code?: string | null };

export function errorDesdePostgrest(err: ErrorPostgrest): ErrorOperacion {
  if (err.code === '42501') return new ErrorOperacion('No tenés permisos para esta operación.', null);
  if (err.code === 'PGRST301' || /JWT/i.test(err.message)) {
    return new ErrorOperacion('Tu sesión expiró. Volvé a iniciar sesión.', null);
  }
  if (/Failed to fetch|NetworkError|fetch failed/i.test(err.message)) {
    return new ErrorOperacion('Sin conexión con el servidor. Revisá internet y reintentá.', null);
  }
  return new ErrorOperacion(err.message || 'Error inesperado', err.hint ?? null);
}
