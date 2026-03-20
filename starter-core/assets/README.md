# Assets

All skins in this starter-core are **rendered procedurally with the Canvas 2D API** —
there are no PNG sprite sheets or image files.

## How skins work

Each skin is defined in `game/skins.js` as an entry in the `SKINS` array:

```js
{ id: 'galaxy', name: 'Galaxy', color: null }
```

- **Solid skins** have a hex `color` and are drawn as a filled circle with a glow.
- **Animated skins** have `color: null` and compute their color each frame inside
  `getActiveSkinColor()` using `Date.now()` — no images needed.
- **Special effects** (orbiting sparkles, tendrils, etc.) live in
  `Player._drawSkinEffects()` in `game/playerMovement.js`.

## Adding a custom skin with a sprite

If you want to use an image, load it once and draw it in `Player.draw()`:

```js
// At module scope in playerMovement.js
const mySprite = new Image();
mySprite.src = '../assets/mySprite.png';

// Inside Player.draw(), replace the arc fill with:
ctx.drawImage(mySprite, this.x - this.r, this.y - this.r, this.r * 2, this.r * 2);
```

Drop your PNG files in this `/assets/` folder and reference them as shown above.
