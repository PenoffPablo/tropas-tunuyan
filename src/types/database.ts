/**
 * Tipos de la base de datos de Tropas Tunuyán — sincronizados con database/schema.sql (v2).
 *
 * IMPORTANTE: las filas se declaran con `type` (no `interface`) porque supabase-js
 * exige que sean asignables a Record<string, unknown>; con interfaces el cliente
 * tipado colapsa a `never`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/* ─────────────────────────── Filas ─────────────────────────── */

export type Categoria = {
  id: string;
  nombre: string;
  /** Identificador estable para URLs (lo genera la base). */
  slug: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type Producto = {
  id: string;
  nombre: string;
  /** Identificador estable para URLs (lo genera la base). */
  slug: string;
  descripcion: string | null;
  precio: number;
  costo: number;
  porcentaje_ganancia: number;
  exige_credencial: boolean;
  categoria_id: string | null;
  imagen_url: string | null;
  /** Etiquetas libres (fuerza, línea, temporada…) para filtros futuros. */
  etiquetas: string[];
  activo: boolean;
  created_at: string;
  updated_at: string;
};

/** Columnas visibles para el público (anon no puede leer costo ni margen). */
export type ProductoPublico = Omit<Producto, 'costo' | 'porcentaje_ganancia'>;

export type Variante = {
  id: string;
  producto_id: string;
  sku: string | null;
  codigo_barras: string | null;
  talle: string;
  color: string;
  /** Precio propio de la variante; null = rige el del producto. */
  precio: number | null;
  /** Costo propio de la variante; null = rige el del producto. */
  costo: number | null;
  stock: number;
  stock_minimo: number;
  created_at: string;
  updated_at: string;
};

/** Columnas de variantes visibles para el público (sin costo ni códigos internos). */
export type VariantePublica = Omit<Variante, 'costo' | 'sku' | 'codigo_barras'>;

/** Columnas que pide el catálogo público (anon solo puede leer estas). */
export const COLUMNAS_PRODUCTO_PUBLICO =
  'id, nombre, slug, descripcion, precio, exige_credencial, categoria_id, imagen_url, etiquetas, activo, created_at, updated_at';
/**
 * Columnas de productos/variantes legibles con sesión. Los COSTOS no se leen
 * directo (ni el vendedor ni el admin): el admin los pide con la RPC costos_catalogo().
 */
export const COLUMNAS_PRODUCTO_PANEL = COLUMNAS_PRODUCTO_PUBLICO;
export const COLUMNAS_VARIANTE_PANEL =
  'id, producto_id, sku, codigo_barras, talle, color, precio, stock, stock_minimo, created_at, updated_at';

/** Producto tal como llega de la base al panel (sin columnas de costo). */
export type ProductoPanelSinCostos = Omit<Producto, 'costo' | 'porcentaje_ganancia'> & {
  variantes: Omit<Variante, 'costo'>[];
  categorias: Categoria | null;
};

/** Fila de la RPC costos_catalogo() (solo admin). */
export type CostoCatalogo = {
  producto_id: string;
  costo: number;
  porcentaje_ganancia: number;
  /** { variante_id: costo } solo para variantes con costo propio. */
  costos_variantes: Record<string, number>;
};
export const COLUMNAS_VARIANTE_PUBLICA = 'id, producto_id, talle, color, precio, stock, stock_minimo, created_at, updated_at';

/** Empleado tal como lo puede leer el panel (el hash del PIN jamás sale de la base). */
export type Empleado = {
  id: string;
  nombre: string;
  puesto: string;
  telefono: string | null;
  activo: boolean;
  fecha_alta: string;
  created_at: string;
  updated_at: string;
};

export type EstadoTurno = 'abierto' | 'cerrado';

export type TurnoCaja = {
  id: string;
  cajero_nombre: string;
  empleado_id: string | null;
  caja: string;
  monto_apertura: number;
  monto_cierre_declarado: number | null;
  monto_cierre_esperado: number | null;
  diferencia: number | null;
  estado: EstadoTurno;
  observaciones: string | null;
  fecha_apertura: string;
  fecha_cierre: string | null;
  total_ventas_efectivo: number;
  total_ventas_digital: number;
  total_movimientos_efectivo: number;
  cantidad_ventas: number;
  abierto_por: string | null;
  cerrado_por: string | null;
};

export type MetodoPagoTipo = 'efectivo' | 'transferencia_alias' | 'tarjeta_postnet' | 'combinado';
export type MetodoCaja = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
export type TipoMovimiento = 'ingreso' | 'egreso';

export type Venta = {
  id: string;
  numero_ticket: string;
  cajero_nombre: string;
  turno_id: string | null;
  empleado_id: string | null;
  operador_user_id: string | null;
  total: number;
  metodo_pago: MetodoPagoTipo;
  monto_efectivo: number;
  monto_digital: number;
  monto_recibido: number | null;
  vuelto: number;
  nro_comprobante_digital: string | null;
  exigio_credencial: boolean;
  fuerza_institucion: string | null;
  credencial_verificada: boolean;
  credencial_verificada_por: string | null;
  legajo_comprador: string | null;
  nombre_cliente: string | null;
  telefono_cliente: string | null;
  idempotency_key: string | null;
  created_at: string;
};

export type VentaDetalle = {
  id: string;
  venta_id: string;
  producto_id: string | null;
  variante_id: string | null;
  nombre_producto: string;
  talle: string;
  color: string;
  precio_unitario: number;
  costo_unitario: number;
  cantidad: number;
  subtotal: number;
  created_at: string;
};

export type MovimientoCaja = {
  id: string;
  tipo: TipoMovimiento;
  monto: number;
  concepto: string;
  categoria_caja: string;
  metodo_pago: MetodoCaja;
  producto_id: string | null;
  cantidad: number;
  turno_id: string | null;
  venta_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type MotivoStock = 'alta' | 'venta' | 'ajuste' | 'correccion' | 'devolucion';

/** Libro de inventario: una fila por cada cambio de stock (lo escribe la base). */
export type MovimientoStock = {
  id: number;
  variante_id: string | null;
  producto_id: string | null;
  delta: number;
  stock_resultante: number;
  motivo: MotivoStock;
  venta_id: string | null;
  nota: string | null;
  created_by: string | null;
  created_at: string;
};

/** Historial de cambios del catálogo y del personal (lo escribe la base). */
export type RegistroAuditoria = {
  id: number;
  tabla: string;
  registro_id: string | null;
  accion: 'alta' | 'modificacion' | 'baja';
  antes: Json | null;
  despues: Json | null;
  actor: string | null;
  created_at: string;
};

export type RankingProducto = {
  producto_id: string | null;
  nombre: string;
  imagen_url: string | null;
  unidades: number;
  ingresos: number;
  ganancia: number;
};

/* ─────────────────────── Tipos compuestos ─────────────────────── */

export type ProductoConVariantes = Producto & {
  variantes: Variante[];
  categorias: Categoria | null;
};

export type ProductoPublicoConVariantes = ProductoPublico & {
  variantes: VariantePublica[];
  categorias: Categoria | null;
};

/** Respuesta de la RPC procesar_venta_pos. */
export type VentaConDetalles = Venta & {
  detalles: VentaDetalle[];
  reintento: boolean;
};

/** Ítem del carrito del POS (el precio es referencial: la base recalcula). */
export type VentaItemCarrito = {
  variante_id: string;
  producto_id: string;
  nombre: string;
  talle: string;
  color: string;
  precio: number;
  cantidad: number;
  exige_credencial: boolean;
  imagen_url: string | null;
  stock_disponible: number;
};

export type CredencialVenta = {
  fuerza_institucion: string;
  legajo: string;
  declaracion_jurada: true;
  pin_operador: string;
};

export type RolUsuario = 'admin' | 'vendedor';

/* ─────────────────── Esquema para supabase-js v2 ─────────────────── */

type Tabla<Row, Insert, Update, Rel = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Rel;
};

type Opcionales<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  public: {
    Tables: {
      categorias: Tabla<
        Categoria,
        Opcionales<Categoria, 'id' | 'slug' | 'descripcion' | 'orden' | 'activo' | 'created_at' | 'updated_at'>,
        Partial<Categoria>
      >;
      productos: Tabla<
        Producto,
        Opcionales<
          Producto,
          | 'id'
          | 'slug'
          | 'descripcion'
          | 'precio'
          | 'costo'
          | 'porcentaje_ganancia'
          | 'exige_credencial'
          | 'categoria_id'
          | 'imagen_url'
          | 'etiquetas'
          | 'activo'
          | 'created_at'
          | 'updated_at'
        >,
        Partial<Producto>,
        [
          {
            foreignKeyName: 'productos_categoria_id_fkey';
            columns: ['categoria_id'];
            isOneToOne: false;
            referencedRelation: 'categorias';
            referencedColumns: ['id'];
          },
        ]
      >;
      variantes: Tabla<
        Variante,
        Opcionales<
          Variante,
          'id' | 'sku' | 'codigo_barras' | 'color' | 'precio' | 'costo' | 'stock' | 'stock_minimo' | 'created_at' | 'updated_at'
        >,
        Partial<Variante>,
        [
          {
            foreignKeyName: 'variantes_producto_id_fkey';
            columns: ['producto_id'];
            isOneToOne: false;
            referencedRelation: 'productos';
            referencedColumns: ['id'];
          },
        ]
      >;
      empleados: Tabla<Empleado, never, never>;
      turnos_caja: Tabla<TurnoCaja, never, never>;
      ventas: Tabla<Venta, never, never>;
      venta_detalles: Tabla<
        VentaDetalle,
        never,
        never,
        [
          {
            foreignKeyName: 'venta_detalles_venta_id_fkey';
            columns: ['venta_id'];
            isOneToOne: false;
            referencedRelation: 'ventas';
            referencedColumns: ['id'];
          },
        ]
      >;
      movimientos_caja: Tabla<
        MovimientoCaja,
        Opcionales<
          MovimientoCaja,
          'id' | 'categoria_caja' | 'metodo_pago' | 'producto_id' | 'cantidad' | 'turno_id' | 'venta_id' | 'created_by' | 'created_at'
        >,
        never
      >;
      movimientos_stock: Tabla<MovimientoStock, never, never>;
      auditoria: Tabla<RegistroAuditoria, never, never>;
    };
    Views: { [_ in never]: never };
    Functions: {
      verificar_credencial_empleado: {
        Args: { p_empleado_id: string; p_pin: string };
        Returns: { id: string; nombre: string; puesto: string }[];
      };
      guardar_empleado: {
        Args: {
          p_id: string | null;
          p_nombre: string;
          p_puesto: string;
          p_telefono: string | null;
          p_activo: boolean;
          p_pin?: string | null;
        };
        Returns: string;
      };
      eliminar_empleado: { Args: { p_id: string }; Returns: string };
      abrir_turno: {
        Args: { p_empleado_id: string; p_pin: string; p_monto_apertura: number; p_caja?: string };
        Returns: TurnoCaja;
      };
      cerrar_turno_ciego: {
        Args: { p_turno_id: string; p_monto_declarado: number; p_observaciones?: string | null };
        Returns: TurnoCaja;
      };
      procesar_venta_pos: {
        Args: {
          p_turno_id: string;
          p_items: Json;
          p_metodo_pago: MetodoPagoTipo;
          p_monto_efectivo: number | null;
          p_monto_digital: number | null;
          p_monto_recibido: number | null;
          p_nro_comprobante: string | null;
          p_nombre_cliente: string | null;
          p_telefono_cliente: string | null;
          p_credencial: Json | null;
          p_total_esperado: number | null;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      crear_producto: { Args: { p_producto: Json; p_variantes: Json }; Returns: string };
      ajustar_stock: { Args: { p_variante_id: string; p_delta: number; p_nota?: string | null }; Returns: number };
      ranking_productos: { Args: { p_desde?: string | null }; Returns: RankingProducto[] };
      costos_catalogo: { Args: Record<string, never>; Returns: CostoCatalogo[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
