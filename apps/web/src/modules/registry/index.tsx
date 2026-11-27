import { faAddressBook, faPenToSquare, faTableList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { MenuLink, type Manifest } from "../../platform/manifest";
import type { Me } from "../../platform/types";
import { registry } from "./api";
import { FormPage } from "./FormPage";
import { RegistryHome } from "./RegistryHome";
import { RegistrySettings } from "./RegistrySettings";
import { TablePage } from "./TablePage";

const useTables = () => useQuery({ queryKey: ["registry-tables"], queryFn: registry.tables });
const useMyForms = () => useQuery({ queryKey: ["registry-forms"], queryFn: registry.myForms });

/** The group of the registry: an admin always sees it, the others when they have a table to look at or a form to fill in. */
function useRegistryShown(me: Me) {
  const tables = useTables();
  const forms = useMyForms();
  return me.role === "admin" || (tables.data?.length ?? 0) > 0 || (forms.data?.length ?? 0) > 0;
}

/** The registries of the team and the forms the person may fill in (docs/anagrafiche.md). */
function RegistryLinks() {
  const tables = useTables();
  const forms = useMyForms();
  return (
    <>
      <MenuLink to="/registry" icon={faAddressBook} end>REGISTRY</MenuLink>
      {tables.data?.map((t) => (
        <MenuLink key={t.id} to={`/registry/${t.id}`} icon={faTableList}>{`${t.icon ? `${t.icon} ` : ""}${t.name}`}</MenuLink>
      ))}
      {forms.data?.map((f) => (
        <a key={f.id} className="nav-link" href={`/forms/${f.slug}`}>
          <FontAwesomeIcon icon={faPenToSquare} fixedWidth />
          {f.name}
        </a>
      ))}
    </>
  );
}

/** The registry (docs/anagrafiche.md, docs/moduli-architettura.md §7.2): its tables, its public forms, and its section of Settings. */
export const registryManifest: Manifest = {
  key: "registry",
  routes: [
    { path: "registry", element: <RegistryHome /> },
    { path: "registry/:table", element: <TablePage /> },
  ],
  // a form of the registry stands alone, and opens without signing in when it is public
  openRoutes: [{ path: "forms/:slug", element: <FormPage /> }],
  menuGroups: [{ id: "registry", title: "Registry", order: 70, paths: ["/registry"], useShown: useRegistryShown }],
  menu: [{ group: "registry", order: 10, element: <RegistryLinks /> }],
  // the people of the registry, the roles of the ERP taken from it and the keys of the services: admins
  settings: [{ key: "registry", label: "Registry", order: 40, allowed: (me) => me.permissions.canManageSettings, Content: RegistrySettings }],
  home: () => <Navigate to="/registry" replace />,
};
