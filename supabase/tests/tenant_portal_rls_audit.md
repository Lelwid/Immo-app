# Habixa — correction de récursion RLS

## État confirmé

Audit du dépôt et du projet Supabase lié `cjftzmxlgstomhblasii`, effectué le 15 septembre 2026 UTC.
Les 19 migrations initiales, dont `20260906021401_tenant_portal.sql`, étaient déjà appliquées.
Les policies de `pg_policies` et le helper distant correspondaient au SQL local.
Toutes les tables applicatives auditées avaient RLS activé et appartenaient à `postgres`.

## Causes exactes

1. Lecture : `leases` → policy `Users can select leases for their own properties`
   → SELECT sur `properties` → policy `Tenant portal users can select their lease properties`
   → SELECT sur `leases` → `42P17`.
2. Écriture : `leases` → `WITH CHECK` des policies propriétaire INSERT/UPDATE
   → SELECT sur `units` → policy `Tenant portal users can select their units`
   → SELECT sur `leases` → `42P17`.

Le second chemin a été reproduit par une mise à jour de bail après correction du premier.
PostgreSQL développe les policies applicables avant d'évaluer les conditions : une condition
propriétaire vraie ne permet pas d'éviter la récursion d'une autre policy permissive.

### Graphe des dépendances avant correction

| Table | Lecture propriétaire | Lecture portail / autres dépendances pertinentes |
| --- | --- | --- |
| `properties` | `auth.uid() = user_id` | `leases` → helper d'accès → `tenant_portal_accounts` |
| `units` | `properties`, avec vérification du propriétaire | `leases` → helper d'accès → `tenant_portal_accounts` |
| `tenants` | `auth.uid() = user_id` | helper d'accès → `tenant_portal_accounts` |
| `leases` | `properties` | helper d'accès → `tenant_portal_accounts`; INSERT/UPDATE vérifient aussi `units` et `tenants` |
| `tenant_portal_accounts` | `owner_user_id = auth.uid()` | `user_id = auth.uid()`; aucune sous-requête dans les policies |
| `rent_charges` | `user_id = auth.uid()` | helper direct ou `leases` → helper |
| `payment_transactions` | `user_id = auth.uid()` | helper direct ou `leases` → helper |
| `payment_allocations` | `user_id = auth.uid()` | `rent_charges` → helper direct ou `leases` → helper |
| `payments` (ancien modèle) | `properties`, avec vérification du propriétaire | Aucun accès locataire; le portail utilise le ledger |
| `documents` | `user_id = auth.uid()` | `visibility = 'tenant'` ET helper direct ou `leases` par bail/logement |
| `maintenance_requests` | `user_id = auth.uid()` | helper direct; INSERT consulte les comptes, le trigger vérifie immeuble/logement/bail actif |

Le helper existant `public.tenant_portal_has_access(uuid)` est SECURITY INVOKER et lit uniquement
les liens actifs du compte courant. Il ne crée pas de boucle `tenants/accounts/leases`.
Les policies de pièces jointes et de stockage ont aussi été inspectées : elles dépendent des
documents, demandes ou liens portail, sans ajouter de retour vers ces tables depuis `leases`.

## Correction appliquée

Migration : `20260915011930_fix_tenant_portal_rls_recursion.sql`.

Deux policies modifiées par `ALTER POLICY`, sans suppression ni création de policy :

- `Tenant portal users can select their lease properties` sur `public.properties`.
- `Tenant portal users can select their units` sur `public.units`.

Deux petits helpers SECURITY DEFINER créés dans le schéma privé `private` :

- `private.tenant_portal_can_read_property(uuid)`.
- `private.tenant_portal_can_read_unit(uuid)`.

Chaque helper joint `public.leases` et `public.tenant_portal_accounts`, exige
`account.user_id = auth.uid()` et `account.status = 'active'`, et retourne uniquement un booléen.
Les identifiants de compte ne sont pas des paramètres. `search_path = ''` est explicite et les
tables sont qualifiées. L'exécution est retirée à PUBLIC/anon et autorisée à authenticated.
Le propriétaire d'exécution `postgres` est celui des tables; sa lecture interne ne redéveloppe
pas leurs policies. Les appels utilisateur continuent à passer par RLS.

La correspondance bail-locataire est identique à celle des policies remplacées, y compris les
baux historiques. Voir un immeuble ne donne pas accès aux autres logements ou locataires.
Les policies propriétaire, les conditions de partage des documents et les validations d'écriture
restent intactes. Aucun changement de code applicatif ou d'ancienne migration.

La simulation d'application ne listait que cette migration. Application non destructive effectuée
par le CLI, puis présence du même numéro de migration confirmée dans l'historique distant.

## Vérifications

`tenant_portal_rls_recursion.sql` contient une suite SQL transactionnelle autonome à exécuter
avec le CLI Supabase (`db query --linked --file supabase/tests/tenant_portal_rls_recursion.sql`).
Elle crée des fixtures aléatoires et termine par ROLLBACK. Les assertions d'accès et d'écriture
s'exécutent sous le rôle `authenticated`, sans BYPASSRLS; les tests anonymes utilisent `anon`.

- **224 assertions réussies avant application**, dans une transaction incluant la migration puis annulée.
- **224 assertions réussies après application**, contre les policies réellement déployées.
- Deux propriétaires, trois locataires, dont deux dans le même immeuble du même propriétaire.
- Accès permis et isolation vérifiés sur les 11 tables de la matrice, ainsi que documents privés/partagés.
- Paiements portail testés via bail avec `tenant_id` nul; allocations également vérifiées.
- Modification et insertion de baux propriétaire, modification de paiements, création de maintenance locataire.
- Refus de modification de bail/compte portail et de suppression d'immeuble par le locataire.
- Refus d'écriture entre propriétaires, compte désactivé, compte sans lien et accès anonyme.
- Permissions et `search_path` des deux helpers; maintien de RLS sur les 11 tables.

Avant correction, `42P17` a été reproduit sur `leases`, `properties`, `units`, `payments`,
`rent_charges`, `payment_transactions`, `payment_allocations` et `documents`.
Après déploiement, les requêtes sur les **11 tables** répondent sans erreur.
Les erreurs de `payments` et `properties` étaient donc bien liées aux mêmes cycles.

- `npm run lint` : réussi, code 0.
- `npm run build` : réussi, code 0, TypeScript et 31 pages générées.
  Le premier essai était bloqué par le téléchargement des polices Google; relance réussie avec accès réseau.
- Tests SQL exécutés sur Supabase; aucune session navigateur propriétaire/locataire utilisée.
- `git diff --check` signale deux lignes vides finales préexistantes dans `src/app/immeubles/page.tsx`
  et `src/app/onboarding/page.tsx`, hors correction SQL.

## Audit de sécurité complémentaire

Supabase Advisors : **16 avertissements avant et après, aucune nouvelle alerte**.
Ils concernent 13 fonctions existantes sans `search_path` fixé, l'exposition existante de la RPC
d'invitation aux rôles anon/authenticated (la RPC vérifie néanmoins `auth.uid()`), et la protection
contre les mots de passe compromis désactivée. Ils sont hors du périmètre de cette correction.

Références : [RLS et helpers](https://supabase.com/docs/guides/database/postgres/row-level-security),
[search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[RPC accessible anonymement](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[RPC accessible aux utilisateurs authentifiés](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
