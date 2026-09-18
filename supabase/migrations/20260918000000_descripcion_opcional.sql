-- Lo que se compró es opcional: a veces solo se sabe cuánto.
alter table public.compras
  drop constraint compras_descripcion_check,
  alter column descripcion drop not null,
  add constraint compras_descripcion_check check (descripcion is null or btrim(descripcion) <> '');
