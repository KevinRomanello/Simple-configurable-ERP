# Development image shared by the api and web services.
# Dependencies are installed here; source folders are bind-mounted by docker-compose.yml
# so edits on the host reload the running container without a rebuild.
FROM node:26-slim

RUN npm install -g pnpm@12.14.0

WORKDIR /app

# Copy only the manifests first: the dependency layer is rebuilt only when they change.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/calc/package.json packages/calc/
COPY tools/import-xlsx/package.json tools/import-xlsx/
RUN pnpm install --frozen-lockfile

COPY . .
