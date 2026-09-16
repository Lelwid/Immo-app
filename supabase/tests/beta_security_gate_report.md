# HABIXA — BETA SECURITY GATE

Audit exécuté le 15 septembre 2026 sur le dépôt local et le projet Supabase lié.

## Résultat

**SECURITY GATE: PASS**

Aucun BLOCKER connu ne subsiste après correction et rejeu des tests. Ce résultat autorise
raisonnablement une bêta privée; il ne constitue pas une garantie de sécurité absolue.

## Priorisation

### BLOCKER

Aucun restant.

Deux BLOCKERS ont été trouvés et corrigés :

1. Un ancien locataire conservait un accès dérivé à son ancienne unité, aux documents partagés
   uniquement par cette unité et aux objets Storage correspondants. Le scénario réel a retourné
   `1/1/1` avant la migration et `0/0/0` après.
2. `/api/copilot` et `/api/documents/[id]/analyze` acceptaient un mode local sans session, ce qui
   permettait de consommer OpenAI/OCR sans authentification.

### HIGH

1. **Confirmation d'adresse désactivée sur Supabase Auth.** L'endpoint public Auth retourne
   `mailer_autoconfirm=true`. Activer « Confirm email » avant l'ouverture au public, après validation
   du gabarit d'email et de l'URL de retour. Le token d'invitation aléatoire reste nécessaire, donc ce
   réglage ne crée pas à lui seul un accès cross-tenant pendant la bêta privée.

Corrigés :

- Next.js 16.2.9 exposait plusieurs avis critiques/élevés; mise à niveau vers 16.3.5.
- Le paquet direct obsolète `git@0.1.5`, inutilisé et sans correctif, a été supprimé.
- `anon` et `authenticated` possédaient des droits SQL excessifs, dont `TRUNCATE`, `TRIGGER` et
  `REFERENCES`, sur toutes les tables métier. Les grants sont maintenant limités aux verbes utilisés.
- La RPC SECURITY DEFINER d'invitation était exécutable par `anon` et utilisait un `search_path`
  mutable. `anon` est révoqué, `authenticated` est conservé, `search_path=''` et les objets sont qualifiés.
- Le client pouvait choisir le token, l'expiration et l'identité d'une invitation. Le trigger force
  maintenant 32 octets aléatoires, 14 jours, l'état `pending` et l'immutabilité des champs sensibles.

### MEDIUM

1. La protection Supabase contre les mots de passe compromis était désactivée lors de l'Advisor
   initial. Elle doit être activée dans Auth > Password Security; ce réglage de plateforme n'est pas
   modifiable par migration SQL.
2. Les routes IA ont maintenant authentification, limites de corps et plafonds d'outils, mais pas de
   limite durable de requêtes par utilisateur. Ajouter un quota distribué avant une bêta publique.
3. Storage valide taille et MIME déclaré, et l'analyse valide les signatures PDF/image. Un fichier
   documentaire général non analysé ne fait pas encore l'objet d'une inspection antivirus ou d'une
   vérification serveur systématique des octets magiques.

### LOW

1. La protection des pages est assurée par un gate client. Les pages statiques ne transportent pas de
   données sensibles et RLS protège les lectures réelles; un middleware serveur améliorerait toutefois
   le comportement de navigation et réduirait l'exposition des coquilles d'interface.
2. Les signed URLs expirent après 10 minutes. Elles restent utilisables par toute personne qui les
   reçoit pendant cette fenêtre, comportement normal d'une URL signée.

## Inventaire RLS des tables métier

Toutes les 17 tables ci-dessous ont RLS activé. `anon` n'a aucun droit direct sur elles.

| Table | SELECT | INSERT | UPDATE | DELETE | Appartenance / portée |
| --- | --- | --- | --- | --- | --- |
| `properties` | propriétaire; locataire avec bail actif | propriétaire | propriétaire | propriétaire | `user_id`; helper privé bail actif |
| `units` | propriétaire; locataire avec bail actif | propriétaire | propriétaire | propriétaire | propriété parente; helper privé bail actif |
| `tenants` | propriétaire; compte portail du locataire | propriétaire | propriétaire | propriétaire | `user_id`; lien portail actif |
| `leases` | propriétaire; locataire lié | propriétaire | propriétaire | propriétaire | relations immeuble/logement/locataire validées |
| `rent_charges` | propriétaire; locataire/son bail | propriétaire | propriétaire | propriétaire | `user_id`, `tenant_id` ou bail autorisé |
| `payment_transactions` | propriétaire; locataire/son bail | propriétaire | propriétaire | propriétaire | `user_id`, `tenant_id` ou bail autorisé |
| `payment_allocations` | propriétaire; via charge autorisée | propriétaire | propriétaire | propriétaire | transaction et charge du même propriétaire |
| `payments` (legacy) | propriétaire | propriétaire | propriétaire | propriétaire | immeuble propriétaire; aucun accès portail |
| `documents` | propriétaire; partage locataire explicite | propriétaire | propriétaire | propriétaire | `user_id`; locataire/bail exact ou unité avec bail actif |
| `document_ai_extractions` | propriétaire du document | propriétaire | propriétaire | propriétaire | `user_id` et document possédé |
| `maintenance_requests` | propriétaire; locataire concerné | propriétaire; locataire avec bail actif | propriétaire | propriétaire | relations validées par trigger |
| `maintenance_request_attachments` | propriétaire; locataire concerné | locataire concerné | personne | personne | demande, propriétaire et locataire concordants |
| `tasks` | propriétaire | propriétaire | propriétaire | propriétaire | `user_id` et relations validées |
| `notes` | propriétaire | propriétaire | propriétaire | propriétaire | `user_id` et relations validées |
| `activities` | propriétaire | propriétaire | propriétaire | propriétaire | `user_id` et relations validées |
| `tenant_portal_accounts` | propriétaire; utilisateur lié | RPC seulement | propriétaire (état) | propriétaire | identité figée par trigger |
| `tenant_portal_invitations` | propriétaire; invité pending correspondant | propriétaire | propriétaire, champs sensibles figés | propriétaire | propriétaire du locataire + email JWT |

