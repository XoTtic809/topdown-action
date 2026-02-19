# Topdow Action

A browser-based top-down shooter built with HTML5 Canvas and Firebase.

## How to Play

Open `index.html` in a browser. Create an account or play as a guest.

Survive waves of enemies, earn coins, and level up your Battle Pass to unlock skins and cosmetics.

**Controls**
- WASD / Arrow Keys — Move
- Mouse — Aim
- Left Click — Shoot
- Space — Dash

## Features

- 50-tier Battle Pass with free and premium tracks
- Crate system with 40+ unlockable skins
- Leaderboards for score, coins, and level
- Trails, death effects, titles, and badges
- Wave-based enemy system with bosses and minibosses
- Firebase cloud saves and authentication

## Setup

Requires Firebase. The project is already configured in `firebase-config.js` — just open `index.html` and go.

To reset all user data (admin only), load `reset.js` temporarily and run `runFullReset()` from the console. Remove the script after use.

## File Structure

```
index.html              — Main game page
styles.css              — Core styles
game.js                 — Game logic and rendering
firebase-config.js      — Firebase setup
firebase-auth.js        — Auth and leaderboards
firebase-ui.js          — UI event handlers
firebase_announcements.js — Admin announcements
battlepass-system.js    — Battle Pass logic
battlepass-styles.css   — Battle Pass styles
crate-system.js         — Crate opening system
crate-styles.css        — Crate styles
anticheat.js            — Score validation
reset.js                — Full data reset (admin only)
```