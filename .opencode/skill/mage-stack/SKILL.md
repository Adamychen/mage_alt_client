---
name: mage-stack
description: Use cuando arranques, reinicies, pares o diagnostiques el stack de desarrollo del Mage.Proxy (servidor XMage, proxy WebSocket, Vite), cuando algo "no funciona" o haya que leer logs del stack. Keywords: ctl.mjs, dev.mjs, tail.mjs, stack, proxy, servidor, log, puerto, .run.
---

# Mage.Proxy — Stack de desarrollo

Guía operativa del stack local (Windows/PowerShell, proyectos `node` + `mvn`).

## Composición

| Servicio | Qué es | Puerto |
| --- | --- | --- |
| `server` | Servidor XMage (Java, `-testMode`) | 17171 (RMI/jboss) |
| `proxy` | Proxy WebSocket `Mage.Proxy` (jar Java) | 8787 (WS), 8788 (HTTP test page) |
| `vite` | Dev server del cliente web | 5173 |

Arranca SIEMPRE en orden `server → proxy → vite` (dev.mjs ya lo hace; el proxy
falla si el servidor no está).

## Comandos

- `node scripts/ctl.mjs start|stop|restart|status [server|proxy|vite|all]` — no
  bloquea la shell (detached); salida en `.run/ctl.out.log`.
- `node scripts/dev.mjs <mismo>` — bloquea la shell; útil para ver el arranque.
- `node scripts/tail.mjs [server|proxy|vite|all] [líneas]` — últimos logs.
- `node scripts/build.mjs [proxy]` — sin args: servidor+plugins+proxy; con
  `proxy`: solo el jar del proxy (para y reinicia el proxy si estaba arriba).

## Logs (`.run/*.log`)

- `server.out.log` — servidor XMage (cambios de formato UTC).
- `proxy.out.log` / `proxy.err.log` — proxy; `proxy.err.log` contiene los
  reenvíos de eventos (`event >> GAME_INIT`, `event IGNORED ...`).
- `vite.out.log` — Vite.

Arranque en frío: el servidor tarda ~40–60 s en quedar listo (logs de carga de
plugins). `dev.mjs` espera los puertos (server 60 s, proxy 30 s, vite 60 s).

## Síntomas conocidos

- **`WATCHGAME` no llega solo en la primera partida tras arranque frío del
  servidor**: el servidor falla al crear el socket de retorno de callbacks
  (`SESSION CALLBACK EXCEPTION - java.io.IOException: Unable to create socket`,
  `messageId: 1` en `server.out.log`). El `self-test` ya reintenta; si falla
  una vez, ejecutar de nuevo con el servidor caliente.
- **`event IGNORED (game not active in this session)`** en `proxy.err.log`:
  normal — el proxy filtra callbacks de partidas no activas de la sesión actual.
- **`DROPPED as outdated`**: normal, el proxy descarta eventos con messageId
  inferior al último procesado.
- **`broadcast to 0 connections`**: normal si no hay clientes conectados.
- **`Wrong admin access`**: el cliente no es admin para `adminTableRemove`/kick.
- **Puerto ocupado al arrancar**: quedó un PID huérfano; `stopPid` en
  `scripts/lib.mjs` o matar el proceso por puerto.

## Regla de oro

Si un problema toca el protocolo (eventos, messageId, contratos), la fuente de
verdad es el código del servidor (ver subagente `xmage-contract`), no las
suposiciones: greppear antes de parchear.
