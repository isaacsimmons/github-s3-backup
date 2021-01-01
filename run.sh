#!/usr/bin/env bash

set -euo pipefail

docker build . -t ghbu
docker run --env-file .env --name ghbu --rm ghbu node index.js
# TODO: make a yarn target for run
