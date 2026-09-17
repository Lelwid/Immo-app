import { RouteShell } from "@/app/components/route-shell";

const settingsSections = [
  {
    description: "Gérez votre profil, votre session et les accès connectés depuis le menu utilisateur du header.",
    title: "Compte",
  },
  {
    description: "Nexbail utilise le Québec et le dollar canadien comme région et devise par défaut pour le MVP.",
    title: "Région et devise",
  },
  {
    description: "Le mode local démo et le mode Supabase restent disponibles dans le menu utilisateur.",
    title: "Mode de données",
  },
  {
    description: "Le thème clair ou sombre se contrôle avec le bouton de thème dans le header global.",
    title: "Apparence",
  },
];

export default function SettingsPage() {
  return (
    <RouteShell title="Paramètres" description="Centralisez les préférences de votre espace Nexbail.">
      <section className="grid gap-4 md:grid-cols-2">
        {settingsSections.map((section) => (
          <article key={section.title} className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-base font-semibold text-[var(--foreground)]">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{section.description}</p>
          </article>
        ))}
      </section>
    </RouteShell>
  );
}
