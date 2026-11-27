import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, shortText } from "../../core/validation";
import { ITEM_FIELDS } from "../../platform/lookups/defaults";
import { addPart, getComponent, getPlan, listComponents, removePart, updatePart } from "./components.service";
import { addDatasheet, getDatasheet, removeDatasheet } from "./datasheets.service";
import {
  buildInput, componentsQuery, createItemInput, createParamInput, createTypeInput, DATASHEET_LIMITS, datasheetQuery, imageInput, itemsQuery, movementInput,
  orderInput, paramFilters, partInput, planQuery, priceQuery, receiveInput, statsQuery, updateItemInput, updateParamInput, updatePartInput, updateTypeInput,
} from "./inventory.schema";
import { createItem, deleteItem, getImage, getItem, listItems, removeImage, setImage, updateItem } from "./items.service";
import {
  createLocation, createUnit, deleteLocation, deleteUnit, getCategoryFields, listLocations, listUnits, orderLocations, readLists, renameUnit,
  setCategoryFields, setUncategorizedFields, updateLocation,
} from "./lists.service";
import { addMovement, build, receive, undoMovement } from "./movements.service";
import { getStats } from "./stats.service";
import { addParam, createType, deleteParam, deleteType, listTypes, orderParams, updateParam, updateType } from "./types.service";

const itemParam = z.object({ id });
const partParams = z.object({ id, partId: id });

/** The optional fields of an item a category shows. */
const fields = z.array(z.enum(ITEM_FIELDS)).max(ITEM_FIELDS.length);
/** The room, shelf or level of a place: a name; the shelf and the level can be nothing. */
const placeName = shortText(60);
const placePart = z.union([z.literal(""), placeName]);

