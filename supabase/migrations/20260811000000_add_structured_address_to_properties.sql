alter table public.properties
  add column if not exists address_line1 text,
  add column if not exists street_number text,
  add column if not exists street text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists province_code text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists country_code text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists address_provider text,
  add column if not exists address_provider_id text;

comment on column public.properties.address is 'Adresse formattée/affichée legacy conservée pour compatibilité.';
comment on column public.properties.address_provider is 'Source de l’adresse structurée, par exemple geoapify ou manual.';
comment on column public.properties.address_provider_id is 'Identifiant de lieu du fournisseur d’adresse lorsque disponible.';

create index if not exists properties_user_city_idx on public.properties (user_id, city);
