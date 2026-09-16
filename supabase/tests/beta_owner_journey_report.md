# HABIXA — BETA OWNER JOURNEY

Date de validation : 15 septembre 2026  
Projet Supabase : `gestionnaire-immo-staging` (`cjftzmxlgstomhblasii`)

## 1. BLOCKERS

### B0 — Aucune URL publique staging vérifiable

La vérification du 15 septembre 2026 ne trouve aucun déploiement public de Habixa staging :

- le dépôt GitHub `Lelwid/Immo-app` ne déclare aucune page d’accueil, GitHub Pages est désactivé et l’API GitHub retourne zéro déploiement;
- le dépôt et son historique ne contiennent aucune configuration Vercel, Netlify, Render, Fly.io ou OpenAI Sites;
- aucune variable locale ne définit une URL d’application staging;
- aucun projet Vercel n’est lié au dossier de travail et aucune session Vercel locale n’est disponible.

**URL publique staging actuelle : aucune URL vérifiable.** Habixa staging doit d’abord être déployé.

Le callback demandé par le code est exactement `${window.location.origin}/auth/callback?next=/onboarding`. L’URL absolue attendue sera donc `<URL publique staging>/auth/callback?next=/onboarding` après le déploiement. Aucun domaine n’a été inventé ni configuré.

### B1 — Confirmation de courriel distante non activée

Le code applicatif est prêt pour le parcours de confirmation, mais une nouvelle lecture des paramètres Auth publics du projet Supabase staging confirme `mailer_autoconfirm=true`. La configuration locale déclare maintenant `auth.email.enable_confirmations=true` et autorise le callback local, mais elle n’a pas été poussée : aucune URL publique staging n’est disponible et un `config push` remplacerait potentiellement l’URL distante par `localhost`.

Conséquence : le parcours obligatoire inscription → courriel → confirmation → retour Habixa ne peut pas recevoir un verdict PASS sur le projet de staging.

Correction applicative effectuée :

- `emailRedirectTo` pointe vers `/auth/callback?next=/onboarding`;
- page de retour Habixa ajoutée;
- message clair pour lien expiré, invalide ou déjà utilisé;
- redirection vers l’onboarding après session confirmée;
- configuration Supabase locale préparée avec confirmation activée.

Action restante : déployer Habixa staging, vérifier son URL publique, la placer dans `site_url` et les redirect URLs, puis activer Confirm email et tester un courriel réel.

## 2. HIGH

### Corrigés

1. **Compte Supabase affichant les données locales ou de démonstration**  
   Une session Supabase force maintenant immédiatement le mode de données `supabase`. Cela supprime le risque de flash ou de navigation vers un portefeuille local existant.

2. **Onboarding partiellement enregistré en cas de panne**  
   La création de l’immeuble, des logements, du locataire, du bail et d’un éventuel paiement initial passe maintenant par `create_owner_portfolio`, une transaction PostgreSQL unique. Un verrou par propriétaire refuse aussi une seconde initialisation concurrente.

3. **Paiement partiellement enregistré**  
   La charge, la transaction et l’allocation passent maintenant par `record_rent_payment`, une transaction PostgreSQL unique. Le rejeu du même paiement est refusé par les contraintes d’unicité sans ajouter de ligne.

4. **Faux paiement créé par défaut pendant l’onboarding**  
   Un logement nouvellement marqué « Occupé » était prérempli avec le statut « Payé » et la date du jour. Il démarre maintenant à « Dû bientôt », sans transaction ni allocation.

5. **Dates de bail figées**  
   Les dates par défaut étaient codées au 1er juillet 2026 et au 30 juin 2027. Elles sont maintenant calculées à partir du mois courant. Le scénario testé produit correctement le 1er septembre 2026 et le 31 août 2027.

6. **Erreurs Auth techniques visibles**  
   Les erreurs Supabase courantes sont transformées en messages utilisateur : identifiants incorrects, courriel non confirmé, compte existant, mot de passe insuffisant et limitation de tentatives.

7. **Double soumission**  
   Des verrous immédiats, indépendants du rendu React, protègent la création d’immeuble, l’ajout de locataire, l’enregistrement de bail, le paiement et la finalisation de l’onboarding. Les boutons affichent un état d’enregistrement et sont désactivés pendant l’opération.

## 3. MEDIUM

1. **Test réel avec courriel non exécuté**  
   Un test transactionnel distant avec rollback couvre toutes les écritures métier, mais l’envoi et le clic sur un vrai courriel restent à valider après activation de Confirm email.

2. **Dashboard et Copilot non validés sous une vraie session neuve**  
   Le modèle de données et les outils Copilot lisent le ledger. Le test persistant est maintenant explicitement autorisé, mais il n’a pas été lancé parce qu’aucune application staging publique n’est déployée et que Confirm email reste désactivé. Aucune donnée du scénario n’a été transmise au Copilot.

3. **Écritures hors onboarding encore séquentielles**  
   Le parcours principal est atomique. Les écrans d’ajout ultérieur d’un immeuble ou d’un locataire disposent de verrous anti-double-clic, mais certaines écritures secondaires restent réparties entre plusieurs requêtes. Une panne réseau au milieu d’une de ces opérations demeure récupérable manuellement.

4. **Accessibilité des modales incomplète**  
   Les champs principaux ont des labels et les boutons ont un focus visible. Plusieurs modales historiques n’ont pas encore toutes `role="dialog"`, `aria-modal` et une fermeture uniforme par Escape.

5. **Empty states inégaux**  
   Immeubles et Dashboard expliquent l’étape suivante. Certains états vides secondaires restent descriptifs sans bouton d’action direct, notamment selon les filtres de Paiements, Documents et Entretien.

