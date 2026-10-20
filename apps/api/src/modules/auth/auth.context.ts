import { AsyncLocalStorage } from "node:async_hooks";
import type { User } from "./auth.service";

/**
 * The signed-in user of the request being handled. The auth hook fills it before the route runs,
 * so services can ask for the user with getCurrentUser() and no argument.
 */
export const userStorage = new AsyncLocalStorage<User>();
