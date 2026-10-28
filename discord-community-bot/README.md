# Discord Community Bot

Bot modular de tickets privados, moderación, archivos temporales y recordatorios de progresión.

Proyecto personal de Jesús Leonardo Martínez Rodríguez.

## Tecnologías

JavaScript · Node.js · discord.js

## Desarrollo

```powershell
npm ci
npm test
# Copiar config.example.json a config.json y completar IDs.
# Definir DISCORD_TOKEN en el entorno.
npm start
```

## Alcance

La configuración de ejemplo reemplaza identificadores de la comunidad. Los módulos usan servicios, colas por clave y persistencia JSON. El token se obtiene del entorno. No se incluyen miembros, tickets, historial ni logs de producción.

## Distribución

Copia de fuentes para revisión técnica. Sin dependencias instaladas, credenciales, bases de usuario ni cachés. Se conservan las licencias incluidas y no se concede una licencia nueva sobre componentes de terceros.
