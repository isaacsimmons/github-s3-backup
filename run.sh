#!/usr/bin/env bash

set -euo pipefail

docker build . -t ghbu
docker run --env-file .env --name ghbu --rm ghbu
