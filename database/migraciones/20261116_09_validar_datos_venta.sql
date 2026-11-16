-- ============================================================================
-- Validación en la base de los datos que se cargan al cobrar (misma regla que
-- el POS en src/lib/ticket.ts). Se aplica con un trigger BEFORE INSERT sobre
-- ventas: cualquier error revierte toda la venta (stock, caja y libro).
--
--   · N.º de operación de transferencia: solo números, 4 a 30 dígitos.
--   · Cupón de Postnet / operación de pago combinado: letras mayúsculas,
--     números y guiones (3 a 30), con al menos 3 números. Opcional en combinado.
--   · Nombre del cliente: solo letras, espacios, apóstrofo, punto y guion;
--     empieza con letra y tiene al menos 2 letras.
--   · Teléfono del cliente: dígitos y separadores (+ espacio ( ) -), con 6 a
--     15 dígitos.
-- Solo afecta ventas nuevas: las ya registradas no se tocan.
-- Requiere la migración 08.
-- ============================================================================

create or replace function private.validar_datos_venta()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_comp text := new.nro_comprobante_digital;
  v_digitos integer;
begin
  if v_comp is not null then
    if new.metodo_pago = 'transferencia_alias' then
      if v_comp !~ '^[0-9]{4,30}$' then
        raise exception 'El N.º de operación debe tener solo números (mínimo 4 dígitos)' using hint = 'DATO_INVALIDO';
      end if;
    elsif new.metodo_pago in ('tarjeta_postnet', 'combinado') then
      if v_comp !~ '^[A-Z0-9-]{3,30}$'
         or char_length(regexp_replace(v_comp, '[^0-9]', '', 'g')) < 3 then
        raise exception 'El N.º de cupón / operación debe tener al menos 3 números (letras mayúsculas y guiones permitidos)'
          using hint = 'DATO_INVALIDO';
      end if;
    end if;
  end if;

  if new.nombre_cliente is not null then
    -- Rangos explícitos (latín con acentos y ñ): [[:alpha:]] depende del locale.
    if new.nombre_cliente !~ '^[A-Za-zÀ-ÖØ-öø-ɏ][A-Za-zÀ-ÖØ-öø-ɏ ''.-]*$'
       or char_length(regexp_replace(new.nombre_cliente, '[^A-Za-zÀ-ÖØ-öø-ɏ]', '', 'g')) < 2 then
      raise exception 'El nombre del cliente solo puede tener letras (mínimo 2)' using hint = 'DATO_INVALIDO';
    end if;
  end if;

  if new.telefono_cliente is not null then
    v_digitos := char_length(regexp_replace(new.telefono_cliente, '[^0-9]', '', 'g'));
    if new.telefono_cliente !~ '^[0-9+ ()-]+$' or v_digitos < 6 or v_digitos > 15 then
      raise exception 'Teléfono del cliente inválido: ingresá código de área y número' using hint = 'DATO_INVALIDO';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validar_datos_venta() from public, anon, authenticated;

drop trigger if exists ventas_validar_datos on public.ventas;
create trigger ventas_validar_datos before insert on public.ventas
  for each row execute function private.validar_datos_venta();
