# 🎮 Topdown Action - Enhanced Edition

<div align="center">

**An intense browser-based top-down shooter with boss fights, weapon upgrades, and addictive wave-based progression!**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made with JavaScript](https://img.shields.io/badge/Made%20with-JavaScript-f7df1e.svg)](https://www.javascript.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[Play Now](#) | [Report Bug](../../issues) | [Request Feature](../../issues)

</div>

---

## ✨ Features

### 🎯 Core Gameplay
- **Wave-Based Survival** - Face increasingly difficult waves of enemies
- **Boss Battles** - Epic boss fights every 5 waves with unique attack patterns
- **Weapon Upgrades** - Progress from single shot → double shot → triple shot
- **Dash Ability** - Dodge enemy bullets with a powerful dash (SPACE key, 3s cooldown)
- **Combo System** - Chain kills for bonus points (10% per combo level)
- **High Score Tracking** - Local storage persistence for your best runs

### 👾 Enemy Variety
- **Normal** (Red) - Standard enemies | 10 pts | Speed: 105
- **Fast** (Pink) - Quick and nimble | 15 pts | Speed: 190
- **Tank** (Large Red) - Slow but tanky, 3 hits | 30 pts | Speed: 65
- **Shooter** (Yellow) - Fires bullets at you | 25 pts | Speed: 85
- **Mini-Boss** (Purple) - Rare elite enemy | 100 pts | 8 HP
- **BOSS** (Mega Purple) - Massive rotating bullet patterns | 600+ pts

### 💎 Power-Up System (20% drop rate)
- 💚 **Health** - Restore 35 HP
- ⚡ **Rapid Fire** - 12 seconds of ultra-fast shooting
- 💙 **Speed Boost** - 12 seconds of 1.5x movement speed
- 💜 **Shield** - 15 seconds of invulnerability
- ⭐ **Weapon Upgrade** - Permanent weapon level up (12% chance)

### 🎨 Polish & Effects
- Smooth 60 FPS gameplay
- Particle explosions for every kill
- Screen shake on damage
- Glowing power-up effects
- Visual ability cooldown indicators
- Score popups for every kill
- Dash trails and invulnerability frames
- Professional gradient UI with glassmorphism
- Responsive design for mobile devices

---

## 🚀 Play Online

### GitHub Pages
This game is hosted on GitHub Pages and can be played instantly in your browser!

**👉 [Play Topdown Action Now](https://ethanlynn.dev/topdown-action/)**


## 🎮 Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| **Move** | WASD or Arrow Keys | Touch to move |
| **Aim** | Mouse position | Touch position |
| **Shoot** | Click & Hold | Tap & Hold |
| **Dash** | SPACE | *(Coming soon)* |

---

## 💡 Pro Tips & Strategy

1. **Dash Mastery** - Use dash (SPACE) to phase through enemy bullets. You're invulnerable during the dash!
2. **Priority Targets** - Focus shooters (yellow) first, then mini-bosses, then tanks
3. **Weapon Upgrades** - Always grab gold star power-ups - they're rare and permanent!
4. **Combo Maintenance** - Keep moving and killing to maintain high combos for bonus points
5. **Power-Up Timing** - Save shields and speed boosts for boss waves
6. **Wave Breaks** - Use HP restoration between waves to recover
7. **Boss Patterns** - Learn the rotating bullet patterns and find safe zones
8. **Mini-Boss Alert** - Purple enemies with ⚠ symbol are dangerous - keep distance!

---

## 🛠️ Local Development

### Prerequisites
- Modern web browser (Chrome, Firefox, Edge, Safari)
- (Optional) Local web server for development

---

## 🎨 Customization Guide

All game parameters are easily tweakable in `game.js`:

### Player Settings
```javascript
// Line ~210
this.speed = 250;        // Movement speed
this.maxHp = 100;        // Maximum health
this.dashCooldown = 3;   // Dash cooldown in seconds
```

### Enemy Settings
```javascript
// Lines ~380-420
speed: 190,              // Fast enemy speed
hp: 3,                   // Tank enemy health
shootCooldown: 2.5,      // Shooter fire rate
```

### Difficulty Scaling
```javascript
// Line ~850
const spawnRate = Math.max(0.4, 1.6 - wave * 0.07);  // Enemy spawn speed
const enemiesNeeded = wave * 5 + 12;                  // Enemies per wave
```

### Power-Up Settings
```javascript
// Line ~740
const dropChance = e.type === 'miniboss' ? 0.4 : 0.2;  // Drop chance
player.rapidFire = 12;                                   // Duration
```

### Visual Effects
```javascript
// Lines throughout
screenShake = 0.7;              // Shake intensity
createExplosion(x, y, color, 60); // Particle count
```

---

## 🏆 Scoring System

| Action | Points |
|--------|--------|
| Normal Enemy | 10 pts |
| Fast Enemy | 15 pts |
| Tank Enemy | 30 pts |
| Shooter Enemy | 25 pts |
| Mini-Boss | 100 pts |
| Boss | 600 + (wave × 120) pts |
| Wave Bonus | wave × 60 pts |
| Combo Multiplier | +10% per combo level |
| Weapon Upgrade | +150 pts |

**Max Combo Bonus:** Unlimited! Keep the combo going for maximum points.

---

## 📊 Technical Details

### Built With
- **Pure Vanilla JavaScript** - No frameworks or dependencies
- **HTML5 Canvas** - For smooth 2D rendering
- **Web Audio API** - For dynamic sound effects
- **CSS3** - Modern animations and glassmorphism effects
- **LocalStorage** - High score persistence

### Performance
- Optimized particle system with automatic cleanup
- Efficient collision detection using spatial hashing
- Delta-time physics for consistent gameplay
- Smooth 60 FPS on modern devices
- Responsive canvas scaling
- Minimal memory footprint (~5MB)

### Browser Compatibility
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

---

## 🗺️ Roadmap

### Planned Features
- [ ] More boss types with unique patterns
- [ ] Persistent upgrades between runs
- [ ] Achievement system
- [ ] Online leaderboards
- [ ] More weapon types (shotgun, laser, missiles)
- [ ] Special abilities (time slow, screen clear bomb)
- [ ] Game modes (timed challenges, endless)
- [ ] Enemy formations and attack patterns
- [ ] Mobile virtual joystick controls
- [ ] Background music system

### Community Ideas
Have an idea? [Open an issue](../../issues) with the `enhancement` label!

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Contribution Ideas
- Bug fixes
- New enemy types
- Visual effects
- Sound improvements
- Performance optimizations
- Mobile controls enhancement
- Documentation improvements

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by classic top-down shooters
- Built as a learning project for game development
- Sound effects generated with Web Audio API
- UI design inspired by modern glassmorphism trends

---

## 📧 Contact

**Ethan** - [GitHub Profile](https://github.com/XoTtic809)

Project Link: [https://github.com/YOUR_USERNAME/topdown-action](https://github.com/XoTtic809/topdown-action)

---

<div align="center">

**⭐ Star this repo if you enjoyed the game! ⭐**

Made with ❤️ and JavaScript

</div>
