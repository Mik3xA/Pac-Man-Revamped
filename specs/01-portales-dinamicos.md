# SPEC 01 — Portales dinámicos

> **Status:** Draft
> **Depends on:** None
> **Date:** 2026-10-09
> **Objective:** Añadir un par de portales aleatorios que teletransporten exclusivamente a Pac-Man, se distingan visualmente de los puntos y respeten un cooldown entre teletransportes.

## Scope

**In:**

- Generar un par de portales al comenzar cada partida.
- Ubicar los portales en celdas transitables alcanzables, en lados opuestos del laberinto y separados preferentemente por al menos 14 celdas usando distancia Manhattan.
- Usar la pareja más distante disponible como fallback cuando no exista una pareja que alcance la distancia mínima.
- Evitar las posiciones actuales e iniciales de Pac-Man y los fantasmas, el túnel y la reutilización de una misma celda.
- Mantener un par activo durante 10 segundos y generar otro después de un intervalo de 8 segundos.
- Teletransportar únicamente a Pac-Man entre los dos extremos del par.
- Conservar la dirección de Pac-Man al salir, usar una dirección válida alternativa si está bloqueada y procesar el punto del destino al llegar.
- Aplicar un cooldown individual de 0.3 segundos después de cada teletransporte.
- Diferenciar los portales de los puntos con color, brillo, animación pulsante y etiquetas `A` y `B`.
- Mantener los portales y sus timers cuando Pac-Man pierde una vida, y regenerarlos aleatoriamente al iniciar una nueva partida.

**Out of scope (for future specs):**

- Teletransportar fantasmas u otras entidades.
- Otorgar puntos por usar un portal.
- Mostrar el cooldown en el HUD.
- Añadir efectos de sonido.
- Persistir posiciones o configuración entre partidas o recargas.
- Cambiar la geometría del laberinto, el sistema de puntuación existente o los estilos CSS.

## Data model

El modelo se implementará en `src/js/portal.js` y se integrará en el estado de partida existente.

```js
const PORTAL_CONFIG = {
  enabled: true,
  initiallyActive: true,
  pairCount: 1,
  spawnInterval: 8,
  portalDuration: 10,
  teleportCooldown: 0.3,
  minDistance: 14,
};

const portalSystem = {
  config: PORTAL_CONFIG,
  pairs: [{
    id: 'portal-pair-1',
    entry: { id, pairId, label: 'A', x, y, exitDir, color },
    exit: { id, pairId, label: 'B', x, y, exitDir, color },
  }],
  status: 'waiting' | 'active' | 'closing',
  portalTimer: 0,
  spawnTimer: 0,
  closeTimer: 0,
};
```

- `game.portals` contiene el sistema de portales de la partida.
- `game.pacman.portalCooldown` contiene frames restantes; a 60 FPS, 0.3 segundos equivalen a 18 frames.
- Las posiciones candidatas deben ser transitables y alcanzables desde `PACMAN_START`.
- Si hay varias parejas con la misma mayor distancia en el fallback, el desempate es aleatorio.
- Una celda de portal puede contener un punto; Pac-Man lo consume al llegar a esa celda, sin recibir puntos adicionales por el teletransporte.

## Implementation plan

1. Completar `src/js/portal.js` con la configuración pública, la colección de celdas alcanzables, las reservas de actores y la selección aleatoria de parejas en lados opuestos.
2. Implementar en `src/js/portal.js` la distancia mínima, el fallback a la pareja más distante, el desempate aleatorio y el ciclo activo, cierre y espera; al terminar este paso el sistema podrá generar y retirar portales sin afectar el movimiento normal.
3. Integrar `portalSystem` en `src/js/game.js` para que solo Pac-Man pueda teletransportarse, procese el punto destino, conserve o ajuste su dirección, aplique 18 frames de cooldown y conserve el ciclo al perder una vida.
4. Actualizar `src/js/render.js` para dibujar cada portal con color propio, brillo, pulso y etiqueta `A` o `B`, manteniendo el orden de dibujo compatible con Pac-Man, fantasmas y puntos.
5. Mantener la carga de `src/js/portal.js` en `src/index.html` y comprobar que una partida nueva cree un sistema independiente, sin persistencia ni cambios en `src/css/style.css`.

## Acceptance criteria

- [ ] El juego carga mediante `python3 -m http.server -d src 8000` sin errores en la consola.
- [ ] Cada partida nueva genera aleatoriamente un único par de portales activos al inicio.
- [ ] Los portales aparecen en celdas transitables, alcanzables, distintas entre sí y fuera del túnel y de las posiciones reservadas.
- [ ] Los portales están en lados opuestos y separados por al menos 14 celdas cuando existe una pareja que cumple la regla.
- [ ] Cuando no existe una pareja que cumpla 14 celdas, se selecciona aleatoriamente una de las parejas más distantes disponibles.
- [ ] El par activo dura 10 segundos y el siguiente ciclo comienza después de 8 segundos de espera.
- [ ] Pac-Man se teletransporta desde cualquiera de los dos extremos hacia el otro.
- [ ] Los fantasmas no se teletransportan al atravesar una celda de portal.
- [ ] Pac-Man conserva su dirección al salir o usa una salida válida alternativa si la dirección está bloqueada.
- [ ] Un punto en la celda de destino se consume al llegar y el teletransporte no añade puntos adicionales.
- [ ] Pac-Man no puede activar otro portal durante los 18 frames posteriores a un teletransporte.
- [ ] Los portales se muestran con color, brillo, pulso y etiquetas diferentes de la representación de los puntos.
- [ ] Perder una vida no regenera ni reinicia el par activo ni sus timers.
- [ ] Reiniciar la partida genera un nuevo sistema de portales sin guardar posiciones entre recargas.

## Decisions

- **Sí:** un solo par activo. Mantiene la mecánica legible y coincide con el alcance solicitado.
- **Sí:** selección aleatoria en lados opuestos. Refuerza la dispersión espacial del teletransporte.
- **Sí:** distancia Manhattan mínima de 14 celdas. Es una regla verificable para evitar portales demasiado cercanos.
- **Sí:** fallback a la pareja más distante con desempate aleatorio. Mantiene la funcionalidad cuando la regla mínima no es posible sin crear una ubicación fija.
- **Sí:** cooldown interno de 0.3 segundos. Evita teletransportes consecutivos y no añade elementos al HUD.
- **Sí:** los portales pueden compartir celda con un punto. El punto se consume normalmente al llegar.
- **No:** teletransporte de fantasmas, audio, persistencia, recompensa adicional o cambios de CSS. Esos cambios ampliarían el alcance de esta especificación.

## Risks

| Risk | Mitigation |
| --- | --- |
| El laberinto ofrece pocas parejas válidas en un ciclo. | Usar la pareja más distante disponible y elegir aleatoriamente entre empates. |
| Pac-Man queda bloqueado al salir del destino. | Conservar la dirección cuando sea posible y usar la dirección válida del portal como fallback. |
| Un teletransporte inmediato provoca un bucle entre extremos. | Aplicar el cooldown individual de 18 frames antes de permitir otro uso. |
| La selección aleatoria coincide con una entidad en movimiento. | Recalcular las celdas reservadas antes de cada aparición y excluirlas. |

## What is **not** in this spec

- Teletransportar fantasmas u otras entidades.
- Puntuación adicional, HUD de cooldown o efectos de sonido.
- Persistencia de portales o configuración.
- Cambios en la geometría del laberinto, CSS o modo multijugador.
