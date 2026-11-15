-- ============================================================================
-- TROPAS TUNUYÁN — Catálogo inicial (ejecutar después de database/schema.sql).
-- Imágenes servidas desde public/productos/ del proyecto.
-- ============================================================================
select set_config('tt.nota_stock', 'Catálogo inicial', true);

insert into public.categorias (nombre, descripcion, orden) values
  ('Uniformes',          'Uniformes tácticos y de servicio',           1),
  ('Calzado',            'Borceguíes, botas tácticas y zapatos',       2),
  ('Accesorios',         'Cinturones, fundas, guantes y más',          3),
  ('Protección',         'Chalecos, cascos y equipo de protección',    4),
  ('Insignias y Grados', 'Insignias, escudos y grados reglamentarios', 5);

insert into public.productos (nombre, descripcion, precio, costo, porcentaje_ganancia, exige_credencial, categoria_id, imagen_url)
select s.nombre, s.descripcion, s.precio, s.costo, s.margen, s.exige, c.id, s.imagen
  from (values
    ('Uniforme Táctico Ripstop', 'Uniforme completo en tela ripstop reforzada, color verde oliva. Ideal para operaciones de campo.',
      45500.00, 29500.00, 54.24, false, 'Uniformes', '/productos/uniforme.png'),
    ('Borceguí Táctico Cuero', 'Borceguí de cuero vacuno con suela antideslizante y caña reforzada. Apto para todo terreno.',
      38900.00, 24500.00, 58.78, false, 'Calzado', '/productos/borcegui.png'),
    ('Chaleco Antibalas Nivel IIIA', 'Chaleco balístico certificado Nivel IIIA. Uso exclusivo para fuerzas de seguridad con credencial habilitante.',
      185000.00, 130000.00, 42.31, true, 'Protección', '/productos/chaleco.png'),
    ('Cinturón Táctico Militar', 'Cinturón táctico de nylon de alta resistencia con hebilla metálica de liberación rápida.',
      12500.00, 7200.00, 73.61, false, 'Accesorios', '/productos/cinturon.png'),
    ('Funda Pistolera Nivel II', 'Funda de retención nivel II para pistolas 9mm. Requiere presentación de credencial.',
      22800.00, 14000.00, 62.86, true, 'Accesorios', '/productos/funda.png'),
    ('Insignia Escudo Nacional Bordada', 'Insignia bordada del escudo nacional argentino para uniformes reglamentarios.',
      3200.00, 1500.00, 113.33, false, 'Insignias y Grados', null)
  ) as s(nombre, descripcion, precio, costo, margen, exige, categoria, imagen)
  join public.categorias c on c.nombre = s.categoria;

insert into public.variantes (producto_id, talle, color, stock, stock_minimo)
select p.id, s.talle, s.color, s.stock, s.minimo
  from (values
    ('Uniforme Táctico Ripstop',         'S',       'Verde Oliva', 12, 5),
    ('Uniforme Táctico Ripstop',         'M',       'Verde Oliva', 20, 5),
    ('Uniforme Táctico Ripstop',         'L',       'Verde Oliva', 15, 5),
    ('Uniforme Táctico Ripstop',         'XL',      'Verde Oliva',  8, 5),
    ('Uniforme Táctico Ripstop',         'M',       'Negro',       10, 3),
    ('Uniforme Táctico Ripstop',         'L',       'Negro',        7, 3),
    ('Borceguí Táctico Cuero',           '38',      'Negro',        6, 3),
    ('Borceguí Táctico Cuero',           '40',      'Negro',       14, 5),
    ('Borceguí Táctico Cuero',           '42',      'Negro',       11, 5),
    ('Borceguí Táctico Cuero',           '44',      'Negro',        4, 3),
    ('Borceguí Táctico Cuero',           '40',      'Marrón',       8, 3),
    ('Borceguí Táctico Cuero',           '42',      'Marrón',       5, 3),
    ('Chaleco Antibalas Nivel IIIA',     'M',       'Negro',        3, 2),
    ('Chaleco Antibalas Nivel IIIA',     'L',       'Negro',        5, 2),
    ('Chaleco Antibalas Nivel IIIA',     'XL',      'Negro',        2, 2),
    ('Cinturón Táctico Militar',         'Único',   'Negro',       25, 10),
    ('Cinturón Táctico Militar',         'Único',   'Verde Oliva', 18, 10),
    ('Funda Pistolera Nivel II',         'Diestro', 'Negro',       10, 5),
    ('Funda Pistolera Nivel II',         'Zurdo',   'Negro',        4, 3),
    ('Insignia Escudo Nacional Bordada', 'Único',   'Multicolor',  50, 15)
  ) as s(producto, talle, color, stock, minimo)
  join public.productos p on p.nombre = s.producto;

select set_config('tt.nota_stock', '', true);
