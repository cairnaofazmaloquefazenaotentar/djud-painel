#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/mnt/data/djud-painel"
STATE_DIR="/mnt/data/djud-painel-data/deploy"
STATE_FILE="${STATE_DIR}/deployed-revision"
IMAGE="djud-painel-djud-painel:latest"
ROLLBACK_IMAGE="djud-painel-djud-painel:rollback"
HEALTH_URL="http://127.0.0.1:3095/djud-painel/login"

log() {
  logger -t djud-painel-deploy "$*"
  printf '%s\n' "$*"
}

cd "$APP_DIR"
mkdir -p "$STATE_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  log "Atualizacao ignorada: diretorio de trabalho possui alteracoes locais."
  exit 1
fi

git fetch --quiet origin main
target_revision="$(git rev-parse origin/main)"
deployed_revision="$(cat "$STATE_FILE" 2>/dev/null || git rev-parse HEAD)"

if [[ "$target_revision" == "$deployed_revision" ]]; then
  log "Sem nova versao aprovada para publicar."
  exit 0
fi

# Mudancas de banco exigem uma migracao revisada, com backup e validacao de dados.
if ! git diff --quiet "$deployed_revision" "$target_revision" -- prisma/schema.prisma; then
  log "Atualizacao bloqueada: schema Prisma mudou e requer migracao manual."
  exit 1
fi

git merge --ff-only "$target_revision"

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker image tag "$IMAGE" "$ROLLBACK_IMAGE"
fi

docker build --network host -t "$IMAGE" .
docker compose up -d --force-recreate

for attempt in {1..12}; do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
    printf '%s\n' "$target_revision" > "$STATE_FILE"
    log "Versao ${target_revision} publicada com sucesso."
    exit 0
  fi
  sleep 5
done

log "Health check falhou; retornando para a imagem anterior."
if docker image inspect "$ROLLBACK_IMAGE" >/dev/null 2>&1; then
  docker image tag "$ROLLBACK_IMAGE" "$IMAGE"
  docker compose up -d --force-recreate
fi
exit 1
