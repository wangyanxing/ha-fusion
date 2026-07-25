#!/usr/bin/with-contenv bashio

# Inject the Home Assistant core port and this add-on's exposed port so
# server.js (ADDON=true) can build the correct proxy target for ingress.
export HASS_PORT=$(bashio::core.port)
export EXPOSED_PORT=$(bashio::addon.port "8099/tcp")

echo "Starting Fusion (Custom)..."

node server.js