/** The inventory over HTTP, under /api/inventory: app.ts gives the prefix, so the paths here start after it. */
export async function inventoryRoutes(app: FastifyInstance) {
  // items
  app.get("/items", (request) =>
    listItems({ ...itemsQuery.parse(request.query), params: paramFilters(request.query as Record<string, unknown>) }),
  );
  app.get("/items/:id", (request) => getItem(itemParam.parse(request.params).id, priceQuery.parse(request.query)));
  app.post("/items", async (request, reply) => reply.code(201).send(await createItem(createItemInput.parse(request.body))));
  app.patch("/items/:id", (request) => updateItem(itemParam.parse(request.params).id, updateItemInput.parse(request.body)));
  app.delete("/items/:id", async (request, reply) => {
    await deleteItem(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });

  // pictures: sent as JSON (base64, already shrunk by the browser), served as the image itself
  app.put("/items/:id/image", { bodyLimit: 1_500_000 }, async (request, reply) => {
    await setImage(itemParam.parse(request.params).id, imageInput.parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/items/:id/image", async (request, reply) => {
    await removeImage(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.get("/items/:id/image", async (request, reply) => {
    const { id: itemId } = itemParam.parse(request.params);
    const { size } = z.object({ size: z.enum(["thumb", "full"]).default("thumb") }).parse(request.query);
    const picture = await getImage(itemId, size);
    // The picture rarely changes: the browser may keep it, but asks first whether it is still the same one.
    const etag = `"${picture.version}-${size}"`;
    reply.header("ETag", etag).header("Cache-Control", "private, max-age=0, must-revalidate");
    if (request.headers["if-none-match"] === etag) return reply.code(304).send();
    return reply.type(picture.mime).send(picture.data);
  });

  // data sheets: the PDF itself is the body of the request; the list of an item says only what they are, and
  // the bytes are read when one is opened
  const datasheetBytes = DATASHEET_LIMITS.bytes + 4_096;
  app.addContentTypeParser("application/pdf", { parseAs: "buffer", bodyLimit: datasheetBytes }, (_request, body, done) => done(null, body));
  app.post("/items/:id/datasheets", { bodyLimit: datasheetBytes }, async (request, reply) => {
    const { name } = datasheetQuery.parse(request.query);
    return reply.code(201).send(await addDatasheet(itemParam.parse(request.params).id, name, request.body));
  });
  app.get("/datasheets/:id", async (request, reply) => {
    const sheet = await getDatasheet(itemParam.parse(request.params).id);
    const filename = encodeURIComponent(/\.pdf$/i.test(sheet.name) ? sheet.name : `${sheet.name}.pdf`);
    // the API says "nothing may be loaded from me" about everything it sends, which a PDF viewer does not
    // accept; what is sent is only a PDF (checked on the way in, and nosniff keeps it so)
    return reply
      .header("Content-Security-Policy", "frame-ancestors 'none'")
      .header("Content-Disposition", `inline; filename*=UTF-8''${filename}`)
      .header("Cache-Control", "private, max-age=3600")
      .type("application/pdf")
      .send(sheet.data);
  });
  app.delete("/datasheets/:id", async (request, reply) => {
    await removeDatasheet(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });

  // goods arriving and moving
  app.post("/receive", async (request, reply) => reply.code(201).send(await receive(receiveInput.parse(request.body))));
  app.post("/movements", async (request, reply) => reply.code(201).send(await addMovement(movementInput.parse(request.body))));

  app.delete("/movements/:id", async (request, reply) => {
    await undoMovement(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });

  // things we make
  app.post("/builds", async (request, reply) => reply.code(201).send(await build(buildInput.parse(request.body))));
  app.get("/components", (request) => listComponents(componentsQuery.parse(request.query)));
  app.get("/components/:id/plan", (request) => getPlan(itemParam.parse(request.params).id, planQuery.parse(request.query)));
  app.get("/components/:id", (request) => getComponent(itemParam.parse(request.params).id, priceQuery.parse(request.query)));
  app.post("/components/:id/parts", async (request, reply) =>
    reply.code(201).send(await addPart(itemParam.parse(request.params).id, partInput.parse(request.body))),
  );
  app.patch("/components/:id/parts/:partId", (request) => {
    const { id: componentId, partId } = partParams.parse(request.params);
    return updatePart(componentId, partId, updatePartInput.parse(request.body));
  });
  app.delete("/components/:id/parts/:partId", async (request, reply) => {
    const { id: componentId, partId } = partParams.parse(request.params);
    await removePart(componentId, partId);
    return reply.code(204).send();
  });

  // the types of item and their parameters (kept on the Settings page)
  app.get("/types", () => listTypes());
  app.post("/types", async (request, reply) => reply.code(201).send(await createType(createTypeInput.parse(request.body))));
  app.patch("/types/:id", (request) => updateType(itemParam.parse(request.params).id, updateTypeInput.parse(request.body)));
  app.delete("/types/:id", async (request, reply) => {
    await deleteType(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.post("/types/:id/params", async (request, reply) =>
    reply.code(201).send(await addParam(itemParam.parse(request.params).id, createParamInput.parse(request.body))),
  );
  app.put("/types/:id/params/order", async (request, reply) => {
    await orderParams(itemParam.parse(request.params).id, orderInput.parse(request.body).ids);
    return reply.code(204).send();
  });
  app.patch("/params/:id", (request) => updateParam(itemParam.parse(request.params).id, updateParamInput.parse(request.body)));
  app.delete("/params/:id", async (request, reply) => {
    await deleteParam(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });

  // the lists the inventory is written with: what the forms offer, and the Settings page that keeps them
  app.get("/locations", () => listLocations());
  app.get("/units", () => listUnits());
  app.get("/category-fields", () => getCategoryFields());
  app.get("/lists", () => readLists());
  app.put("/category-fields/:id", async (request, reply) => {
    await setCategoryFields(itemParam.parse(request.params).id, z.object({ fields }).parse(request.body).fields);
    return reply.code(204).send();
  });
  app.put("/uncategorized-fields", async (request, reply) => {
    await setUncategorizedFields(z.object({ fields }).parse(request.body).fields);
    return reply.code(204).send();
  });
  app.post("/units", async (request, reply) => reply.code(201).send(await createUnit(z.object({ name: shortText(20) }).parse(request.body).name)));
  app.patch("/units/:id", async (request, reply) => {
    await renameUnit(itemParam.parse(request.params).id, z.object({ name: shortText(20) }).parse(request.body).name);
    return reply.code(204).send();
  });
  app.delete("/units/:id", async (request, reply) => {
    await deleteUnit(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.post("/locations", async (request, reply) =>
    reply.code(201).send(await createLocation(z.object({ room: placeName, shelf: placePart.optional(), levels: z.array(placeName).min(1).max(40).optional() }).parse(request.body))),
  );
  app.patch("/locations/:id", async (request, reply) => {
    await updateLocation(itemParam.parse(request.params).id, z.object({ room: placeName.optional(), shelf: placePart.optional(), level: placePart.optional() }).parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/locations/:id", async (request, reply) => {
    await deleteLocation(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.put("/locations/order", async (request, reply) => {
    await orderLocations(orderInput.parse(request.body).ids);
    return reply.code(204).send();
  });

  app.get("/stats", (request) => {
    const query = statsQuery.parse(request.query);
    return getStats(query.by, query.basis);
  });
}
