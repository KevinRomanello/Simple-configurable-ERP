import { Navigate, useParams } from "react-router";
import { PageHeader, Tabs } from "../core/ui";
import { useMe } from "./auth";
import { useManifests } from "./manifest";
import { currentSection, settingsSections } from "./settingsSections";

/**
 * Settings, a section at a time (docs/impostazioni.md). Each module that is on brings its sections and says who may use them: the
 * budget (seasons, the switches of the calculation, VAT rates; admins), the inventory (categories, types, units, places; admins and
 * users), the register of the treasury (the Voci and the payment methods; admins and users with the treasury box), the registry
 * (admins); the platform brings the App (how the site looks, for everyone; the switches of the site and the modules, for admins).
 * Each section has its address (`/settings/budget`…), and a person sees only the sections they can use. A change applies at once to
 * every page and goes into the history. Not designed in Figma: built from the models of the interface (the sections are the tabs of the page).
 */
export function SettingsPage() {
  const me = useMe();
  const sections = settingsSections(useManifests(), me);
  const allowed = sections.map((s) => s.key);
  const asked = useParams().section;
  const section = currentSection(allowed, asked);

  // an address that is not one of the person's sections goes to the first of them (a viewer has one only: no tabs, no redirect)
  if (allowed.length > 1 && asked !== section) return <Navigate to={`/settings/${section}`} replace />;
  const { Content } = sections.find((s) => s.key === section)!;

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          allowed.length === 1
            ? "How the site looks for you. The other settings are kept by an admin, a user or the treasury."
            : "How the site looks, and the lists and switches the other pages work from. A change applies at once to every page and goes into the History. Something in use cannot be deleted."
        }
        notice={allowed.length === 1 && me.readOnly ? "Editing is turned off on phones: use a computer for the other settings." : undefined}
        tabs={allowed.length > 1 && <Tabs label="Sections of the settings" tabs={sections.map((s) => ({ key: s.key, label: s.label, to: `/settings/${s.key}` }))} />}
      />
      <Content />
    </>
  );
}
