# ha base image (passed by the HA builder from build.yaml)
ARG BUILD_FROM

# first stage: build the SvelteKit app. node:22 (not alpine) for wider arch support.
FROM node:22 AS builder
WORKDIR /app

# which branch/tag of the fork to build; override at build time if needed
ARG BUILD_REF=main

# Cache-bust the clone layer: fetch the latest commit SHA of BUILD_REF first.
# When new code is pushed the SHA changes, invalidating this layer (and the
# clone below), so Rebuild always pulls the latest code instead of reusing an
# old cached git clone layer.
ADD "https://api.github.com/repos/wangyanxing/ha-fusion/commits/${BUILD_REF}" /tmp/commit.json

# clone, build and clear repo example data
# --legacy-peer-deps: the app is built with pnpm; some deps still declare a
# Svelte 4 peer that npm rejects
RUN git clone --depth 1 --branch "${BUILD_REF}" https://github.com/wangyanxing/ha-fusion . && \
  npm install --legacy-peer-deps && \
  npm run build && \
  npm prune --omit=dev --legacy-peer-deps && \
  rm -rf ./data/*

# second stage: the add-on runtime image
FROM ${BUILD_FROM}
WORKDIR /rootfs

# copy build output from the builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js .
COPY --from=builder /app/package.json .

# copy the run script
COPY run.sh /

# install node, symlink persistent data dir and make run.sh executable
RUN apk add --no-cache nodejs-current && \
  ln -s /rootfs/data /data && \
  chmod a+x /run.sh

# set environment
ENV PORT=8099 \
  NODE_ENV=production \
  ADDON=true

CMD [ "/run.sh" ]