## 4. LOW

1. Le titre HTML historique mentionne encore le tableau de bord exemple dans l’onglet du navigateur.
2. Le texte d’introduction de l’onboarding cite plus de modules que le strict parcours initial.
3. Le test responsive automatisé vérifie le débordement horizontal et l’accès aux contrôles; une revue visuelle manuelle finale sur appareils réels reste utile.

## Parcours testés

- inscription : structure, labels, mot de passe minimum de 8 caractères, loading et messages propres;
- callback de confirmation : erreur expirée/invalide et retour vers la connexion;
- première arrivée : bascule automatique vers les données Supabase;
- onboarding : progression 25/50/75/100 %, retour, validation et états vacant/occupé;
- adresse Geoapify : recherche réelle, suggestions, sélection structurée et alternative manuelle;
- typologie : Condo 1, Duplex 2, Triplex 3, Quadruplex 4, Immeuble 5+ vérifiés dans la logique;
- scénario transactionnel : Duplex Cartier, 2 logements, Jean Richard, bail actif à 1 236 $;
- ledger : `rent_charges`, `payment_transactions`, `payment_allocations`;
- paiement anticipé : échéance conservée au 2026-09-01, réception conservée au 2026-08-28;
- anti-duplication : second onboarding refusé; rejeu du même paiement refusé;
- responsive onboarding : 390, 768, 1366, 1440 et 1920 px, aucun débordement horizontal;
- refresh de l’onboarding : état React remis proprement, aucune donnée métier écrite avant la dernière étape;
- build et analyse statique.

## Résultats du test transactionnel

Le fichier `owner_journey_transactional.sql` crée ses fixtures dans une transaction puis exécute `ROLLBACK`. Aucune donnée de test ne subsiste.

| Vérification | Résultat |
|---|---:|
| Immeubles | 1 — Duplex Cartier |
| Logements | 2, ordre naturel |
| Locataires | 1 — Jean Richard |
| Baux actifs | 1 |
| Loyer | 1 236 $ |
| Début | 2026-09-01 |
| Fin | 2027-08-31 |
| Échéance | 2026-09-01 |
| Paiement reçu | 2026-08-28 |
| Allocation | 1 236 $ |
| Solde | 0 $ |
| Statut attendu | Payé |
| Doublon onboarding | Refusé |
| Doublon paiement | Refusé |

## Refresh et reconnexion

- Les données métier du parcours principal sont persistées dans Supabase dans une transaction.
- Le cache du portefeuille est vidé puis rechargé avant la redirection Dashboard.
- Une session Supabase rétablit le mode Supabase avant le chargement du portefeuille.
- La reconnexion complète avec un compte confirmé reste à exécuter après B1.

## Dashboard

Le ledger soldé retourne un solde de 0 $ et conserve les deux dates distinctes. La logique Dashboard utilise le ledger pour les soldes et retards. L’affichage Dashboard sous la session de ce compte neuf n’a pas été exécuté à cause de B0 et B1.

## Copilot

L’audit statique confirme que les réponses de paiement utilisent `rent_charges`, `payment_transactions` et `payment_allocations`, et que les derniers messages sont transmis pour résoudre un pronom comme « son ». Les cinq questions du scénario n’ont pas été envoyées à OpenAI pendant ce run.

## Confirmation email

- callback Habixa : prêt et testé pour lien invalide/expiré;
- callback exact du code : `${window.location.origin}/auth/callback?next=/onboarding`;
- URL absolue staging : indisponible tant que Habixa staging n’est pas déployé;
- redirect d’inscription : prêt;
- erreurs utilisateur : prêtes;
- configuration locale : `enable_confirmations=true`;
- configuration distante : `mailer_autoconfirm=true`, non modifiée;
- courriel réel : non testé.

## Fichiers modifiés ou ajoutés pour cette étape

- `src/lib/auth/AuthProvider.tsx`
- `src/components/AuthCard.tsx`
- `src/components/AuthRouteGate.tsx`
- `src/app/auth/callback/page.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/immeubles/page.tsx`
- `src/app/locataires/page.tsx`
- `src/app/baux/page.tsx`
- `src/app/paiements/page.tsx`
- `src/lib/data/rentLedgerService.ts`
- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/migrations/20260916031500_owner_journey_atomic_writes.sql`
- `supabase/tests/owner_journey_transactional.sql`

## Migration

`20260916031500_owner_journey_atomic_writes.sql` est appliquée sur le projet distant. Elle ajoute :

- `public.create_owner_portfolio(jsonb, jsonb, jsonb)`;
- `public.record_rent_payment(jsonb, jsonb, jsonb)`;
- droits d’exécution limités au rôle `authenticated`.

## Vérifications finales

- `npm run lint` : PASS
- `npx tsc --noEmit` : PASS
- `npm run build` : PASS — Next.js 16.3.5, 32 pages, route `/auth/callback` incluse
- `supabase db lint --linked --level warning` : PASS — aucune erreur de schéma
- `supabase migration list --linked` : PASS — migration locale et distante alignée
- `supabase db query --linked --file supabase/tests/owner_journey_transactional.sql` : PASS — transaction annulée
- `git diff --check` : PASS après normalisation des fins de fichier

# OWNER JOURNEY: FAIL

Le parcours métier principal ne présente plus de bloqueur connu dans les écritures testées. Le verdict reste FAIL tant que Habixa staging n’est pas déployé, que Confirm email n’est pas activé avec cette URL publique et qu’un compte réellement confirmé n’a pas parcouru inscription → reconnexion → Dashboard → Copilot.
