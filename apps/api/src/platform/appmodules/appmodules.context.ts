import { AsyncLocalStorage } from "node:async_hooks";
import type { Active } from "../../core/contracts";

/**
 * Who is on for the request being handled: the gate of the modules reads the switches once, before the route runs, and every
 * question, event and port of the request is asked of the same owners (docs/moduli-architettura.md, §8.3).
 */
export const activeStorage = new AsyncLocalStorage<Active>();
