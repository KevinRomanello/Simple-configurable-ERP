import type { FastifyInstance } from "fastify";
import {
  createCashCategory, createCashMethod, deleteCashCategory, deleteCashMethod, listCashCategories, listCashMethods,
  orderCashCategories, orderCashMethods, renameCashMethod, updateCashCategory,
} from "./cash-lists.service";
import { applyImport, previewImport } from "./cash-import.service";
import { applyInput, createEntryInput, previewInput, entryParam, listInput, openingInput, orderInput, registerQuery, updateEntryInput, updateListInput } from "./cash.schema";
import { assertCanManageCash, createEntry, deleteEntry, getRegister, setOpening, updateEntry } from "./cash.service";
import { getStatement } from "./statement.service";

// The register of the team's money, and its two lists, under /api/treasury (app.ts gives the prefix). Only the treasury and the admins (every service checks it).
export async function cashRoutes(app: FastifyInstance) {
  app.get("/register", (request) => getRegister(registerQuery.parse(request.query).year));
  app.post("/entries", async (request, reply) => reply.code(201).send(await createEntry(createEntryInput.parse(request.body))));
  app.patch("/entries/:id", (request) => updateEntry(entryParam.parse(request.params).id, updateEntryInput.parse(request.body)));
  app.delete("/entries/:id", async (request, reply) => {
    await deleteEntry(entryParam.parse(request.params).id);
    return reply.code(204).send();
  });
  // the financial statement of a year, as the sheet of the treasury works it out
  app.get("/statement", (request) => getStatement(registerQuery.parse(request.query).year));
  app.put("/openings", async (request, reply) => {
    await setOpening(openingInput.parse(request.body));
    return reply.code(204).send();
  });

  // the sheet of the treasury: a check that saves nothing, then the two ways of applying it
  app.post("/import/preview", { bodyLimit: 5_000_000 }, (request) => {
    const { year, outside, ...sheet } = previewInput.parse(request.body);
    return previewImport(sheet, { year, outside });
  });
  app.post("/import", { bodyLimit: 5_000_000 }, (request) => applyImport(applyInput.parse(request.body)));

  app.get("/categories", async () => (await assertCanManageCash(), listCashCategories()));
  app.post("/categories", async (request, reply) => reply.code(201).send(await createCashCategory(listInput.parse(request.body))));
  app.patch("/categories/:id", async (request, reply) => {
    await updateCashCategory(entryParam.parse(request.params).id, updateListInput.parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/categories/:id", async (request, reply) => {
    await deleteCashCategory(entryParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.put("/categories/order", async (request, reply) => {
    await orderCashCategories(orderInput.parse(request.body).ids);
    return reply.code(204).send();
  });

  app.get("/methods", async () => (await assertCanManageCash(), listCashMethods()));
  app.post("/methods", async (request, reply) => reply.code(201).send(await createCashMethod(listInput.parse(request.body))));
  app.patch("/methods/:id", async (request, reply) => {
    await renameCashMethod(entryParam.parse(request.params).id, updateListInput.parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/methods/:id", async (request, reply) => {
    await deleteCashMethod(entryParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.put("/methods/order", async (request, reply) => {
    await orderCashMethods(orderInput.parse(request.body).ids);
    return reply.code(204).send();
  });
}
