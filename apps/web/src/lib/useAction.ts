import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNotify } from "../components/Notice";

/**
 * Runs a write: a refused one (validation, conflict, in use) becomes a message in the corner,
 * and in every case the screen reloads its data so it shows what the server really has.
 * Returns true when the write went through.
 */
export function useAction() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  return useCallback(
    async (work: () => Promise<unknown>) => {
      try {
        await work();
        return true;
      } catch (error) {
        notify("error", error instanceof Error ? error.message : "Something went wrong");
        return false;
      } finally {
        await queryClient.invalidateQueries();
      }
    },
    [queryClient, notify],
  );
}
