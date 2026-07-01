# 👻 Ghoul Poker — React / TypeScript build

Neon-goth crypto Texas Hold'em. This is the component-based rebuild (v0.3) per the
visual-upgrade spec: a layered pixel-art poker scene with real ghoul art, not a flat oval.

## Run it

```bash
npm install
npm run dev      # local dev server (Vite) → http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build
```

Requires Node 18+.

## Structure

```
src/
  engine/
    poker.ts      — hand evaluation, deck, Monte-Carlo strength (validated)
    table.ts      — table state machine, blinds, betting, AI, showdown
  data/
    ghouls.ts     — character roster, avatar mapping, seat layouts
    missions.ts   — daily ops + XP curve
  hooks/
    useGhoulPoker.ts — drives the whole game loop, exposes state + actions to UI
  components/
    GhoulPokerTableScene.tsx — THE main center scene (layered):
        layer 1 room bg · layer 2 table · layer 3 seats · layer 4 cards/chips/pot · FX
    PlayerSeat.tsx   — character portrait pod (avatar, nameplate, chips, cards, aura)
    CryptoCard.tsx   — crypto-suited cards (₿ Ξ ◎ Ð) with neon glow
    ActionBar.tsx    — chunky glowing buttons, quick-bets, raise slider, timer ring
    FX.tsx           — particle field, table lightning, win confetti (canvas)
    Panels.tsx       — top bar, chat, missions, hand history, XP, achievements
  styles/app.css     — full neon-goth styling + animation loops
public/assets/
  avatars/      — the 7 ghoul character PNGs
  backgrounds/  — poker-room backdrop
  cards/ fx/ ui/ — reserved for future art drops
```

## Swapping art

Drop a PNG into `public/assets/avatars/` and point its `slug` in `src/data/ghouls.ts`.
Room background lives in `public/assets/backgrounds/poker-room.png`.

## Multiplayer seam

All game mutations flow through `applyAction()` / the engine in `src/engine/table.ts`,
and the UI renders purely from the `TableState` snapshot the hook publishes. To go online:
run the engine server-side as the authority, and replace the local `drive`/`aiAct` calls in
`useGhoulPoker.ts` with socket events that call `applyAction` on the server copy and broadcast
the new state. The render layer doesn't change.

Not gambling — chips are fake, reset on bust. XP & cosmetics only.


## Sound effects

Sound is on by default and toggles from the ♪ button in the top bar (glows green when on).
Audio respects browser autoplay rules: nothing plays until the first click, and there is no
background music. Master volume is capped low in `src/hooks/useSoundEffects.ts` (MASTER_VOLUME).

Placeholder SFX (synthesized, royalty-free) live in `public/assets/sfx/`:
chip_slide, chip_land, pot_collect, card_flip, achievement_unlock, all_in_stinger.
Swap any `.wav` for your own — keep the filename and it just works.