## Corrections appliquées

Migrations forward-only appliquées :

- `20260916012817_beta_security_gate_hardening.sql`
- `20260916020007_fix_tenant_portal_account_grants.sql`

Elle :

- exige un bail actif pour les accès portail dérivés d'une unité ou d'un immeuble;
- corrige les policies `documents` et `storage.objects` contre l'accès d'un ancien locataire;
- lie tout upload de photo d'entretien à une demande existante du même locataire;
- fixe les limites Storage à 20 Mio pour les documents et 10 Mio pour les photos;
- limite les MIME aux formats acceptés et maintient les deux buckets privés;
- retire les grants anonymes et les privilèges SQL inutiles;
- interdit la création directe d'un compte portail hors RPC;
- sécurise les invitations, la RPC et les `search_path` de toutes les fonctions publiques auditées.

Application :

- authentification Supabase obligatoire sur les deux routes IA, y compris le mode local;
- contrôle des corps : 64 Kio pour Copilot, 64 Mio pour l'analyse documentaire;
- UUID/contexte validés et `reanalyze` accepté uniquement comme booléen `true`;
- fichiers documents limités à 20 Mio et aux formats PDF/Word/JPG/PNG/WebP;
- photos d'entretien limitées à 5, 10 Mio chacune, JPG/PNG/WebP;
- détails SQL/Supabase retirés des logs de production;
- rendu Markdown Copilot confirmé sans `dangerouslySetInnerHTML` ni HTML/liens arbitraires.

## Storage, API, Copilot et secrets

- Buckets `documents` et `maintenance-attachments` privés.
- Signed URLs générées après RLS, expiration 600 secondes, jamais stockées en base.
- Les paths utilisent identifiants et UUID générés; les noms sont nettoyés et ne peuvent pas faire
  sortir l'objet du préfixe autorisé.
- Les deux seules routes API sont `/api/copilot` et `/api/documents/[id]/analyze`; sans session elles
  retournent toutes deux HTTP 401.
- Copilot utilise le JWT utilisateur et RLS. Un UUID arbitraire ou une prompt injection ne donne pas
  de privilège supplémentaire; les tools sont en lecture seule.
- Aucun usage de `SUPABASE_SERVICE_ROLE_KEY`.
- Aucun secret réel trouvé dans les fichiers suivis ou l'historique Git inspecté. `.env.example` ne
  contient que des noms de variables et est explicitement autorisé dans `.gitignore`.
- Les clés OpenAI/OCR restent dans les modules serveur; aucune variable secrète `NEXT_PUBLIC_*`.

## Tests exécutés

- Reproduction avant correction : unité/document/objet Storage d'un ancien bail = `1/1/1`.
- Rejeu exact après correction : `0/0/0`.
- Suite SQL transactionnelle : **250 assertions réussies**, puis `ROLLBACK`.
- Matrice : propriétaires A/C, locataires A/B/C, même immeuble, autre propriétaire, compte désactivé,
  utilisateur non lié et rôle anonyme.
- Invitations : mauvais email, expiration, révocation, usage unique, token généré et champs immuables.
- Storage : path exact non autorisé refusé; path entretien fabriqué refusé; path valide accepté.
- `supabase db lint --linked --level warning` : aucune erreur de schéma.
- `npm audit` : 0 vulnérabilité après mises à jour compatibles, sans `--force`.
- `npm run lint` : réussi.
- `npm run build` : réussi avec Next.js 16.3.5; TypeScript et 31 pages générées.

## Fichiers reproductibles

- Migration : `supabase/migrations/20260916012817_beta_security_gate_hardening.sql`
- Correctif de grants : `supabase/migrations/20260916020007_fix_tenant_portal_account_grants.sql`
- Tests : `supabase/tests/tenant_portal_rls_recursion.sql`

## Références

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/auth/passwords
