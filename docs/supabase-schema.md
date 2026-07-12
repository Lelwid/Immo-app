# Schéma Supabase prévu

Phase 1 conserve le mode localStorage comme fallback. Les noms de colonnes ci-dessous suivent les types TypeScript actuels pour simplifier la migration progressive.

## properties

- `id` uuid primary key default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `name` text not null
- `address` text not null
- `type` text not null
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Migration SQL: `supabase/migrations/20260628000000_create_properties.sql`

Sécurité:
- Row Level Security activée.
- `select`, `insert`, `update`, `delete` limités aux lignes où `auth.uid() = user_id`.
- Le service applicatif attache automatiquement `user_id` à la création.

## units

- `id` uuid primary key default `gen_random_uuid()`
- `property_id` uuid not null references `properties(id)` on delete cascade
- `name` text not null
- `floor` text
- `floor_index` integer
- `sort_order` integer
- `monthly_rent` numeric default 0
- `status` text default `vacant`
- `tenant_id` uuid nullable
- `alerts_count` integer default 0
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Migration SQL: `supabase/migrations/20260706000000_create_units.sql`

Sécurité:
- Row Level Security activée.
- Les logements sont accessibles seulement si `units.property_id` appartient à un immeuble dont `properties.user_id = auth.uid()`.
- La suppression d'un immeuble supprime automatiquement ses logements via `on delete cascade`.

## tenants

- `id` uuid primary key default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `full_name` text not null
- `email` text
- `phone` text
- `notes` text
- `archived_at` timestamptz
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Migration SQL: `supabase/migrations/20260707000000_create_tenants_and_leases.sql`

Sécurité:
- Row Level Security activée.
- `select`, `insert`, `update`, `delete` limités aux lignes où `auth.uid() = user_id`.

## leases

- `id` uuid primary key default `gen_random_uuid()`
- `property_id` uuid not null references `properties(id)` on delete cascade
- `unit_id` uuid not null references `units(id)` on delete cascade
- `tenant_id` uuid not null references `tenants(id)`
- `start_date` date not null
- `end_date` date not null
- `monthly_rent` numeric not null default 0
- `payment_status` text default `à venir`
- `status` text default `active`
- `notes` text
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Migration SQL: `supabase/migrations/20260707000000_create_tenants_and_leases.sql`

Règle métier:
- L'occupation courante est dérivée du bail actif.
- `units` représente le logement physique seulement.
- Un index unique partiel empêche plus d'un bail actif par logement: `unique(unit_id) where status = 'active'`.

Sécurité:
- Row Level Security activée.
- Les baux sont accessibles seulement si `leases.property_id` appartient à un immeuble dont `properties.user_id = auth.uid()`.

## payments

- `id` uuid primary key default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `property_id` uuid not null references `properties(id)` on delete cascade
- `unit_id` uuid references `units(id)` on delete set null
- `lease_id` uuid references `leases(id)` on delete set null
- `tenant_id` uuid references `tenants(id)` on delete set null
- `amount` numeric not null default 0
- `amount_paid` numeric not null default 0
- `due_date` date not null
- `paid_date` date
- `status` text not null
- `payment_type` text not null default `loyer`
- `notes` text
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Migration SQL: `supabase/migrations/20260708010000_create_payments.sql`

Règle métier:
- Les paiements sont liés prioritairement au bail via `lease_id`.
- La suppression d'un bail ou d'un locataire conserve l'historique financier en mettant la référence à `null`.
- La suppression d'un immeuble supprime ses paiements, comme le workflow local existant.

Sécurité:
- Row Level Security activée.
- Les paiements sont accessibles seulement si `payments.property_id` appartient à un immeuble dont `properties.user_id = auth.uid()`.
- Un trigger valide que le logement, le bail et le locataire correspondent à l'immeuble du paiement.

## maintenance_tickets

- `id` text primary key
- `propertyId` text references properties(id)
- `unitId` text references units(id)
- `title` text not null
- `description` text
- `status` text not null
- `priority` text not null
- `createdAt` date not null

## documents

- `id` text primary key
- `name` text not null
- `type` text not null
- `propertyId` text references properties(id)
- `unitId` text references units(id)
- `uploadDate` date not null
- `relatedEntityType` text
- `relatedEntityId` text
- `uploadedAt` timestamptz
- `fileDataUrl` text
- `mimeType` text
- `size` integer
- `notes` text

For production, files should move to Supabase Storage and `fileDataUrl` should become a storage path.

## activities

- `id` uuid primary key default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `property_id` uuid references `properties(id)` on delete cascade
- `unit_id` uuid references `units(id)` on delete set null
- `tenant_id` uuid references `tenants(id)` on delete set null
- `lease_id` uuid references `leases(id)` on delete set null
- `activity_type` text not null
- `title` text not null
- `description` text
- `activity_date` date not null default current_date
- `created_at` timestamptz default now()

Migration SQL: `supabase/migrations/20260708020000_create_notes_and_activities.sql`

Règle métier:
- Les activités sont immuables dans l'application actuelle.
- La fin d'un bail ou l'archivage d'un locataire conserve l'historique via `on delete set null`.
- Le miroir local sert seulement à préserver les lectures existantes pendant la migration progressive.

Sécurité:
- Row Level Security activée.
- Les activités sont accessibles seulement si `activities.user_id = auth.uid()`.
- Un trigger valide les références à l'immeuble, au logement, au bail et au locataire.

## tasks

- `id` text primary key
- `title` text not null
- `description` text
- `completed` boolean not null default false
- `priority` text not null
- `dueDate` date not null
- `propertyId` text references properties(id)
- `unitId` text references units(id)
- `tenantId` text references tenants(id)
- `createdAt` timestamptz default now()

## notes

- `id` uuid primary key default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `target_type` text not null
- `target_id` text not null
- `property_id` uuid references `properties(id)` on delete cascade
- `unit_id` uuid references `units(id)` on delete set null
- `tenant_id` uuid references `tenants(id)` on delete set null
- `lease_id` uuid references `leases(id)` on delete set null
- `content` text not null
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Migration SQL: `supabase/migrations/20260708020000_create_notes_and_activities.sql`

Règle métier:
- `target_type` / `target_id` conserve la logique actuelle du panneau Notes: immeuble, logement, locataire ou entretien.
- La suppression d'une note ne supprime aucune entité liée.
- La fin d'un bail ou l'archivage d'un locataire conserve les notes historiques via `on delete set null`.

Sécurité:
- Row Level Security activée.
- Les notes sont accessibles seulement si `notes.user_id = auth.uid()`.
- Un trigger valide les références à l'immeuble, au logement, au bail et au locataire.

## Migration notes

- `properties` utilise déjà `user_id uuid`.
- Add `user_id uuid` to the remaining tables as each feature migrates to Supabase.
- Enable Row Level Security before production.
- Add indexes on `propertyId`, `unitId`, `tenantId`, `dueDate`, `createdAt`.
- Convert camelCase columns to snake_case later if preferred, but keep a mapping layer in `src/lib/data`.
