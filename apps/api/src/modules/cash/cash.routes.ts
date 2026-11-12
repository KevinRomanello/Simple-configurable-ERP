import type { FastifyInstance } from "fastify";
import {
  createCashCategory, createCashMethod, deleteCashCategory, deleteCashMethod, listCashCategories, listCashMethods, listCategoryDefaults,
  orderCashCategories, orderCashMethods, renameCashMethod, setCategoryDefault, updateCashCategory,
} from "./cash-lists.service";
import { applyImport, previewImport } from "./cash-import.service";
import { listPayableLines, listToLink, listToPay, payLines, setEntryLines } from "./cash-links.service";
import { applyInput, categoryDefaultInput, createEntryInput, linesInput, payInput, toPayQuery, previewInput, entryParam, listInput, openingInput, orderInput, registerQuery, updateEntryInput, updateListInput } from "./cash.schema";
import { assertCanManageCash, createEntry, deleteEntry, getRegister, setOpening, updateEntry } from "./cash.service";
import { getStatement } from "./statement.service";

// The register of the team's money, and its two lists. Only the treasury and the admins (every service checks it).
export async function cashRoutes(app: FastifyInstance) {
  app.get("/cash/register", (request) => getRegister(registerQuery.parse(request.query).year));
  app.post("/cash/entries", async (request, reply) => reply.code(201).send(await createEntry(createEntryInput.parse(request.body))));
  app.patch("/cash/entries/:id", (request) => updateEntry(entryParam.parse(request.params).id, updateEntryInput.parse(request.body)));
  app.delete("/cash/entries/:id", async (request, reply) => {
    await deleteEntry(entryParam.parse(request.params).id);
    return reply.code(204).send();
  });
  // the financial statement of a year, as the sheet of the treasury works it out
  app.get("/cash/statement", (request) => getStatement(registerQuery.parse(request.query).year));
  // the payments of the register tied to the lines of the budget
  app.get("/cash/payable-lines", () => listPayableLines());
  app.put("/cash/entries/:id/lines", async (request, reply) => {
    await setEntryLines(entryParam.parse(request.params).id, linesInput.parse(request.body).lines);
    return reply.code(204).send();
  });
  // TO PAY: what the team still owes of the lines bought, the button that pays them, and the payments to tie
  app.get("/cash/to-pay", (request) => listToPay(toPayQuery.parse(request.query).allSeasons !== undefined));
  app.post("/cash/to-pay/pay", async (request, reply) => reply.code(201).send(await payLines(payInput.parse(request.body))));
  app.get("/cash/to-link", () => listToLink());
  app.get("/cash/category-defaults", () => listCategoryDefaults());
  app.put("/cash/category-defaults/:id", async (request, reply) => {
    await setCategoryDefault(entryParam.parse(request.params).id, categoryDefaultInput.parse(request.body).voceId);
    return reply.code(204).send();
  });
  app.put("/cash/openings", async (request, reply) => {
    await setOpening(openingInput.parse(request.body));
    return reply.code(204).send();
  });

  // the sheet of the treasury: a check that saves nothing, then the two ways of applying it
  app.post("/cash/import/preview", { bodyLimit: 5_000_000 }, (request) => {
    const { year, outside, ...sheet } = previewInput.parse(request.body);
    return previewImport(sheet, { year, outside });
  });
  app.post("/cash/import", { bodyLimit: 5_000_000 }, (request) => applyImport(applyInput.parse(request.body)));

  app.get("/cash/categories", async () => (await assertCanManageCash(), listCashCategories()));
  app.post("/cash/categories", async (request, reply) => reply.code(201).send(await createCashCategory(listInput.parse(request.body))));
  app.patch("/cash/categories/:id", async (request, reply) => {
    await updateCashCategory(entryParam.parse(request.params).id, updateListInput.parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/cash/categories/:id", async (request, reply) => {
    await deleteCashCategory(entryParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.put("/cash/categories/order", async (request, reply) => {
    await orderCashCategories(orderInput.parse(request.body).ids);
    return reply.code(204).send();
  });

  app.get("/cash/methods", async () => (await assertCanManageCash(), listCashMethods()));
  app.post("/cash/methods", async (request, reply) => reply.code(201).send(await createCashMethod(listInput.parse(request.body))));
  app.patch("/cash/methods/:id", async (request, reply) => {
    await renameCashMethod(entryParam.parse(request.params).id, updateListInput.parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/cash/methods/:id", async (request, reply) => {
    await deleteCashMethod(entryParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.put("/cash/methods/order", async (request, reply) => {
    await orderCashMethods(orderInput.parse(request.body).ids);
    return reply.code(204).send();
  });
}
