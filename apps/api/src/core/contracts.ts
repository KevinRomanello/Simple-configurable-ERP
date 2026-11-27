import type { db } from "../db/client";
import type { Tx } from "./tx";

// How the owners of the server (the core, the modules, the bridges) talk without knowing each other (docs/moduli-architettura.md, §5):
// not by importing each other's files, but by what the core keeps for them. Four things:
//
//   events        «this happened»: the owners that listen run in the same transaction, and one may refuse by throwing
//   questions     «who uses this?»: each owner that answers adds its part (the places that use a category, for instance)
//   ports         a question one owner asks and another, a bridge, answers; without an answer it has a plain one (nothing was paid)
//   declarations  what the core gathers from everybody at the start: flags, permissions, names for the History
//
// Everything is registered at the start, with the name of who registers; whoever asks passes `active`, who is on for this request, and the
// ones that are off are skipped. So an owner never has to know that another can be turned off. It is all plain functions in one process:
// a call costs a map lookup and a loop, not a request.

/** What a listener or an answer reads and writes with: the transaction of the request that sent the event, or the pool when it is only a read. */
export type Db = typeof db | Tx;

/** Who answers for the request being served: the modules that are on, and the bridges whose modules are all on. */
export interface Active {
  has(owner: string): boolean;
}

/** Everybody is on: what a request sees when no module has been turned off. */
export const ALL_ACTIVE: Active = { has: () => true };

/**
 * Who is on once the modules in `off` are turned off: everybody but them, and but every bridge that needs one of them.
 * Built once per request, from one small read of the switches, and then asked as often as needed.
 */
export function activeOwners(off: Iterable<string>, bridges: Record<string, string[]>): Active {
  const gone = new Set(off);
  for (const [bridge, modules] of Object.entries(bridges)) if (modules.some((m) => gone.has(m))) gone.add(bridge);
  return gone.size === 0 ? ALL_ACTIVE : { has: (owner) => !gone.has(owner) };
}

/**
 * When an event or a question reaches the owners that are off. `feature` (show, calculate, count the uses, send a webhook): only the ones
 * that are on. `data` (keep the data in order: a renamed category in the lines of a module that is off): everybody, so that turning the
 * module on again finds the data right.
 */
export type Reach = "feature" | "data";

export interface EventDef<P> {
  readonly name: string;
  readonly reach: Reach;
  /** Never set: only carries the type of what is sent. */
  readonly payload?: P;
}
export interface QuestionDef<In, Out> {
  readonly name: string;
  readonly reach: Reach;
  readonly input?: In;
  readonly output?: Out;
}
export interface PortDef<In, Out> {
  readonly name: string;
  /** Who asks. */
  readonly owner: string;
  /** What the answer is when nobody answers (or the one who does is off): what the code did before there was a bridge. */
  readonly fallback: (input: In) => Out | Promise<Out>;
}
export interface DeclarationDef<T> {
  readonly name: string;
  readonly value?: T;
}

export const defineEvent = <P>(name: string, reach: Reach): EventDef<P> => ({ name, reach });
export const defineQuestion = <In, Out>(name: string, reach: Reach): QuestionDef<In, Out> => ({ name, reach });
export const definePort = <In, Out>(name: string, owner: string, fallback: (input: In) => Out | Promise<Out>): PortDef<In, Out> => ({ name, owner, fallback });
export const defineDeclaration = <T>(name: string): DeclarationDef<T> => ({ name });

interface Entry<V> {
  owner: string;
  value: V;
}

type Listener = (tx: Db, payload: never) => unknown;

/** One place that keeps who listens and who answers. The server has one (`contracts`); a test makes its own. */
export function createContracts() {
  const listeners = new Map<string, Entry<Listener>[]>();
  const answerers = new Map<string, Entry<Listener>[]>();
  const ports = new Map<string, Entry<Listener>>();
  const declarations = new Map<string, Entry<unknown>[]>();
  const add = <V>(map: Map<string, Entry<V>[]>, name: string, entry: Entry<V>) => map.set(name, [...(map.get(name) ?? []), entry]);
  // an owner that is off is skipped unless the thing is `data`; no list is made on the way, because this runs inside requests
  const reaches = (reach: Reach, active: Active, owner: string) => reach === "data" || active.has(owner);

  return {
    /** `owner` listens to an event. */
    on<P>(event: EventDef<P>, owner: string, listener: (tx: Db, payload: P) => void | Promise<void>) {
      add(listeners, event.name, { owner, value: listener as Listener });
    },
    /** Tells the listeners, one after the other and in the same transaction; an error of one stops the rest and goes back to who sent it. */
    async emit<P>(event: EventDef<P>, active: Active, tx: Db, payload: P): Promise<void> {
      for (const l of listeners.get(event.name) ?? []) if (reaches(event.reach, active, l.owner)) await l.value(tx, payload as never);
    },

    /** `owner` answers a question with its part. */
    answer<In, Out>(question: QuestionDef<In, Out>, owner: string, answer: (tx: Db, input: In) => Out | Promise<Out>) {
      add(answerers, question.name, { owner, value: answer as Listener });
    },
    /** What every owner that answers says, in the order they registered. */
    async collect<In, Out>(question: QuestionDef<In, Out>, active: Active, tx: Db, input: In): Promise<Out[]> {
      const out: Out[] = [];
      for (const a of answerers.get(question.name) ?? []) if (reaches(question.reach, active, a.owner)) out.push((await a.value(tx, input as never)) as Out);
      return out;
    },

    /** `owner` (a bridge) fills a port. A port has one answer: filling it twice is a mistake of the code. */
    fill<In, Out>(port: PortDef<In, Out>, owner: string, answer: (tx: Db, input: In) => Out | Promise<Out>) {
      if (ports.has(port.name)) throw new Error(`The port ${port.name} is already filled by ${ports.get(port.name)!.owner}`);
      ports.set(port.name, { owner, value: answer as Listener });
    },
    /** What the port answers, or its plain answer when nobody fills it or the one who does is off. */
    async ask<In, Out>(port: PortDef<In, Out>, active: Active, tx: Db, input: In): Promise<Out> {
      const filled = ports.get(port.name);
      if (filled && active.has(filled.owner)) return (await filled.value(tx, input as never)) as Out;
      return port.fallback(input);
    },

    /** `owner` declares something at the start (a flag, a permission, how to name a row in the History). */
    declare<T>(kind: DeclarationDef<T>, owner: string, value: T) {
      add(declarations, kind.name, { owner, value });
    },
    /** Everything declared of a kind by the owners that are on, in the order they were declared. */
    declared<T>(kind: DeclarationDef<T>, active: Active): T[] {
      return (declarations.get(kind.name) ?? []).filter((d) => active.has(d.owner)).map((d) => d.value as T);
    },
  };
}

/** The contracts of the server: the owners register here when their files are loaded. */
export const contracts = createContracts();
