import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../core/validation";
import { addPart, getComponent, listComponents, removePart, updatePart } from "./components.service";
import {
  createItemInput, imageInput, itemsQuery, movementInput, partInput, priceQuery, receiveInput, statsQuery,
  updateItemInput, updatePartInput,
} from "./inventory.schema";
import { createItem, deleteItem, getImage, getItem, listItems, removeImage, setImage, updateItem } from "./items.service";
import { addMovement, listPending, receive } from "./movements.service";
import { getStats, listProjects } from "./stats.service";

const itemParam = z.object({ id });
const partParams = z.object({ id, partId: id });

export async function inventoryRoutes(app: FastifyInstance) {
  // items
  app.get("/inventory/items", (request) => listItems(itemsQuery.parse(request.query)));
  app.get("/inventory/items/:id", (request) => getItem(itemParam.parse(request.params).id, priceQuery.parse(request.query)));
  app.post("/inventory/items", async (request, reply) => reply.code(201).send(await createItem(createItemInput.parse(request.body))));
  app.patch("/inventory/items/:id", (request) => updateItem(itemParam.parse(request.params).id, updateItemInput.parse(request.body)));
  app.delete("/inventory/items/:id", async (request, reply) => {
    await deleteItem(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });

  // pictures: sent as JSON (base64, already shrunk by the browser), served as the image itself
  app.put("/inventory/items/:id/image", { bodyLimit: 1_500_000 }, async (request, reply) => {
    await setImage(itemParam.parse(request.params).id, imageInput.parse(request.body));
    return reply.code(204).send();
  });
  app.delete("/inventory/items/:id/image", async (request, reply) => {
    await removeImage(itemParam.parse(request.params).id);
    return reply.code(204).send();
  });
  app.get("/inventory/items/:id/image", async (request, reply) => {
    const { id: itemId } = itemParam.parse(request.params);
    const { size } = z.object({ size: z.enum(["thumb", "full"]).default("thumb") }).parse(request.query);
    const picture = await getImage(itemId, size);
    // The picture rarely changes: the browser may keep it, but asks first whether it is still the same one.
    const etag = `"${picture.version}-${size}"`;
    reply.header("ETag", etag).header("Cache-Control", "private, max-age=0, must-revalidate");
    if (request.headers["if-none-match"] === etag) return reply.code(304).send();
    return reply.type(picture.mime).send(picture.data);
  });

  // goods arriving and moving
  app.get("/inventory/pending", () => listPending());
  app.post("/inventory/receive", async (request, reply) => reply.code(201).send(await receive(receiveInput.parse(request.body))));
  app.post("/inventory/movements", async (request, reply) => reply.code(201).send(await addMovement(movementInput.parse(request.body))));

  // things we make
  app.get("/inventory/components", (request) => listComponents(priceQuery.parse(request.query)));
  app.get("/inventory/components/:id", (request) => getComponent(itemParam.parse(request.params).id, priceQuery.parse(request.query)));
  app.post("/inventory/components/:id/parts", async (request, reply) =>
    reply.code(201).send(await addPart(itemParam.parse(request.params).id, partInput.parse(request.body))),
  );
  app.patch("/inventory/components/:id/parts/:partId", (request) => {
    const { id: componentId, partId } = partParams.parse(request.params);
    return updatePart(componentId, partId, updatePartInput.parse(request.body));
  });
  app.delete("/inventory/components/:id/parts/:partId", async (request, reply) => {
    const { id: componentId, partId } = partParams.parse(request.params);
    await removePart(componentId, partId);
    return reply.code(204).send();
  });

  app.get("/inventory/projects", () => listProjects());

  app.get("/inventory/stats", (request) => {
    const query = statsQuery.parse(request.query);
    return getStats(query.by, query.basis);
  });
}
