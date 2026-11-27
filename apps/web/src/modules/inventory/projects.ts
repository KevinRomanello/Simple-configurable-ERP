import { useQuery } from "@tanstack/react-query";
import { useSlot } from "../../core/slots";
import { purposeProjects } from "./slots";
import type { ProjectRef } from "./types";

const none = async (): Promise<ProjectRef[]> => [];

/**
 * The projects a movement, an arrival or a build can be for (docs/inventario.md), from the slot the bridge to the budget fills. `available`
 * is false while the budget is off: there are no projects, and the forms do not ask for one.
 */
export function useProjects(enabled = true): { data: ProjectRef[] | undefined; available: boolean } {
  const [ask] = useSlot(purposeProjects);
  const projects = useQuery({ queryKey: ["inventory-projects"], queryFn: ask ?? none, enabled: enabled && ask !== undefined });
  return { data: projects.data, available: ask !== undefined };
}
