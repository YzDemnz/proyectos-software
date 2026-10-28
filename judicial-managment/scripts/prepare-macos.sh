#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script debe ejecutarse en macOS."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Falta Git. Ejecuta: xcode-select --install"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js. Instala la version LTS desde https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Falta npm. Reinstala Node.js LTS."
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 20 )); then
  echo "Judicial requiere Node.js 20 o superior. Se recomienda Node.js 22 LTS."
  exit 1
fi

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Faltan las herramientas de Apple. Ejecuta: xcode-select --install"
  exit 1
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if [[ ! -f ".env.local" ]]; then
  cp ".env.example" ".env.local"
  echo "Se creo .env.local. Completa las variables de Supabase antes de iniciar."
fi

echo "Instalando dependencias verificadas..."
npm ci

echo "Comprobando TypeScript..."
npm run typecheck

echo
echo "Mac preparado."
echo "Prueba la app con: npm run dev"
echo "Genera DMG y ZIP con: npm run desktop:build:mac"
