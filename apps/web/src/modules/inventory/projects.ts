import { useQuery } from "@tanstack/react-query";
import { useSlot } from "../../core/slots";
import { purposeProjects } from "./public";
import type { ProjectRef } from "./types";

const none = async (): Promise<ProjectRef[]> => [];

/** The projects a movement, an arrival or a build can be for (docs/inventario.md), from the slot the bridge to the budget fills. */
export function useProjects(enabled = true) {
  const [ask] = useSlot(purposeProjects);
  return useQuery({ queryKey: ["inventory-projects"], queryFn: ask ?? none, enabled: enabled && ask !== undefined });
}
