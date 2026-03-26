// skin-previews.js — Single source of truth for all skin visuals
// Loaded BEFORE game.js, crate-system.js, marketplace-ui.js, trades-ui.js
'use strict';

// ════════════════════════════════════════════════════════════════════
// SECTION 1: CSS PREVIEW STYLES
// Format: [background, boxShadow, animation]
// Used by all UI surfaces: shop, inventory, crates, marketplace,
// trades, profile, battle pass, skin detail modal
// ════════════════════════════════════════════════════════════════════

const _SKIN_CSS = {
  // ── Default ──
  agent:      ['radial-gradient(circle at 35% 35%,#d0f4ff 0%,#9be7ff 40%,#3ab0d8 75%,#0a4a6a 100%)', '0 0 18px rgba(155,231,255,0.6)', ''],
  // ── Basic shop skins ──
  inferno:    ['radial-gradient(circle at 35% 35%,#ffcc55 0%,#ff6b35 40%,#cc2200 75%,#3d0800 100%)', '0 0 22px #ff6b35,0 0 38px rgba(255,107,53,0.4)', 'voidPulse 2.5s ease-in-out infinite'],
  venom:      ['radial-gradient(circle at 35% 35%,#ccffcc 0%,#6bff7b 45%,#1faa33 80%,#073310 100%)', '0 0 20px #6bff7b,0 0 35px rgba(107,255,123,0.4)', ''],
  ice:        ['radial-gradient(circle at 35% 35%,#ddfaff 0%,#6de6ff 40%,#009dd4 75%,#002d44 100%)', '0 0 22px #00d9ff,0 0 38px rgba(0,217,255,0.4)', 'galaxyShimmer 3s ease-in-out infinite'],
  shadow:     ['radial-gradient(circle at 35% 35%,#dcc8ff 0%,#9966ff 45%,#4a18c8 80%,#0c0020 100%)', '0 0 22px #9966ff,0 0 40px rgba(153,102,255,0.4)', 'voidPulse 2.2s ease-in-out infinite'],
  amber:      ['radial-gradient(circle at 35% 35%,#ffe8a0 0%,#ffaa00 45%,#c87000 80%,#3d1e00 100%)', '0 0 20px #ffaa00,0 0 35px rgba(255,170,0,0.4)', ''],
  crimson:    ['radial-gradient(circle at 35% 35%,#ff8899 0%,#dc143c 45%,#7a0018 80%,#1c0006 100%)', '0 0 22px #dc143c,0 0 38px rgba(220,20,60,0.4)', 'voidPulse 2s ease-in-out infinite'],
  gold:       ['radial-gradient(circle at 35% 35%,#fff8c0 0%,#ffd700 38%,#c09000 72%,#4a3200 100%)', '0 0 24px #ffd700,0 0 44px rgba(255,215,0,0.45)', 'galaxyShimmer 2.5s ease-in-out infinite'],
  ocean:      ['radial-gradient(circle at 35% 35%,#55b8d8 0%,#006994 48%,#003555 80%,#000b18 100%)', '0 0 20px #006994,0 0 35px rgba(0,105,148,0.4)', 'voidPulse 3s ease-in-out infinite'],
  toxic:      ['radial-gradient(circle at 35% 35%,#eaff99 0%,#9afd2e 45%,#4a8800 80%,#152900 100%)', '0 0 22px #9afd2e,0 0 38px rgba(154,253,46,0.4)', 'voidPulse 1.8s ease-in-out infinite'],
  magma:      ['radial-gradient(circle at 35% 35%,#ffdd44 0%,#ff4500 38%,#b51800 72%,#280500 100%)', '0 0 24px #ff4500,0 0 44px rgba(255,69,0,0.5)', 'voidPulse 1.5s ease-in-out infinite'],
  plasma:     ['radial-gradient(circle at 35% 35%,#ffccf0 0%,#ff69d9 45%,#c01880 80%,#2d0018 100%)', '0 0 22px #ff69d9,0 0 40px rgba(255,105,217,0.4)', 'voidPulse 2s ease-in-out infinite'],
  emerald:    ['radial-gradient(circle at 35% 35%,#b8ffd8 0%,#50c878 45%,#157535 80%,#032812 100%)', '0 0 22px #50c878,0 0 38px rgba(80,200,120,0.4)', 'galaxyShimmer 3s ease-in-out infinite'],
  frost:      ['radial-gradient(circle at 35% 35%,#ffffff 0%,#c8eeff 35%,#80c8e0 72%,#1e4e60 100%)', '0 0 18px #b0e0e6,0 0 32px rgba(176,224,230,0.5)', 'galaxyShimmer 3.5s ease-in-out infinite'],
  midnight:   ['radial-gradient(circle at 35% 35%,#7070ff 0%,#1a1aff 45%,#060680 80%,#00000f 100%)', '0 0 24px #1a1aff,0 0 44px rgba(26,26,255,0.45)', 'voidPulse 2.5s ease-in-out infinite'],
  sakura:     ['radial-gradient(circle at 35% 35%,#ffe0ea 0%,#ffb7c5 45%,#f05878 80%,#550020 100%)', '0 0 18px #ffb7c5,0 0 32px rgba(255,183,197,0.5)', ''],
  electric:   ['radial-gradient(circle at 35% 35%,#ffffff 0%,#88ffff 25%,#00ffff 58%,#005566 100%)', '0 0 26px #00ffff,0 0 48px rgba(0,255,255,0.5)', 'quantumSpin 3.5s linear infinite'],
  ruby:       ['radial-gradient(circle at 35% 35%,#ff9ab5 0%,#e0115f 42%,#880030 78%,#180008 100%)', '0 0 22px #e0115f,0 0 40px rgba(224,17,95,0.45)', 'voidPulse 2s ease-in-out infinite'],
  lime:       ['radial-gradient(circle at 35% 35%,#f0ffaa 0%,#ccff00 45%,#88bb00 80%,#253000 100%)', '0 0 22px #ccff00,0 0 40px rgba(204,255,0,0.45)', 'voidPulse 1.8s ease-in-out infinite'],
  violet:     ['radial-gradient(circle at 35% 35%,#e090ff 0%,#8f00ff 45%,#440080 80%,#0c001e 100%)', '0 0 26px #8f00ff,0 0 46px rgba(143,0,255,0.5)', 'voidPulse 2s ease-in-out infinite'],
  copper:     ['radial-gradient(circle at 35% 35%,#f0d090 0%,#b87333 45%,#784218 80%,#2a1200 100%)', '0 0 18px #b87333,0 0 32px rgba(184,115,51,0.4)', 'galaxyShimmer 3s ease-in-out infinite'],
  cyber:      ['radial-gradient(circle at 35% 35%,#b0ffd0 0%,#00ff41 40%,#00a020 75%,#001800 100%)', '0 0 22px #00ff41,0 0 40px rgba(0,255,65,0.5)', 'voidPulse 1.5s ease-in-out infinite'],
  // ── Shop specials (animated) ──
  rainbow:    ['conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)', '0 0 22px rgba(255,150,0,0.7)', 'quantumSpin 3s linear infinite'],
  sunset:     ['linear-gradient(135deg,#ff6b6b 0%,#ffd93d 50%,#ff69b4 100%)', '0 0 20px #ff8c00', ''],
  galaxy:     ['linear-gradient(135deg,#667eea 0%,#764ba2 50%,#f093fb 100%)', '0 0 25px #764ba2', 'galaxyShimmer 2s ease-in-out infinite'],
  phoenix:    ['radial-gradient(circle,#ff4500 0%,#ff6347 50%,#ffa500 100%)', '0 0 22px #ff4500', 'voidPulse 2s ease-in-out infinite'],
  void:       ['radial-gradient(circle at 40% 40%,#1a0033 0%,#0d001a 40%,#000 100%)', '0 0 35px #9900ff,0 0 60px rgba(153,0,255,0.5)', 'voidPulse 3s ease-in-out infinite'],
  diamond:    ['radial-gradient(circle at 35% 35%,#fff 0%,#f0f8ff 20%,#ffe6f0 40%,#fff5e6 60%,#f0f0ff 80%,#fff 100%)', '0 0 40px #fff,0 0 70px rgba(255,255,255,0.7)', 'diamondShine 2.5s ease-in-out infinite'],
  quantum:    ['conic-gradient(from 0deg,#ff0080,#00ffff,#8000ff,#ffff00,#ff0080)', '0 0 35px rgba(255,0,255,0.8)', 'quantumSpin 3s linear infinite'],
  celestial:  ['radial-gradient(circle at 30% 40%,#b794f6 0%,#4a90e2 30%,#50c9ce 50%,#ffd700 70%,#b794f6 100%)', '0 0 45px rgba(183,148,246,1)', 'celestialGlow 4s ease-in-out infinite'],
  // ── Champions ──
  'gold-champion':   ['radial-gradient(circle,#ffd700 0%,#ffed4e 40%,#fff 60%,#ffd700 100%)', '0 0 30px #ffd700', 'championPulse 2s ease-in-out infinite'],
  'silver-champion': ['radial-gradient(circle,#c0c0c0 0%,#e8e8e8 40%,#fff 60%,#c0c0c0 100%)', '0 0 30px #c0c0c0', 'championPulse 2.2s ease-in-out infinite'],
  'bronze-champion': ['radial-gradient(circle,#cd7f32 0%,#e8a87c 40%,#f5d0a9 60%,#cd7f32 100%)', '0 0 30px #cd7f32', 'championPulse 2.4s ease-in-out infinite'],
  // ── Icon skins ──
  icon_noah_brown:      ['radial-gradient(circle,#9a6033 0%,#6b4423 50%,#3a2010 100%)', '0 0 18px #6b4423', ''],
  icon_keegan_baseball: ['radial-gradient(circle,#f5f5f5 0%,#e0e0d0 50%,#c8c8b0 100%)', '0 0 14px #ddd', ''],
  icon_dpoe_fade:       ['linear-gradient(135deg,#ff69b4 0%,#ff9ec4 50%,#89cff0 100%)', '0 0 22px #ff9ec4', ''],
  icon_evan_watermelon: ['radial-gradient(circle,#ff6b9d 0%,#ff4466 30%,#ff1744 50%,#4caf50 70%,#2e7d32 100%)', '0 0 20px #ff4466', ''],
  icon_gavin_tzl:       ['linear-gradient(135deg,#dc143c 0%,#fff 50%,#0047ab 100%)', '0 0 25px #0047ab', ''],
  icon_carter_cosmic:   ['radial-gradient(circle,#ff2020 0%,#cc0000 40%,#660000 70%,#1a0000 100%)', '0 0 25px #cc0000', ''],
  icon_brody_flag:      ['repeating-linear-gradient(to bottom,#b22234 0px,#b22234 8%,#fff 8%,#fff 16%)', '0 0 22px #3c3b6e', ''],
  icon_sterling:        ['radial-gradient(circle at 30% 30%,#0064ff 0%,#0050cc 30%,#003399 60%,#000 100%)', '0 0 25px #0064ff,0 0 40px rgba(0,100,255,0.5)', 'sterlingPulse 3s ease-in-out infinite'],
  icon_profe_spain:     ['linear-gradient(to bottom,#c60b1e 0%,#c60b1e 25%,#ffc400 25%,#ffc400 75%,#c60b1e 75%,#c60b1e 100%)', '0 0 25px #c60b1e,0 0 40px rgba(255,196,0,0.6)', 'voidPulse 1.2s ease-in-out infinite'],
  icon_kayden_duck:     ['conic-gradient(from 20deg,#5a6b2a,#c4a265,#3d2b0e,#7a5c28,#5a6b2a)', '0 0 18px rgba(90,107,42,0.7)', ''],
  icon_troy_puck:       ['radial-gradient(circle at 35% 35%,#3a3a3a 0%,#1a1a1a 50%,#050505 100%)', '0 0 20px rgba(200,232,255,0.5)', ''],
  icon_justin_clover:   ['radial-gradient(circle,#39ff14 0%,#1a8c2e 40%,#0d5c1a 70%,#042b0a 100%)', '0 0 25px #39ff14,0 0 40px rgba(26,140,46,0.5)', ''],
  icon_the_creator:     ['conic-gradient(from 0deg,#ff0080,#00ffff,#8000ff,#ffff00,#ff0080)', '0 0 45px #fff,0 0 80px rgba(255,215,0,0.6)', 'quantumSpin 1.5s linear infinite'],
  // ── Battle Pass S1 ──
  bp1_striker:   ['radial-gradient(circle,#ff8050 0%,#ff6b35 50%,#883010 100%)', '0 0 18px #ff6b35', ''],
  bp1_guardian:  ['radial-gradient(circle,#70ffee 0%,#4ecdc4 50%,#1a6060 100%)', '0 0 18px #4ecdc4', ''],
  bp1_phantom:   ['radial-gradient(circle,#cc88ff 0%,#9b59b6 50%,#4a1a66 100%)', '0 0 20px #9b59b6', ''],
  bp1_tempest:   ['radial-gradient(circle,#80aaff 0%,#3498db 50%,#103055 100%)', '0 0 20px #3498db', ''],
  bp1_eclipse:   ['radial-gradient(circle,#404060 0%,#2c3e50 50%,#0d1520 100%)', '0 0 18px #2c3e50', ''],
  bp1_sovereign: ['radial-gradient(circle,#ffd060 0%,#f39c12 50%,#6a3a00 100%)', '0 0 22px #f39c12', 'celestialGlow 3s ease-in-out infinite'],
  bp1_apex:      ['radial-gradient(circle,#ff8888 0%,#e74c3c 40%,#660000 100%)', '0 0 28px #e74c3c', 'voidPulse 2s ease-in-out infinite'],
  // ── Achievement ──
  transcendence: ['conic-gradient(from 0deg,#ff0080,#00ffff,#8000ff,#ffff00,#ff0080)', '0 0 55px #fff,0 0 90px rgba(255,255,255,0.6)', 'quantumSpin 2s linear infinite'],
  // ── Crate: Common ──
  c_static:     ['radial-gradient(circle,#c8c8dc 0%,#808090 60%,#404050 100%)', '0 0 10px #b8b8cc', ''],
  c_rust:       ['radial-gradient(circle,#c06030 0%,#8b4513 55%,#4a2008 100%)', '0 0 12px #8b4513', ''],
  c_slate:      ['radial-gradient(circle,#8090a0 0%,#607080 55%,#303840 100%)', '0 0 10px #708090', ''],
  c_olive:      ['radial-gradient(circle,#9ab040 0%,#6b8e23 55%,#344010 100%)', '0 0 12px #6b8e23', ''],
  c_maroon:     ['radial-gradient(circle,#cc3050 0%,#9b2335 55%,#4a0f1a 100%)', '0 0 12px #9b2335', ''],
  c_moss:       ['radial-gradient(circle,#6aaa50 0%,#3d6e3d 55%,#1a3318 100%)', '0 0 12px #3d6e3d', ''],
  c_ash:        ['radial-gradient(circle,#e8e0d8 0%,#b0a898 55%,#585048 100%)', '0 0 10px #b0a898', ''],
  c_dusk:       ['radial-gradient(circle,#5050a0 0%,#2d2050 55%,#10081e 100%)', '0 0 12px #403080', ''],
  c_clay:       ['radial-gradient(circle,#d4854a 0%,#b5651d 55%,#5a2c08 100%)', '0 0 12px #b5651d', ''],
  // ── Crate: Uncommon ──
  c_cobalt:     ['radial-gradient(circle,#3080ff 0%,#0047ab 55%,#001a60 100%)', '0 0 18px #3080ff', ''],
  c_teal:       ['radial-gradient(circle,#00c8b0 0%,#00897b 55%,#003830 100%)', '0 0 18px #00c8b0', ''],
  c_coral:      ['radial-gradient(circle,#ff9080 0%,#ff6f61 55%,#a02010 100%)', '0 0 18px #ff6f61', ''],
  c_sand:       ['radial-gradient(circle,#e0c870 0%,#c2a25a 55%,#6a5020 100%)', '0 0 16px #c2a25a', ''],
  c_chrome:     ['linear-gradient(135deg,#666 0%,#ddd 25%,#999 50%,#fff 75%,#888 100%)', '0 0 22px #ccc', 'quantumSpin 3s linear infinite'],
  c_sapphire:   ['linear-gradient(135deg,#4080ff 0%,#1560bd 50%,#072f6e 100%)', '0 0 18px #1560bd', 'galaxyShimmer 3s ease-in-out infinite'],
  c_mint:       ['linear-gradient(135deg,#a0ffe0 0%,#4dffc3 50%,#00cc88 100%)', '0 0 18px #4dffc3', 'galaxyShimmer 3.5s ease-in-out infinite'],
  c_bronze_skin:['linear-gradient(135deg,#e8a840 0%,#c07830 50%,#7a4810 100%)', '0 0 18px #c07830', 'galaxyShimmer 3s ease-in-out infinite'],
  c_storm_grey: ['linear-gradient(135deg,#8090b0 0%,#4a5568 50%,#1a2030 100%)', '0 0 18px #6090d0', 'voidPulse 2.5s ease-in-out infinite'],
  // ── Crate: Rare ──
  c_prism:      ['conic-gradient(red,orange,yellow,green,cyan,blue,violet,red)', '0 0 28px #fff', 'quantumSpin 2s linear infinite'],
  c_aurora:     ['linear-gradient(180deg,#00ff99 0%,#00aaff 40%,#9900cc 100%)', '0 0 28px #00ff99', 'galaxyShimmer 2.5s ease-in-out infinite'],
  c_lava:       ['radial-gradient(circle,#ffcc00 0%,#ff4500 45%,#cc0000 75%,#440000 100%)', '0 0 28px #ff4500', 'voidPulse 1.5s ease-in-out infinite'],
  c_storm:      ['radial-gradient(circle,#c0d8ff 0%,#4080ff 35%,#0020a0 65%,#000820 100%)', '0 0 28px #4080ff', 'voidPulse 2s ease-in-out infinite'],
  c_neon:       ['linear-gradient(135deg,#ff00cc 0%,#00ffff 50%,#ff00cc 100%)', '0 0 28px #ff00cc,0 0 50px rgba(0,255,255,0.5)', 'quantumSpin 3s linear infinite'],
  c_bloodmoon:  ['radial-gradient(circle,#ff2020 0%,#8b0000 45%,#200000 100%)', '0 0 28px #cc0000', 'voidPulse 1.8s ease-in-out infinite'],
  c_frostfire:  ['linear-gradient(90deg,#00aaff 0%,#0055ff 45%,#ff4400 55%,#ff8800 100%)', '0 0 28px #8844ff', 'galaxyShimmer 2s ease-in-out infinite'],
  c_vortex:     ['conic-gradient(from 0deg,#6600ff,#4400aa,#0044ff,#6600ff)', '0 0 28px #5500ee', 'quantumSpin 3s linear infinite'],
  c_toxic_waste:['radial-gradient(circle,#aaff00 0%,#39ff14 40%,#003300 100%)', '0 0 28px #39ff14', 'voidPulse 1.5s ease-in-out infinite'],
  // ── Crate: Epic ──
  c_glitch:     ['conic-gradient(#ff0080,#00ffff,#ff0000,#00ff00,#ff00ff,#0000ff,#ff0080)', '0 0 35px #ff0080,0 0 60px rgba(0,255,255,0.5)', 'quantumSpin 0.6s linear infinite'],
  c_nebula:     ['radial-gradient(circle at 40% 35%,#ff80cc 0%,#9922cc 35%,#220066 65%,#110033 100%)', '0 0 35px #9922cc', 'galaxyShimmer 2s ease-in-out infinite'],
  c_biohazard:  ['radial-gradient(circle,#ccff00 0%,#39ff14 30%,#006600 65%,#001a00 100%)', '0 0 35px #39ff14', 'voidPulse 1.2s ease-in-out infinite'],
  c_arctic:     ['radial-gradient(circle,#fff 0%,#aaeeff 25%,#00c8ff 55%,#004466 100%)', '0 0 35px #00e5ff', 'galaxyShimmer 3s ease-in-out infinite'],
  c_wildfire:   ['radial-gradient(circle,#fff 0%,#ffff00 20%,#ff6600 50%,#cc0000 75%,#300000 100%)', '0 0 35px #ff6600', 'voidPulse 0.9s ease-in-out infinite'],
  c_spectre:    ['radial-gradient(circle,rgba(255,255,255,0.95) 0%,rgba(180,180,255,0.8) 35%,rgba(80,80,200,0.5) 65%,rgba(20,20,80,0.3) 100%)', '0 0 35px rgba(160,160,255,0.9)', 'voidPulse 2.5s ease-in-out infinite'],
  c_blackhole:  ['conic-gradient(from 0deg,#000000,#110011,#330033,#000000)', '0 0 35px #440044', 'quantumSpin 1.2s linear infinite'],
  c_dragonscale:['conic-gradient(from 0deg,#ff2200,#cc4400,#ffaa00,#cc4400,#ff2200)', '0 0 35px #ff6600', 'quantumSpin 1.5s linear infinite'],
  c_hologram:   ['conic-gradient(from 0deg,rgba(0,255,255,0.8),rgba(255,0,255,0.8),rgba(255,255,0,0.8),rgba(0,255,255,0.8))', '0 0 35px white', 'quantumSpin 0.8s linear infinite'],
  c_thunderstrike:['radial-gradient(circle,#ffff00 0%,#f5d800 30%,#ff8800 70%,#220000 100%)', '0 0 35px #f5d800', 'quantumSpin 1.0s linear infinite'],
  // ── Crate: Legendary ──
  c_supernova:  ['conic-gradient(white,yellow,orange,red,magenta,blue,cyan,white)', '0 0 45px #fff,0 0 80px rgba(255,200,0,0.6)', 'quantumSpin 1.5s linear infinite'],
  c_wraith:     ['radial-gradient(circle,#8800ff 0%,#440088 30%,#1a0033 60%,#000 100%)', '0 0 45px #8800ff,0 0 80px rgba(100,0,255,0.5)', 'voidPulse 2s ease-in-out infinite'],
  c_titan:      ['radial-gradient(circle,#ffe080 0%,#f5a623 30%,#b87333 60%,#3c1a00 100%)', '0 0 45px #f5a623', 'celestialGlow 2.5s ease-in-out infinite'],
  c_astral:     ['linear-gradient(135deg,#00e5ff 0%,#7b2ff7 35%,#ff00aa 65%,#00e5ff 100%)', '0 0 45px #7b2ff7', 'quantumSpin 4s linear infinite'],
  c_eclipse:    ['radial-gradient(circle,#ffd700 0%,#c07000 15%,#050505 40%,#ffd700 80%,#050505 100%)', '0 0 45px #ffd700', 'quantumSpin 2s linear infinite'],
  c_abyssal_flame:['conic-gradient(from 0deg,#000820,#001860,#0044aa,#0088ff,#001860,#000820)', '0 0 45px #0066ff', 'quantumSpin 1.8s linear infinite'],
  c_zero_point: ['radial-gradient(circle,white 0%,#ccddff 20%,#2200aa 60%,#000000 100%)', '0 0 45px white', 'quantumSpin 1.5s linear infinite'],
  // ── Crate: Mythic ──
  c_omnichrome: ['conic-gradient(red,orange,yellow,lime,cyan,blue,violet,magenta,red)', '0 0 55px #fff,0 0 90px rgba(255,255,255,0.7)', 'quantumSpin 0.7s linear infinite'],
  c_singularity:['conic-gradient(#ff0080,#00ffff,#8000ff,#ff0080)', '0 0 55px #7700ff', 'quantumSpin 2s linear infinite'],
  c_ultraviolet:['radial-gradient(circle,#ff88ff 0%,#cc00ff 30%,#6600cc 60%,#200033 100%)', '0 0 55px #cc00ff', 'voidPulse 1.5s ease-in-out infinite'],
  c_godmode:    ['radial-gradient(circle,#fff 0%,#fffdd0 20%,#fff59d 50%,#ffd700 80%,#fff 100%)', '0 0 55px #fff,0 0 90px rgba(255,215,0,0.8)', 'diamondShine 1.8s ease-in-out infinite'],
  c_rift:       ['linear-gradient(135deg,#000 0%,#1a0044 25%,#ff00aa 50%,#00ffff 75%,#000 100%)', '0 0 55px #ff00aa', 'quantumSpin 2.5s linear infinite'],
  c_entropy:    ['conic-gradient(red,orange,yellow,lime,cyan,blue,violet,red)', '0 0 55px white', 'quantumSpin 0.5s linear infinite'],
  c_dimension_rift:['conic-gradient(from 0deg,#0000ff,#ff00ff,#00ffff,#ffffff,#ff00ff,#0000ff)', '0 0 55px #aa00ff', 'quantumSpin 0.6s linear infinite'],
  c_eternal:    ['radial-gradient(circle,#fffacc 0%,#ffd700 40%,#c09000 70%,#402000 100%)', '0 0 55px #ffd700', 'voidPulse 2s ease-in-out infinite'],
  // ── Oblivion Crate ──
  ob_duskblade:   ['radial-gradient(circle,#9055ff 0%,#5a2d8c 40%,#1a0a2e 100%)', '0 0 20px rgba(144,85,255,0.5)', 'voidPulse 2s ease-in-out infinite'],
  ob_voidborn:    ['radial-gradient(circle,#3355cc 0%,#1a2266 40%,#060618 100%)', '0 0 20px rgba(51,85,204,0.5)', 'voidPulse 2.5s ease-in-out infinite'],
  ob_ashwalker:   ['radial-gradient(circle,#8a6040 0%,#4a3020 40%,#1a0f08 100%)', '0 0 18px rgba(138,96,64,0.4)', ''],
  ob_nightcrawler:['radial-gradient(circle,#1a2060 0%,#050520 55%,#000000 100%)', '0 0 20px rgba(30,30,120,0.8)', 'voidPulse 2.5s ease-in-out infinite'],
  ob_ironwraith:  ['radial-gradient(circle,#7090b0 0%,#3d2820 50%,#0a0806 100%)', '0 0 18px rgba(80,120,180,0.7)', 'voidPulse 2s ease-in-out infinite'],
  ob_soulreaper:  ['radial-gradient(circle,#ff3366 0%,#991133 35%,#330011 70%,#0a0003 100%)', '0 0 25px rgba(255,51,102,0.6)', 'voidPulse 1.5s ease-in-out infinite'],
  ob_eclipsar:    ['radial-gradient(circle,#ffd700 0%,#664400 30%,#0d1133 60%,#000 100%)', '0 0 25px rgba(255,215,0,0.4)', 'galaxyShimmer 3s ease-in-out infinite'],
  ob_phantomking: ['radial-gradient(circle,#bb88ff 0%,#6633aa 35%,#220055 70%,#0a0018 100%)', '0 0 25px rgba(187,136,255,0.5)', 'voidPulse 2s ease-in-out infinite'],
  ob_hellforge:   ['conic-gradient(from 0deg,#550000,#cc3300,#ff6600,#cc3300,#550000)', '0 0 25px rgba(220,80,0,0.8)', 'quantumSpin 2s linear infinite'],
  ob_gravemind:   ['radial-gradient(circle,#f5f0e0 0%,#c8b090 40%,#301808 100%)', '0 0 20px rgba(80,40,20,0.8)', 'voidPulse 3s ease-in-out infinite'],
  ob_abyssal:     ['radial-gradient(circle,#2244aa 0%,#0d1133 40%,#020208 100%)', '0 0 30px rgba(34,68,170,0.5)', 'voidPulse 3s ease-in-out infinite'],
  ob_eventide:    ['conic-gradient(from 0deg,#1a0a2e,#2a1a4e,#3a2a6e,#2a1a4e,#1a0a2e)', '0 0 30px rgba(100,60,160,0.4)', 'quantumSpin 5s linear infinite'],
  ob_voidwalker:  ['radial-gradient(circle,rgba(80,0,160,0.4) 0%,rgba(20,0,60,0.7) 60%,rgba(0,0,0,0.9) 100%)', '0 0 30px rgba(100,0,200,0.9)', 'quantumSpin 1.8s linear infinite'],
  ob_deathbloom:  ['conic-gradient(from 0deg,#0a0000,#1a0000,#cc0000,#1a0000,#0a0000)', '0 0 28px rgba(200,0,0,0.9)', 'quantumSpin 1.4s linear infinite'],
  ob_worldeater:  ['radial-gradient(circle,#ff0000 0%,#660000 30%,#1a0000 60%,#000 100%)', '0 0 35px rgba(255,0,0,0.7)', 'voidPulse 0.8s ease-in-out infinite'],
  ob_eternium:    ['conic-gradient(from 0deg,#ff2060,#8a2be2,#00ccff,#39ff14,#ffd700,#ff2060)', '0 0 35px rgba(138,43,226,0.6)', 'quantumSpin 1.2s linear infinite'],
  ob_apocalypse:  ['conic-gradient(from 0deg,#cc0000,#ff4400,#ffaa00,#440000,#cc0000)', '0 0 40px rgba(255,100,0,0.9)', 'quantumSpin 0.8s linear infinite'],
  // ── Neon Crate ──
  neon_pulse:     ['linear-gradient(135deg,#80e8ff 0%,#00b4ff 50%,#0055aa 100%)', '0 0 22px #00b4ff', 'voidPulse 1.8s ease-in-out infinite'],
  neon_grid:      ['linear-gradient(135deg,#80fff0 0%,#00ffcc 50%,#00aa88 100%)', '0 0 22px #00ffcc', 'galaxyShimmer 2.5s ease-in-out infinite'],
  neon_surge:     ['conic-gradient(from 0deg,#0088ff,#00ffff,#00ff88,#0088ff)', '0 0 28px #00ffcc', 'quantumSpin 2.5s linear infinite'],
  neon_cipher:    ['radial-gradient(circle,#00ff88 0%,#00aa44 40%,#002200 100%)', '0 0 28px #00ff88', 'voidPulse 1.5s ease-in-out infinite'],
  neon_overload:  ['conic-gradient(from 0deg,#ff00ff,#00ffff,#ffff00,#ff0088,#ff00ff)', '0 0 35px #ff00ff', 'quantumSpin 0.9s linear infinite'],
  neon_synthwave: ['linear-gradient(180deg,#ff6ec7 0%,#ff4488 30%,#aa00ff 60%,#0033ff 100%)', '0 0 45px #ff4488', 'quantumSpin 2s linear infinite'],
  // ── Frost Crate ──
  frost_snowdrift:   ['radial-gradient(circle,#ffffff 0%,#cce8ff 55%,#6699cc 100%)', '0 0 14px #a0d0ff', ''],
  frost_icicle:      ['linear-gradient(135deg,#d0eeff 0%,#a8d8ea 50%,#5090b0 100%)', '0 0 18px #a8d8ea', 'galaxyShimmer 3s ease-in-out infinite'],
  frost_blizzard:    ['conic-gradient(from 0deg,white,#aaddff,#6699cc,white)', '0 0 28px #aaddff', 'quantumSpin 3s linear infinite'],
  frost_permafrost:  ['radial-gradient(circle,#80bbdd 0%,#2266aa 40%,#001133 100%)', '0 0 28px #4499cc', 'voidPulse 2s ease-in-out infinite'],
  frost_avalanche:   ['conic-gradient(from 0deg,#ffffff,#88ccff,#0044aa,#88ccff,#ffffff)', '0 0 35px #88ccff', 'quantumSpin 1.5s linear infinite'],
  frost_absolute_zero:['radial-gradient(circle,rgba(255,255,255,0.9) 0%,rgba(180,220,255,0.7) 40%,rgba(0,80,160,0.5) 100%)', '0 0 45px white', 'quantumSpin 2s linear infinite'],
  // ── Infernal Crate ──
  infernal_ember:      ['radial-gradient(circle,#ffaa44 0%,#ff6600 55%,#551100 100%)', '0 0 18px #ff6600', ''],
  infernal_cinder:     ['radial-gradient(circle,#88807a 0%,#555244 55%,#1a1510 100%)', '0 0 16px #887860', 'voidPulse 2.5s ease-in-out infinite'],
  infernal_wildfire:   ['conic-gradient(from 0deg,#ff4400,#ff8800,#ffcc00,#ff4400)', '0 0 28px #ff6600', 'quantumSpin 2s linear infinite'],
  infernal_eruption:   ['radial-gradient(circle,#ffcc00 0%,#ff4400 40%,#880000 75%,#1a0000 100%)', '0 0 28px #ff6600', 'voidPulse 1.5s ease-in-out infinite'],
  infernal_hellstorm:  ['conic-gradient(from 0deg,#ff0000,#aa0000,#ff4400,#ffaa00,#aa0000,#ff0000)', '0 0 35px #ff2200', 'quantumSpin 1.0s linear infinite'],
  infernal_solar_flare:['radial-gradient(circle,white 0%,#ffff88 20%,#ffcc00 50%,#ff4400 80%)', '0 0 45px white', 'quantumSpin 1.5s linear infinite'],
  // ── Void Crate ──
  void_hollow:        ['radial-gradient(circle,#111111 0%,#050505 60%,#000000 100%)', '0 0 15px rgba(80,0,160,0.5)', ''],
  void_nebula_core:   ['conic-gradient(from 0deg,#0a002a,#220066,#440088,#220066,#0a002a)', '0 0 35px #440088', 'quantumSpin 2s linear infinite'],
  void_dark_matter:   ['radial-gradient(circle,rgba(40,0,80,0.6) 0%,rgba(10,0,20,0.9) 100%)', '0 0 25px rgba(100,0,200,0.7)', 'voidPulse 3s ease-in-out infinite'],
  void_event_horizon: ['radial-gradient(circle,#000000 0%,#000000 30%,#6600cc 40%,#aa44ff 50%,#000000 60%)', '0 0 45px #8800ff', 'quantumSpin 1.5s linear infinite'],
  void_big_bang:      ['conic-gradient(from 0deg,white,#ffff00,#ff4400,#aa00ff,#0044ff,#00ffff,white)', '0 0 55px white', 'quantumSpin 0.6s linear infinite'],
};

// ════════════════════════════════════════════════════════════════════
// SECTION 2: CANVAS RENDERING
// Gradient helpers and per-skin fill configs for in-game rendering
// ════════════════════════════════════════════════════════════════════

// Creates a radial gradient with optional highlight offset
function _rg(ctx, x, y, r, stops, cx, cy) {
  const ox = cx !== undefined ? cx : -0.3;
  const oy = cy !== undefined ? cy : -0.3;
  const g = ctx.createRadialGradient(x + ox * r, y + oy * r, 0, x, y, r);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return g;
}

// Creates a linear gradient at an angle
function _lg(ctx, x, y, r, angle, stops) {
  const rad = angle * Math.PI / 180;
  const g = ctx.createLinearGradient(
    x - Math.cos(rad) * r, y - Math.sin(rad) * r,
    x + Math.cos(rad) * r, y + Math.sin(rad) * r
  );
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return g;
}

// Creates a conic gradient
function _cg(ctx, x, y, startAngle, stops) {
  const g = ctx.createConicGradient(startAngle, x, y);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return g;
}

// ── Static radial gradient data (offset highlight at 35% 35%) ──
// Format: [offset, color, offset, color, ...]
const _RAD = {
  agent:    [0,'#d0f4ff', .4,'#9be7ff', .75,'#3ab0d8', 1,'#0a4a6a'],
  inferno:  [0,'#ffcc55', .4,'#ff6b35', .75,'#cc2200', 1,'#3d0800'],
  venom:    [0,'#ccffcc', .45,'#6bff7b', .8,'#1faa33', 1,'#073310'],
  ice:      [0,'#ddfaff', .4,'#6de6ff', .75,'#009dd4', 1,'#002d44'],
  shadow:   [0,'#dcc8ff', .45,'#9966ff', .8,'#4a18c8', 1,'#0c0020'],
  amber:    [0,'#ffe8a0', .45,'#ffaa00', .8,'#c87000', 1,'#3d1e00'],
  crimson:  [0,'#ff8899', .45,'#dc143c', .8,'#7a0018', 1,'#1c0006'],
  gold:     [0,'#fff8c0', .38,'#ffd700', .72,'#c09000', 1,'#4a3200'],
  ocean:    [0,'#55b8d8', .48,'#006994', .8,'#003555', 1,'#000b18'],
  toxic:    [0,'#eaff99', .45,'#9afd2e', .8,'#4a8800', 1,'#152900'],
  magma:    [0,'#ffdd44', .38,'#ff4500', .72,'#b51800', 1,'#280500'],
  plasma:   [0,'#ffccf0', .45,'#ff69d9', .8,'#c01880', 1,'#2d0018'],
  emerald:  [0,'#b8ffd8', .45,'#50c878', .8,'#157535', 1,'#032812'],
  frost:    [0,'#ffffff', .35,'#c8eeff', .72,'#80c8e0', 1,'#1e4e60'],
  midnight: [0,'#7070ff', .45,'#1a1aff', .8,'#060680', 1,'#00000f'],
  sakura:   [0,'#ffe0ea', .45,'#ffb7c5', .8,'#f05878', 1,'#550020'],
  electric: [0,'#ffffff', .25,'#88ffff', .58,'#00ffff', 1,'#005566'],
  ruby:     [0,'#ff9ab5', .42,'#e0115f', .78,'#880030', 1,'#180008'],
  lime:     [0,'#f0ffaa', .45,'#ccff00', .8,'#88bb00', 1,'#253000'],
  violet:   [0,'#e090ff', .45,'#8f00ff', .8,'#440080', 1,'#0c001e'],
  copper:   [0,'#f0d090', .45,'#b87333', .8,'#784218', 1,'#2a1200'],
  cyber:    [0,'#b0ffd0', .4,'#00ff41', .75,'#00a020', 1,'#001800'],
  diamond:  [0,'#fff', .2,'#f0f8ff', .4,'#ffe6f0', .6,'#fff5e6', .8,'#f0f0ff', 1,'#fff'],
  c_static: [0,'#c8c8dc', .6,'#808090', 1,'#404050'],
  c_rust:   [0,'#c06030', .55,'#8b4513', 1,'#4a2008'],
  c_slate:  [0,'#8090a0', .55,'#607080', 1,'#303840'],
  c_olive:  [0,'#9ab040', .55,'#6b8e23', 1,'#344010'],
  c_maroon: [0,'#cc3050', .55,'#9b2335', 1,'#4a0f1a'],
  c_moss:   [0,'#6aaa50', .55,'#3d6e3d', 1,'#1a3318'],
  c_ash:    [0,'#e8e0d8', .55,'#b0a898', 1,'#585048'],
  c_dusk:   [0,'#5050a0', .55,'#2d2050', 1,'#10081e'],
  c_clay:   [0,'#d4854a', .55,'#b5651d', 1,'#5a2c08'],
  c_cobalt: [0,'#3080ff', .55,'#0047ab', 1,'#001a60'],
  c_teal:   [0,'#00c8b0', .55,'#00897b', 1,'#003830'],
  c_coral:  [0,'#ff9080', .55,'#ff6f61', 1,'#a02010'],
  c_sand:   [0,'#e0c870', .55,'#c2a25a', 1,'#6a5020'],
  c_lava:   [0,'#ffcc00', .45,'#ff4500', .75,'#cc0000', 1,'#440000'],
  c_storm:  [0,'#c0d8ff', .35,'#4080ff', .65,'#0020a0', 1,'#000820'],
  c_nebula: [0,'#ff80cc', .35,'#9922cc', .65,'#220066', 1,'#110033'],
  c_biohazard:[0,'#ccff00', .3,'#39ff14', .65,'#006600', 1,'#001a00'],
  c_arctic: [0,'#fff', .25,'#aaeeff', .55,'#00c8ff', 1,'#004466'],
  c_wildfire:[0,'#fff', .2,'#ffff00', .5,'#ff6600', .75,'#cc0000', 1,'#300000'],
  c_spectre:[0,'rgba(255,255,255,0.95)', .35,'rgba(180,180,255,0.8)', .65,'rgba(80,80,200,0.5)', 1,'rgba(20,20,80,0.3)'],
  c_bloodmoon:[0,'#ff2020', .45,'#8b0000', 1,'#200000'],
  c_toxic_waste:[0,'#aaff00', .4,'#39ff14', 1,'#003300'],
  c_thunderstrike:[0,'#ffff00', .3,'#f5d800', .7,'#ff8800', 1,'#220000'],
  c_wraith: [0,'#8800ff', .3,'#440088', .6,'#1a0033', 1,'#000'],
  c_titan:  [0,'#ffe080', .3,'#f5a623', .6,'#b87333', 1,'#3c1a00'],
  c_ultraviolet:[0,'#ff88ff', .3,'#cc00ff', .6,'#6600cc', 1,'#200033'],
  c_godmode:[0,'#fff', .2,'#fffdd0', .5,'#fff59d', .8,'#ffd700', 1,'#fff'],
  c_eclipse:[0,'#ffd700', .15,'#c07000', .4,'#050505', .8,'#ffd700', 1,'#050505'],
  c_zero_point:[0,'white', .2,'#ccddff', .6,'#2200aa', 1,'#000000'],
  c_eternal:[0,'#fffacc', .4,'#ffd700', .7,'#c09000', 1,'#402000'],
  ob_duskblade:[0,'#9055ff', .4,'#5a2d8c', 1,'#1a0a2e'],
  ob_voidborn: [0,'#3355cc', .4,'#1a2266', 1,'#060618'],
  ob_ashwalker:[0,'#8a6040', .4,'#4a3020', 1,'#1a0f08'],
  ob_nightcrawler:[0,'#1a2060', .55,'#050520', 1,'#000000'],
  ob_ironwraith:[0,'#7090b0', .5,'#3d2820', 1,'#0a0806'],
  ob_soulreaper:[0,'#ff3366', .35,'#991133', .7,'#330011', 1,'#0a0003'],
  ob_eclipsar: [0,'#ffd700', .3,'#664400', .6,'#0d1133', 1,'#000'],
  ob_phantomking:[0,'#bb88ff', .35,'#6633aa', .7,'#220055', 1,'#0a0018'],
  ob_gravemind:[0,'#f5f0e0', .4,'#c8b090', 1,'#301808'],
  ob_abyssal:  [0,'#2244aa', .4,'#0d1133', 1,'#020208'],
  ob_worldeater:[0,'#ff0000', .3,'#660000', .6,'#1a0000', 1,'#000'],
  ob_eternium: null, // conic
  frost_snowdrift:[0,'#ffffff', .55,'#cce8ff', 1,'#6699cc'],
  frost_permafrost:[0,'#80bbdd', .4,'#2266aa', 1,'#001133'],
  infernal_ember:[0,'#ffaa44', .55,'#ff6600', 1,'#551100'],
  infernal_cinder:[0,'#88807a', .55,'#555244', 1,'#1a1510'],
  infernal_eruption:[0,'#ffcc00', .4,'#ff4400', .75,'#880000', 1,'#1a0000'],
  infernal_solar_flare:[0,'white', .2,'#ffff88', .5,'#ffcc00', .8,'#ff4400'],
  void_hollow:[0,'#111111', .6,'#050505', 1,'#000000'],
  void_dark_matter:[0,'rgba(40,0,80,0.6)', 1,'rgba(10,0,20,0.9)'],
  void_event_horizon:[0,'#000000', .3,'#000000', .4,'#6600cc', .5,'#aa44ff', .6,'#000000'],
  neon_cipher:[0,'#00ff88', .4,'#00aa44', 1,'#002200'],
};

// ── Static radial gradient data (centered, no offset) ──
const _RAD_C = {
  phoenix:  [0,'#ff4500', .5,'#ff6347', 1,'#ffa500'],
  'gold-champion':  [0,'#ffd700', .4,'#ffed4e', .6,'#fff', 1,'#ffd700'],
  'silver-champion':[0,'#c0c0c0', .4,'#e8e8e8', .6,'#fff', 1,'#c0c0c0'],
  'bronze-champion':[0,'#cd7f32', .4,'#e8a87c', .6,'#f5d0a9', 1,'#cd7f32'],
  icon_noah_brown:  [0,'#9a6033', .5,'#6b4423', 1,'#3a2010'],
  icon_keegan_baseball:[0,'#f5f5f5', .5,'#e0e0d0', 1,'#c8c8b0'],
  icon_evan_watermelon:[0,'#ff6b9d', .3,'#ff4466', .5,'#ff1744', .7,'#4caf50', 1,'#2e7d32'],
  icon_carter_cosmic:[0,'#ff2020', .4,'#cc0000', .7,'#660000', 1,'#1a0000'],
  icon_justin_clover:[0,'#39ff14', .4,'#1a8c2e', .7,'#0d5c1a', 1,'#042b0a'],
  icon_troy_puck:   [0,'#3a3a3a', .5,'#1a1a1a', 1,'#050505'],
  bp1_striker:  [0,'#ff8050', .5,'#ff6b35', 1,'#883010'],
  bp1_guardian: [0,'#70ffee', .5,'#4ecdc4', 1,'#1a6060'],
  bp1_phantom:  [0,'#cc88ff', .5,'#9b59b6', 1,'#4a1a66'],
  bp1_tempest:  [0,'#80aaff', .5,'#3498db', 1,'#103055'],
  bp1_eclipse:  [0,'#404060', .5,'#2c3e50', 1,'#0d1520'],
  bp1_sovereign:[0,'#ffd060', .5,'#f39c12', 1,'#6a3a00'],
  bp1_apex:     [0,'#ff8888', .4,'#e74c3c', 1,'#660000'],
};

// ── Static linear gradient data: [angle, ...stops] ──
const _LIN = {
  sunset:   [135, 0,'#ff6b6b', .5,'#ffd93d', 1,'#ff69b4'],
  galaxy:   [135, 0,'#667eea', .5,'#764ba2', 1,'#f093fb'],
  icon_dpoe_fade: [135, 0,'#ff69b4', .5,'#ff9ec4', 1,'#89cff0'],
  icon_gavin_tzl: [135, 0,'#dc143c', .5,'#fff', 1,'#0047ab'],
  c_chrome: [135, 0,'#666', .25,'#ddd', .5,'#999', .75,'#fff', 1,'#888'],
  c_aurora: [180, 0,'#00ff99', .4,'#00aaff', 1,'#9900cc'],
  c_neon:   [135, 0,'#ff00cc', .5,'#00ffff', 1,'#ff00cc'],
  c_astral: [135, 0,'#00e5ff', .35,'#7b2ff7', .65,'#ff00aa', 1,'#00e5ff'],
  c_rift:   [135, 0,'#000', .25,'#1a0044', .5,'#ff00aa', .75,'#00ffff', 1,'#000'],
  c_frostfire:[90, 0,'#00aaff', .45,'#0055ff', .55,'#ff4400', 1,'#ff8800'],
  c_sapphire:[135, 0,'#4080ff', .5,'#1560bd', 1,'#072f6e'],
  c_mint:   [135, 0,'#a0ffe0', .5,'#4dffc3', 1,'#00cc88'],
  c_bronze_skin:[135, 0,'#e8a840', .5,'#c07830', 1,'#7a4810'],
  c_storm_grey:[135, 0,'#8090b0', .5,'#4a5568', 1,'#1a2030'],
  neon_pulse:[135, 0,'#80e8ff', .5,'#00b4ff', 1,'#0055aa'],
  neon_grid:[135, 0,'#80fff0', .5,'#00ffcc', 1,'#00aa88'],
  neon_synthwave:[180, 0,'#ff6ec7', .3,'#ff4488', .6,'#aa00ff', 1,'#0033ff'],
  frost_icicle:[135, 0,'#d0eeff', .5,'#a8d8ea', 1,'#5090b0'],
};

// ── Static conic gradient data: [offset, color, ...] ──
const _CON = {
  rainbow:  [0,'red', .143,'orange', .286,'yellow', .429,'green', .571,'cyan', .714,'blue', .857,'violet', 1,'red'],
  quantum:  [0,'#ff0080', .25,'#00ffff', .5,'#8000ff', .75,'#ffff00', 1,'#ff0080'],
  transcendence:[0,'#ff0080', .25,'#00ffff', .5,'#8000ff', .75,'#ffff00', 1,'#ff0080'],
  icon_the_creator:[0,'#ff0080', .25,'#00ffff', .5,'#8000ff', .75,'#ffff00', 1,'#ff0080'],
  icon_kayden_duck:[0.05,'#5a6b2a', .25,'#c4a265', .5,'#3d2b0e', .75,'#7a5c28', 1,'#5a6b2a'],
  c_prism:  [0,'red', .143,'orange', .286,'yellow', .429,'green', .571,'cyan', .714,'blue', .857,'violet', 1,'red'],
  c_glitch: [0,'#ff0080', .167,'#00ffff', .333,'#ff0000', .5,'#00ff00', .667,'#ff00ff', .833,'#0000ff', 1,'#ff0080'],
  c_supernova:[0,'white', .125,'yellow', .25,'orange', .375,'red', .5,'magenta', .625,'blue', .75,'cyan', 1,'white'],
  c_omnichrome:[0,'red', .111,'orange', .222,'yellow', .333,'lime', .444,'cyan', .556,'blue', .667,'violet', .778,'magenta', 1,'red'],
  c_singularity:[0,'#ff0080', .33,'#00ffff', .67,'#8000ff', 1,'#ff0080'],
  c_entropy:[0,'red', .143,'orange', .286,'yellow', .429,'lime', .571,'cyan', .714,'blue', .857,'violet', 1,'red'],
  c_dimension_rift:[0,'#0000ff', .167,'#ff00ff', .333,'#00ffff', .5,'#ffffff', .667,'#ff00ff', .833,'#0000ff', 1,'#0000ff'],
  c_blackhole:[0,'#000000', .33,'#110011', .67,'#330033', 1,'#000000'],
  c_dragonscale:[0,'#ff2200', .25,'#cc4400', .5,'#ffaa00', .75,'#cc4400', 1,'#ff2200'],
  c_hologram:[0,'rgba(0,255,255,0.8)', .33,'rgba(255,0,255,0.8)', .67,'rgba(255,255,0,0.8)', 1,'rgba(0,255,255,0.8)'],
  c_abyssal_flame:[0,'#000820', .167,'#001860', .333,'#0044aa', .5,'#0088ff', .667,'#001860', .833,'#000820', 1,'#000820'],
  ob_eventide:[0,'#1a0a2e', .25,'#2a1a4e', .5,'#3a2a6e', .75,'#2a1a4e', 1,'#1a0a2e'],
  ob_hellforge:[0,'#550000', .25,'#cc3300', .5,'#ff6600', .75,'#cc3300', 1,'#550000'],
  ob_deathbloom:[0,'#0a0000', .25,'#1a0000', .5,'#cc0000', .75,'#1a0000', 1,'#0a0000'],
  ob_apocalypse:[0,'#cc0000', .25,'#ff4400', .5,'#ffaa00', .75,'#440000', 1,'#cc0000'],
  ob_eternium:[0,'#ff2060', .167,'#8a2be2', .333,'#00ccff', .5,'#39ff14', .667,'#ffd700', .833,'#ff2060', 1,'#ff2060'],
  ob_voidwalker:[0,'rgba(80,0,160,0.4)', .6,'rgba(20,0,60,0.7)', 1,'rgba(0,0,0,0.9)'],
  neon_surge:[0,'#0088ff', .33,'#00ffff', .67,'#00ff88', 1,'#0088ff'],
  neon_overload:[0,'#ff00ff', .25,'#00ffff', .5,'#ffff00', .75,'#ff0088', 1,'#ff00ff'],
  frost_blizzard:[0,'white', .33,'#aaddff', .67,'#6699cc', 1,'white'],
  frost_avalanche:[0,'#ffffff', .25,'#88ccff', .5,'#0044aa', .75,'#88ccff', 1,'#ffffff'],
  frost_absolute_zero:[0,'rgba(255,255,255,0.9)', .4,'rgba(180,220,255,0.7)', 1,'rgba(0,80,160,0.5)'],
  infernal_wildfire:[0,'#ff4400', .33,'#ff8800', .67,'#ffcc00', 1,'#ff4400'],
  infernal_hellstorm:[0,'#ff0000', .167,'#aa0000', .333,'#ff4400', .5,'#ffaa00', .667,'#aa0000', .833,'#ff0000', 1,'#ff0000'],
  void_nebula_core:[0,'#0a002a', .25,'#220066', .5,'#440088', .75,'#220066', 1,'#0a002a'],
  void_big_bang:[0,'white', .143,'#ffff00', .286,'#ff4400', .429,'#aa00ff', .571,'#0044ff', .714,'#00ffff', 1,'white'],
};

// ── Flat colors (perfMode + shadows/strokes) ──
// Animated skins use functions: (t) => color
const _FLAT = {
  agent:'#9be7ff', inferno:'#ff6b35', venom:'#6bff7b', ice:'#00d9ff', shadow:'#9966ff',
  amber:'#ffaa00', crimson:'#dc143c', gold:'#ffd700', ocean:'#006994', toxic:'#9afd2e',
  magma:'#ff4500', plasma:'#ff69d9', emerald:'#50c878', frost:'#b0e0e6', midnight:'#1a1aff',
  sakura:'#ffb7c5', electric:'#00ffff', ruby:'#e0115f', lime:'#ccff00', violet:'#8f00ff',
  copper:'#b87333', cyber:'#00ff41',
  rainbow: function(t) { return 'hsl(' + ((t / 20) % 360) + ',100%,70%)'; },
  sunset: function(t) { return 'hsl(' + (((t / 40) % 60)) + ',100%,65%)'; },
  galaxy: function(t) { var time = t / 50; return 'hsl(' + ((time % 120) + 240) + ',90%,65%)'; },
  phoenix: function(t) { var time = t / 30; return 'hsl(' + ((time % 40)) + ',100%,' + (60 + Math.sin(time / 5) * 10) + '%)'; },
  void: function(t) { var time = t / 300; return 'hsl(' + (270 + Math.sin(time / 2) * 20) + ',100%,' + (10 + (Math.sin(time) * 0.4 + 0.6) * 30) + '%)'; },
  diamond: function(t) { var time = t / 15; return 'hsl(' + ((time * 3) % 360) + ',' + (25 + Math.sin(time / 3) * 25) + '%,' + (93 + Math.sin(time / 4) * 5) + '%)'; },
  quantum: function(t) { var time = t / 8; return 'hsl(' + ((time * 5) % 360) + ',' + (90 + Math.sin(time / 2) * 10) + '%,' + (60 + Math.sin(time / 3) * 15) + '%)'; },
  celestial: function(t) {
    var time = t / 10, phase = Math.sin(time / 80), h, s, b;
    if (phase < -0.33) { h = 280 + Math.sin(time / 20) * 30; s = 95 + Math.sin(time / 15) * 5; b = 65 + Math.sin(time / 12) * 15; }
    else if (phase < 0.33) { h = 190 + Math.sin(time / 18) * 25; s = 90 + Math.sin(time / 13) * 10; b = 70 + Math.sin(time / 10) * 12; }
    else { h = 45 + Math.sin(time / 22) * 20; s = 100; b = 75 + Math.sin(time / 14) * 15; }
    return 'hsl(' + h + ',' + s + '%,' + b + '%)';
  },
  transcendence: function(t) { return 'hsl(' + ((t / 3) % 360) + ',100%,72%)'; },
  'gold-champion': function(t) { var time = t / 5; return 'hsl(' + (45 + Math.sin(time / 3) * 5 + Math.sin(time / 1.5) * 3) + ',100%,' + (85 + Math.sin(time / 2) * 12) + '%)'; },
  'silver-champion': function(t) { var time = t / 6; var mb = 200 + Math.sin(time / 4) * 20; return 'hsl(' + (mb + (time * 6) % 60 + Math.sin(time * 3) * 5) + ',25%,' + (Math.sin(time / 2) * 30 + 70) + '%)'; },
  'bronze-champion': function(t) { var time = t / 7; return 'hsl(' + (25 + Math.sin(time / 3) * 8 + Math.sin(time / 4) * 10 + Math.sin(time * 2) * 5) + ',85%,' + (50 + Math.sin(time / 2) * 20) + '%)'; },
  // Crate skins
  c_static: function(t) { var s = t / 150; return 'hsl(240,8%,' + (60 + Math.sin(s) * 15) + '%)'; },
  c_rust: function(t) { var s = t / 180; return 'hsl(' + (18 + Math.sin(s) * 5) + ',70%,' + (38 + Math.sin(s * 1.3) * 10) + '%)'; },
  c_slate: function(t) { return 'hsl(210,18%,' + (42 + Math.sin(t / 200) * 12) + '%)'; },
  c_olive: function(t) { var s = t / 170; return 'hsl(' + (78 + Math.sin(s) * 8) + ',55%,' + (35 + Math.sin(s * 1.2) * 10) + '%)'; },
  c_maroon: function(t) { var s = t / 190; return 'hsl(' + (348 + Math.sin(s) * 8) + ',65%,' + (35 + Math.sin(s * 1.1) * 12) + '%)'; },
  c_moss:'#3d6e3d', c_ash:'#c8c0b8', c_dusk:'#2d2050', c_clay:'#b5651d',
  c_cobalt: function(t) { var s = t / 120; return 'hsl(' + (215 + Math.sin(s) * 15) + ',85%,' + (45 + Math.sin(s * 1.4) * 18) + '%)'; },
  c_teal: function(t) { var s = t / 110; return 'hsl(' + (170 + Math.sin(s / 1.3) * 20) + ',80%,' + (42 + Math.sin(s) * 16) + '%)'; },
  c_coral: function(t) { var s = t / 130; return 'hsl(' + (14 + Math.sin(s / 1.5) * 12) + ',90%,' + (55 + Math.sin(s) * 18) + '%)'; },
  c_sand: function(t) { var s = t / 140; return 'hsl(' + (38 + Math.sin(s / 1.2) * 10) + ',65%,' + (52 + Math.sin(s) * 16) + '%)'; },
  c_chrome: function(t) { var s = t / 80; return 'hsl(' + (220 + Math.sin(s / 3) * 20) + ',' + (10 + Math.sin(s / 2) * 10) + '%,' + (55 + Math.sin(s) * 35) + '%)'; },
  c_sapphire:'#1560bd', c_mint:'#4dffc3', c_bronze_skin:'#c07830', c_storm_grey:'#4a5568',
  c_prism: function(t) { return 'hsl(' + ((t / 18 * 5) % 360) + ',100%,68%)'; },
  c_aurora: function(t) { var s = t / 40; return 'hsl(' + (130 + Math.sin(s / 6) * 90) + ',85%,' + (55 + Math.sin(s / 4) * 18) + '%)'; },
  c_lava: function(t) { var s = t / 20; return 'hsl(' + (8 + Math.sin(s / 5) * 12) + ',100%,' + (52 + Math.sin(s / 3) * 20) + '%)'; },
  c_storm: function(t) { var s = t / 35; return 'hsl(' + (215 + Math.sin(s / 5) * 25) + ',75%,' + (25 + Math.sin(s / 3) * 25) + '%)'; },
  c_neon: function(t) { return 'hsl(' + (170 + Math.sin(t / 15 / 4) * 150) + ',100%,62%)'; },
  c_bloodmoon:'#8b0000', c_frostfire:'#8844ff', c_vortex:'#5500ee', c_toxic_waste:'#39ff14',
  c_glitch: function(t) { return 'hsl(' + ((t / 6 + Math.sin(t / 23) * 120) % 360) + ',100%,' + (45 + Math.sin(t / 11) * 30) + '%)'; },
  c_nebula: function(t) { var s = t / 30; return 'hsl(' + (265 + Math.sin(s / 7) * 55) + ',' + (85 + Math.sin(s / 4) * 12) + '%,' + (42 + Math.sin(s / 5) * 22) + '%)'; },
  c_biohazard: function(t) { var s = t / 22; return 'hsl(' + (95 + Math.sin(s / 6) * 25) + ',100%,' + (42 + Math.sin(s / 3) * 25) + '%)'; },
  c_arctic: function(t) { var s = t / 35; return 'hsl(' + (190 + Math.sin(s / 5) * 20) + ',' + (70 + Math.sin(s / 4) * 25) + '%,' + (70 + Math.sin(s / 6) * 20) + '%)'; },
  c_wildfire: function(t) { var s = t / 12; return 'hsl(' + (Math.sin(s / 5) * 22 + 22) + ',100%,' + (52 + Math.sin(s / 4) * 25) + '%)'; },
  c_spectre: function(t) { var s = t / 55; return 'hsl(' + (235 + Math.sin(s / 6) * 45) + ',' + (15 + Math.sin(s / 4) * 35) + '%,' + (72 + Math.sin(s / 5) * 22) + '%)'; },
  c_blackhole:'#220022', c_dragonscale:'#cc4400', c_hologram:'#00ffff', c_thunderstrike:'#f5d800',
  c_supernova: function(t) { var s = t / 8; return 'hsl(' + ((s * 7) % 360) + ',100%,' + (78 + Math.sin(s / 3) * 18) + '%)'; },
  c_wraith: function(t) { var s = t / 60; return 'hsl(' + (265 + Math.sin(s / 5) * 35) + ',90%,' + (12 + Math.sin(s / 3) * 14) + '%)'; },
  c_titan: function(t) { var s = t / 45; return 'hsl(' + (32 + Math.sin(s / 5) * 18) + ',' + (82 + Math.sin(s / 4) * 15) + '%,' + (38 + Math.sin(s / 3) * 22) + '%)'; },
  c_astral: function(t) { var s = t / 28; return 'hsl(' + (195 + Math.sin(s / 7) * 70) + ',90%,' + (62 + Math.sin(s / 4) * 25) + '%)'; },
  c_omnichrome: function(t) { return 'hsl(' + ((t / 4 * 11) % 360) + ',100%,68%)'; },
  c_singularity: function(t) { var s = t / 18; return 'hsl(' + ((s * 4) % 360) + ',95%,' + (8 + Math.sin(s / 3) * 10) + '%)'; },
  c_ultraviolet: function(t) { var s = t / 22; return 'hsl(' + (272 + Math.sin(s / 4) * 22) + ',100%,' + (55 + Math.sin(s / 3) * 28) + '%)'; },
  c_godmode: function(t) { var s = t / 14; return 'hsl(' + (48 + Math.sin(s / 4) * 8) + ',' + (20 + Math.sin(s / 3) * 22) + '%,' + (88 + Math.sin(s / 5) * 10) + '%)'; },
  c_rift: function(t) { var s = t / 14, p = Math.sin(s / 5); if (p > 0.3) return 'hsl(' + ((s * 8) % 360) + ',100%,68%)'; return 'hsl(' + (258 + Math.sin(s / 4) * 40) + ',85%,14%)'; },
  c_eclipse:'#ffd700', c_abyssal_flame:'#0066ff', c_zero_point:'#2200aa',
  c_entropy: function(t) { return 'hsl(' + ((t / 3 * 11) % 360) + ',100%,68%)'; },
  c_dimension_rift: function(t) { return 'hsl(' + ((t / 4 * 8) % 360) + ',100%,65%)'; },
  c_eternal:'#ffd700',
  // Oblivion
  ob_duskblade: function(t) { var s = t / 1000; return 'hsl(' + (270 + Math.sin(s * 0.8) * 20) + ',60%,' + (35 + Math.sin(s * 1.5) * 8) + '%)'; },
  ob_voidborn: function(t) { var s = t / 1000; return 'hsl(' + (220 + Math.sin(s * 0.6) * 30) + ',70%,' + (18 + Math.sin(s * 1.2) * 6) + '%)'; },
  ob_ashwalker: function(t) { return 'hsl(15,30%,' + (28 + Math.sin(t / 1000 * 2) * 8) + '%)'; },
  ob_nightcrawler:'#0a1030', ob_ironwraith:'#3d2820',
  ob_soulreaper: function(t) { var s = t / 1000; return 'hsl(' + (340 + Math.sin(s * 0.7) * 15) + ',80%,' + (30 + Math.sin(s * 1.8) * 10) + '%)'; },
  ob_eclipsar: function(t) { var s = t / 1000, p = Math.sin(s * 0.5); return 'hsl(' + (p > 0 ? 45 + p * 15 : 220 - p * 30) + ',70%,' + (22 + Math.abs(p) * 18) + '%)'; },
  ob_phantomking: function(t) { var s = t / 1000; return 'hsl(' + (265 + Math.sin(s * 0.9) * 25) + ',55%,' + (40 + Math.sin(s * 1.4) * 12) + '%)'; },
  ob_abyssal: function(t) { var s = t / 1000; return 'hsl(' + (200 + Math.sin(s * 0.4) * 40) + ',90%,' + (12 + Math.sin(s * 1.6) * 5) + '%)'; },
  ob_eventide: function(t) { var s = t / 1000; return 'hsl(' + ((s * 15) % 360) + ',50%,' + (20 + Math.sin(s * 0.8) * 8) + '%)'; },
  ob_worldeater: function(t) { var s = t / 1000, p = Math.sin(s * 2.5); if (p > 0.7) return 'hsl(0,100%,' + (55 + p * 15) + '%)'; return 'hsl(' + (Math.sin(s * 0.5) * 10) + ',80%,' + (10 + Math.sin(s * 1.2) * 5) + '%)'; },
  ob_eternium: function(t) { var s = t / 1000; return 'hsl(' + ((s * 25) % 360) + ',100%,' + (60 + Math.sin(s * 1.5) * 15) + '%)'; },
  ob_hellforge: function(t) { var s = t / 1000; return 'hsl(' + (Math.sin(s * 3) * 12) + ',100%,' + (30 + Math.sin(s * 2.5) * 12) + '%)'; },
  ob_gravemind:'#e8e0d0',
  ob_voidwalker: function(t) { var s = t / 1000; return 'hsl(' + (265 + Math.sin(s * 0.8) * 25) + ',85%,' + (14 + Math.sin(s * 1.6) * 6) + '%)'; },
  ob_deathbloom: function(t) { var s = t / 1000; return 'hsl(' + (300 + Math.sin(s * 0.9) * 20) + ',75%,' + (18 + Math.sin(s * 2) * 7) + '%)'; },
  ob_apocalypse: function(t) { var s = t / 1000; return 'hsl(' + (Math.sin(s * 1.8) * 10) + ',90%,' + (8 + Math.sin(s * 2.2) * 5) + '%)'; },
  // Neon crate (shared animation pattern)
  neon_pulse: function(t) { return 'hsl(' + ((t / 18 * 3) % 360) + ',100%,60%)'; },
  neon_grid: function(t) { return 'hsl(' + ((t / 18 * 3) % 360) + ',100%,60%)'; },
  neon_surge: function(t) { return 'hsl(' + ((t / 18 * 3) % 360) + ',100%,60%)'; },
  neon_cipher: function(t) { return 'hsl(' + ((t / 18 * 3) % 360) + ',100%,60%)'; },
  neon_overload: function(t) { return 'hsl(' + ((t / 18 * 3) % 360) + ',100%,60%)'; },
  neon_synthwave: function(t) { return 'hsl(' + ((t / 18 * 3) % 360) + ',100%,60%)'; },
  // Frost crate
  frost_snowdrift:'#cce8ff', frost_icicle:'#a8d8ea',
  frost_blizzard: function(t) { var s = t / 1000; return 'hsl(' + (200 + Math.sin(s * 0.8) * 20) + ',80%,' + (62 + Math.sin(s * 1.5) * 12) + '%)'; },
  frost_permafrost: function(t) { var s = t / 1000; return 'hsl(' + (200 + Math.sin(s * 0.8) * 20) + ',80%,' + (62 + Math.sin(s * 1.5) * 12) + '%)'; },
  frost_avalanche: function(t) { var s = t / 1000; return 'hsl(' + (200 + Math.sin(s * 0.8) * 20) + ',80%,' + (62 + Math.sin(s * 1.5) * 12) + '%)'; },
  frost_absolute_zero: function(t) { var s = t / 1000; return 'hsl(' + (200 + Math.sin(s * 0.8) * 20) + ',80%,' + (62 + Math.sin(s * 1.5) * 12) + '%)'; },
  // Infernal crate
  infernal_ember:'#ff6600', infernal_cinder:'#555244',
  infernal_wildfire: function(t) { var s = t / 1000; return 'hsl(' + (Math.sin(s * 2) * 14) + ',100%,' + (48 + Math.sin(s * 1.8) * 14) + '%)'; },
  infernal_eruption: function(t) { var s = t / 1000; return 'hsl(' + (Math.sin(s * 2) * 14) + ',100%,' + (48 + Math.sin(s * 1.8) * 14) + '%)'; },
  infernal_hellstorm: function(t) { var s = t / 1000; return 'hsl(' + (Math.sin(s * 2) * 14) + ',100%,' + (48 + Math.sin(s * 1.8) * 14) + '%)'; },
  infernal_solar_flare: function(t) { var s = t / 1000; return 'hsl(' + (Math.sin(s * 2) * 14) + ',100%,' + (48 + Math.sin(s * 1.8) * 14) + '%)'; },
  // Void crate
  void_hollow:'#050505',
  void_nebula_core: function(t) { var s = t / 1000; return 'hsl(' + (270 + Math.sin(s * 0.6) * 30) + ',85%,' + (10 + Math.sin(s * 1.2) * 4) + '%)'; },
  void_dark_matter: function(t) { var s = t / 1000; return 'hsl(' + (270 + Math.sin(s * 0.6) * 30) + ',85%,' + (10 + Math.sin(s * 1.2) * 4) + '%)'; },
  void_event_horizon: function(t) { var s = t / 1000; return 'hsl(' + (270 + Math.sin(s * 0.6) * 30) + ',85%,' + (10 + Math.sin(s * 1.2) * 4) + '%)'; },
  void_big_bang: function(t) { var s = t / 1000; return 'hsl(' + (270 + Math.sin(s * 0.6) * 30) + ',85%,' + (10 + Math.sin(s * 1.2) * 4) + '%)'; },
  // Icon skins (mostly flat)
  icon_noah_brown:'#6b4423', icon_keegan_baseball:'#f5f5f5', icon_dpoe_fade:'#ff9ec4',
  icon_evan_watermelon:'#ff4466', icon_gavin_tzl:'#ffffff', icon_carter_cosmic:'#8b0000',
  icon_brody_flag:'#b22234', icon_sterling:'#0064ff', icon_justin_clover:'#1a8c2e',
  icon_profe_spain:'#aa151b', icon_kayden_duck:'#1a6b1a', icon_troy_puck:'#1a1a1a',
  icon_the_creator: function(t) { var s = t / 1000, pulse = 0.5 + Math.sin(s * 1.2) * 0.15; return 'hsl(' + (42 + Math.sin(s * 0.8) * 8) + ',100%,' + (78 + pulse * 12) + '%)'; },
  // Battle pass (flat)
  bp1_striker:'#ff6b35', bp1_guardian:'#4ecdc4', bp1_phantom:'#9b59b6',
  bp1_tempest:'#3498db', bp1_eclipse:'#2c3e50', bp1_sovereign:'#f39c12', bp1_apex:'#e74c3c',
};

// ── Glow colors for in-game shadow rendering ──
const _GLOW = {
  agent:'rgba(155,231,255,0.6)', inferno:'rgba(255,107,53,0.5)', venom:'rgba(107,255,123,0.4)',
  ice:'rgba(0,217,255,0.5)', shadow:'rgba(153,102,255,0.5)', amber:'rgba(255,170,0,0.4)',
  crimson:'rgba(220,20,60,0.5)', gold:'rgba(255,215,0,0.5)', ocean:'rgba(0,105,148,0.4)',
  toxic:'rgba(154,253,46,0.5)', magma:'rgba(255,69,0,0.5)', plasma:'rgba(255,105,217,0.4)',
  emerald:'rgba(80,200,120,0.4)', frost:'rgba(176,224,230,0.5)', midnight:'rgba(26,26,255,0.5)',
  sakura:'rgba(255,183,197,0.5)', electric:'rgba(0,255,255,0.5)', ruby:'rgba(224,17,95,0.5)',
  lime:'rgba(204,255,0,0.5)', violet:'rgba(143,0,255,0.5)', copper:'rgba(184,115,51,0.4)',
  cyber:'rgba(0,255,65,0.5)', rainbow:'rgba(255,150,0,0.7)', sunset:'rgba(255,140,0,0.5)',
  galaxy:'rgba(118,75,162,0.5)', phoenix:'rgba(255,69,0,0.6)', void:'rgba(153,0,255,0.6)',
  diamond:'rgba(255,255,255,0.7)', quantum:'rgba(255,0,255,0.8)', celestial:'rgba(183,148,246,0.7)',
  transcendence:'rgba(255,255,255,0.8)',
  'gold-champion':'rgba(255,215,0,0.6)', 'silver-champion':'rgba(192,192,192,0.6)', 'bronze-champion':'rgba(205,127,50,0.6)',
};

// ── Spinning conic configs: { speed (ms per revolution) } ──
const _SPIN = {
  rainbow: 3000, quantum: 3000, transcendence: 2000, icon_the_creator: 1500,
  c_prism: 2000, c_glitch: 600, c_supernova: 1500, c_omnichrome: 700,
  c_singularity: 2000, c_entropy: 500, c_dimension_rift: 600,
  c_blackhole: 1200, c_dragonscale: 1500, c_hologram: 800,
  c_abyssal_flame: 1800, ob_eventide: 5000, ob_hellforge: 2000,
  ob_deathbloom: 1400, ob_apocalypse: 800, ob_eternium: 1200,
  ob_voidwalker: 1800, neon_surge: 2500, neon_overload: 900,
  frost_blizzard: 3000, frost_avalanche: 1500, frost_absolute_zero: 2000,
  infernal_wildfire: 2000, infernal_hellstorm: 1000,
  infernal_solar_flare: 1500, void_nebula_core: 2000, void_big_bang: 600,
  electric: 3500, c_chrome: 3000, c_neon: 3000, c_astral: 4000,
  c_rift: 2500, c_eclipse: 2000, c_zero_point: 1500,
  neon_synthwave: 2000, c_vortex: 3000,
};

// ════════════════════════════════════════════════════════════════════
// SECTION 3: MUTATION OVERRIDES
// Layered lookup: per-skin → color-family group → generic fallback
// ════════════════════════════════════════════════════════════════════

// Color family assignments
function _skinGroup(id) {
  if (/^neon_/.test(id)) return 'neon';
  if (/^frost_/.test(id)) return 'icy';
  if (/^infernal_/.test(id)) return 'fire';
  if (/^void_/.test(id)) return 'dark_void';
  if (/^ob_/.test(id)) return 'oblivion';
  if (/^icon_/.test(id)) return 'icon';
  if (/^bp1_/.test(id)) return 'battlepass';
  if (/^c_/.test(id)) {
    // Classify by primary color
    if ('c_static c_slate c_ash c_storm_grey c_chrome'.indexOf(id) >= 0) return 'neutral';
    if ('c_rust c_clay c_maroon c_lava c_wildfire c_dragonscale'.indexOf(id) >= 0) return 'fire';
    if ('c_olive c_moss c_biohazard c_toxic_waste'.indexOf(id) >= 0) return 'green';
    if ('c_cobalt c_storm c_sapphire c_abyssal_flame'.indexOf(id) >= 0) return 'blue';
    if ('c_teal c_mint c_arctic'.indexOf(id) >= 0) return 'icy';
    if ('c_coral c_bloodmoon'.indexOf(id) >= 0) return 'red';
    if ('c_sand c_bronze_skin c_titan c_eternal c_eclipse c_godmode'.indexOf(id) >= 0) return 'gold';
    if ('c_nebula c_wraith c_ultraviolet c_spectre c_vortex c_blackhole'.indexOf(id) >= 0) return 'purple';
    if ('c_neon c_prism c_omnichrome c_entropy c_dimension_rift c_rift c_glitch c_hologram c_supernova c_frostfire c_zero_point c_thunderstrike'.indexOf(id) >= 0) return 'multi';
    if ('c_dusk'.indexOf(id) >= 0) return 'purple';
    return 'neutral';
  }
  // Shop skins by color
  if ('inferno crimson magma ruby phoenix'.indexOf(id) >= 0) return 'red';
  if ('venom toxic emerald cyber lime'.indexOf(id) >= 0) return 'green';
  if ('ice frost electric'.indexOf(id) >= 0) return 'icy';
  if ('shadow violet midnight'.indexOf(id) >= 0) return 'purple';
  if ('amber gold copper'.indexOf(id) >= 0) return 'gold';
  if ('ocean'.indexOf(id) >= 0) return 'blue';
  if ('plasma sakura'.indexOf(id) >= 0) return 'pink';
  if ('rainbow quantum celestial diamond transcendence sunset galaxy'.indexOf(id) >= 0) return 'multi';
  if ('void'.indexOf(id) >= 0) return 'dark_void';
  if ('agent'.indexOf(id) >= 0) return 'icy';
  return 'neutral';
}

// Group defaults: { cssFilter, glowColor }
const _MUT_GROUPS = {
  red:       { corrupted:{ f:'hue-rotate(175deg) saturate(2.5) brightness(0.75)', g:'rgba(0,200,200,0.7)' },   gilded:{ f:'sepia(0.85) saturate(2.8) brightness(1.15) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },  void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.6)', g:'rgba(153,0,255,0.8)' } },
  green:     { corrupted:{ f:'hue-rotate(160deg) saturate(2.2) brightness(0.82)', g:'rgba(255,50,100,0.7)' },  gilded:{ f:'sepia(0.8) saturate(2.5) brightness(1.2) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },   void:{ f:'hue-rotate(260deg) saturate(3.2) brightness(0.6)', g:'rgba(153,0,255,0.8)' } },
  icy:       { corrupted:{ f:'hue-rotate(150deg) saturate(2) brightness(0.85)', g:'rgba(255,80,50,0.7)' },     gilded:{ f:'sepia(0.75) saturate(2.5) brightness(1.25) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },  void:{ f:'hue-rotate(270deg) saturate(3) brightness(0.55)', g:'rgba(130,0,255,0.8)' } },
  purple:    { corrupted:{ f:'hue-rotate(180deg) saturate(2.5) brightness(0.7)', g:'rgba(0,255,100,0.7)' },    gilded:{ f:'sepia(0.8) saturate(3) brightness(1.3) hue-rotate(5deg)', g:'rgba(255,215,0,0.85)' },   void:{ f:'hue-rotate(295deg) saturate(3.5) brightness(0.5)', g:'rgba(200,0,255,0.8)' } },
  blue:      { corrupted:{ f:'hue-rotate(180deg) saturate(2.2) brightness(0.82)', g:'rgba(255,130,0,0.7)' },   gilded:{ f:'sepia(0.8) saturate(2.5) brightness(1.2) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },   void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.6)', g:'rgba(153,0,255,0.8)' } },
  gold:      { corrupted:{ f:'hue-rotate(180deg) saturate(2) brightness(0.9)', g:'rgba(0,100,255,0.7)' },      gilded:{ f:'sepia(0.6) saturate(2) brightness(1.1) hue-rotate(3deg)', g:'rgba(255,235,0,0.85)' },   void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.55)', g:'rgba(153,0,255,0.8)' } },
  pink:      { corrupted:{ f:'hue-rotate(170deg) saturate(2) brightness(0.85)', g:'rgba(50,255,100,0.7)' },    gilded:{ f:'sepia(0.8) saturate(2.5) brightness(1.2) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },   void:{ f:'hue-rotate(260deg) saturate(3) brightness(0.6)', g:'rgba(153,0,255,0.8)' } },
  fire:      { corrupted:{ f:'hue-rotate(185deg) saturate(2.5) brightness(0.78)', g:'rgba(0,180,255,0.7)' },   gilded:{ f:'sepia(0.7) saturate(2.2) brightness(1.15) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },  void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.6)', g:'rgba(153,0,255,0.8)' } },
  neutral:   { corrupted:{ f:'hue-rotate(180deg) saturate(2.5) brightness(0.8)', g:'rgba(255,50,50,0.75)' },   gilded:{ f:'sepia(0.8) saturate(2.5) brightness(1.2) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },   void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.65)', g:'rgba(153,0,255,0.8)' } },
  multi:     { corrupted:{ f:'hue-rotate(180deg) saturate(2.2) brightness(0.8)', g:'rgba(255,50,50,0.75)' },   gilded:{ f:'sepia(0.6) saturate(2.5) brightness(1.2) hue-rotate(5deg)', g:'rgba(255,215,0,0.85)' },  void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.65)', g:'rgba(153,0,255,0.8)' } },
  dark_void: { corrupted:{ f:'hue-rotate(180deg) saturate(3) brightness(1.3)', g:'rgba(255,50,50,0.8)' },      gilded:{ f:'sepia(0.9) saturate(3) brightness(1.5) hue-rotate(5deg)', g:'rgba(255,215,0,0.9)' },    void:{ f:'hue-rotate(295deg) saturate(4) brightness(0.85)', g:'rgba(200,0,255,0.9)' } },
  oblivion:  { corrupted:{ f:'hue-rotate(180deg) saturate(2.8) brightness(1.1)', g:'rgba(255,50,50,0.8)' },    gilded:{ f:'sepia(0.85) saturate(3) brightness(1.4) hue-rotate(5deg)', g:'rgba(255,215,0,0.85)' },  void:{ f:'hue-rotate(290deg) saturate(3.5) brightness(0.7)', g:'rgba(180,0,255,0.85)' } },
  neon:      { corrupted:{ f:'hue-rotate(180deg) saturate(2) brightness(0.85)', g:'rgba(255,50,80,0.7)' },     gilded:{ f:'sepia(0.7) saturate(2.5) brightness(1.25) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },  void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.6)', g:'rgba(153,0,255,0.8)' } },
  icon:      { corrupted:{ f:'hue-rotate(180deg) saturate(2.2) brightness(0.8)', g:'rgba(255,50,50,0.75)' },   gilded:{ f:'sepia(0.8) saturate(2.5) brightness(1.2) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },   void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.65)', g:'rgba(153,0,255,0.8)' } },
  battlepass: { corrupted:{ f:'hue-rotate(180deg) saturate(2.2) brightness(0.8)', g:'rgba(255,50,50,0.75)' },  gilded:{ f:'sepia(0.8) saturate(2.5) brightness(1.2) hue-rotate(5deg)', g:'rgba(255,215,0,0.8)' },   void:{ f:'hue-rotate(265deg) saturate(3) brightness(0.65)', g:'rgba(153,0,255,0.8)' } },
};

// Per-skin mutation overrides (only where group default isn't ideal)
const _MUT_OVERRIDES = {
  // Void skin + void mutation = too dark → brighten
  void:       { void: { f:'hue-rotate(320deg) saturate(2) brightness(1.2)', g:'rgba(255,0,150,0.8)' } },
  // Diamond + corrupted = still looks bright → darken more
  diamond:    { corrupted: { f:'hue-rotate(180deg) saturate(3) brightness(0.6)', g:'rgba(255,0,0,0.8)' } },
  // Gold champion + gilded = double gold → shift toward rose gold
  'gold-champion': { gilded: { f:'sepia(0.5) saturate(2) brightness(1.1) hue-rotate(340deg)', g:'rgba(255,180,200,0.8)' } },
  // Transcendence + void = cycling + dark → keep cycling visible
  transcendence: { void: { f:'hue-rotate(265deg) saturate(2) brightness(0.8)', g:'rgba(200,0,255,0.9)' } },
  // White/bright skins + corrupted
  c_godmode:  { corrupted: { f:'hue-rotate(180deg) saturate(3) brightness(0.55)', g:'rgba(255,0,0,0.8)' } },
  frost:      { corrupted: { f:'hue-rotate(160deg) saturate(2.5) brightness(0.7)', g:'rgba(255,50,50,0.8)' } },
  // Dark skins + void = invisible → brighten
  void_hollow:     { void: { f:'hue-rotate(300deg) saturate(4) brightness(2)', g:'rgba(200,0,255,0.9)' } },
  c_blackhole:     { void: { f:'hue-rotate(290deg) saturate(4) brightness(1.8)', g:'rgba(180,0,255,0.9)' } },
  ob_abyssal:      { void: { f:'hue-rotate(300deg) saturate(3.5) brightness(1.5)', g:'rgba(200,0,255,0.9)' } },
  c_singularity:   { void: { f:'hue-rotate(300deg) saturate(3) brightness(1.4)', g:'rgba(200,0,255,0.9)' } },
  ob_nightcrawler: { void: { f:'hue-rotate(300deg) saturate(3.5) brightness(1.6)', g:'rgba(180,0,255,0.9)' } },
  // Red skins + corrupted = hue-shift to cyan (fine but ensure glow matches)
  crimson:    { corrupted: { f:'hue-rotate(175deg) saturate(2.5) brightness(0.78)', g:'rgba(0,220,220,0.75)' } },
  ob_worldeater: { corrupted: { f:'hue-rotate(175deg) saturate(2.5) brightness(0.75)', g:'rgba(0,200,200,0.7)' } },
  ob_soulreaper: { corrupted: { f:'hue-rotate(170deg) saturate(2.2) brightness(0.8)', g:'rgba(0,200,180,0.7)' } },
  // Purple skins + void = too similar → shift toward deep magenta
  shadow:     { void: { f:'hue-rotate(310deg) saturate(3) brightness(0.55)', g:'rgba(255,0,150,0.8)' } },
  violet:     { void: { f:'hue-rotate(315deg) saturate(3) brightness(0.5)', g:'rgba(255,0,130,0.8)' } },
  ob_duskblade: { void: { f:'hue-rotate(310deg) saturate(3.5) brightness(0.6)', g:'rgba(200,0,255,0.85)' } },
  ob_phantomking: { void: { f:'hue-rotate(320deg) saturate(3) brightness(0.55)', g:'rgba(255,0,180,0.8)' } },
  c_wraith:   { void: { f:'hue-rotate(320deg) saturate(3) brightness(0.7)', g:'rgba(255,0,160,0.85)' } },
  c_nebula:   { void: { f:'hue-rotate(310deg) saturate(3) brightness(0.6)', g:'rgba(220,0,255,0.85)' } },
  c_ultraviolet: { void: { f:'hue-rotate(320deg) saturate(2.5) brightness(0.65)', g:'rgba(255,0,200,0.8)' } },
  // Gold/amber + gilded = too similar → cool shift
  gold:       { gilded: { f:'sepia(0.4) saturate(1.8) brightness(1.05) hue-rotate(345deg)', g:'rgba(255,200,180,0.8)' } },
  amber:      { gilded: { f:'sepia(0.4) saturate(2) brightness(1.1) hue-rotate(348deg)', g:'rgba(255,190,170,0.8)' } },
  copper:     { gilded: { f:'sepia(0.5) saturate(1.8) brightness(1.15) hue-rotate(350deg)', g:'rgba(255,200,190,0.8)' } },
  c_titan:    { gilded: { f:'sepia(0.4) saturate(2) brightness(1.08) hue-rotate(346deg)', g:'rgba(255,195,175,0.8)' } },
  c_eternal:  { gilded: { f:'sepia(0.4) saturate(2) brightness(1.1) hue-rotate(348deg)', g:'rgba(255,200,180,0.8)' } },
  c_eclipse:  { gilded: { f:'sepia(0.5) saturate(2.2) brightness(1.1) hue-rotate(345deg)', g:'rgba(255,190,170,0.85)' } },
  // Sterling (blue icon) + corrupted = interesting cyan→orange
  icon_sterling: { corrupted: { f:'hue-rotate(185deg) saturate(2.5) brightness(0.8)', g:'rgba(255,120,0,0.75)' } },
  // Brody flag (US flag) — keep recognizable
  icon_brody_flag: { corrupted: { f:'hue-rotate(120deg) saturate(1.5) brightness(0.85)', g:'rgba(200,50,50,0.6)' } },
};

// ════════════════════════════════════════════════════════════════════
// SECTION 4: PUBLIC API
// ════════════════════════════════════════════════════════════════════

/**
 * Applies CSS preview styling to a DOM element.
 * Replaces the old applyRichSkinPreview function.
 */
function applySkinPreview(el, skinId, fallbackColor) {
  const s = _SKIN_CSS[skinId];
  if (s) {
    el.style.background = s[0];
    el.style.boxShadow  = s[1];
    if (s[2]) el.style.animation = s[2];
    // c_singularity special filter
    if (skinId === 'c_singularity') el.style.filter = 'brightness(0.3) contrast(3)';
    return;
  }
  // Fallback: convert flat color to a radial gradient orb
  if (fallbackColor) {
    el.style.background = 'radial-gradient(circle at 35% 35%,' + fallbackColor + 'ee 0%,' + fallbackColor + ' 55%,' + fallbackColor + '88 100%)';
    el.style.boxShadow  = '0 0 16px ' + fallbackColor + '80,0 0 30px ' + fallbackColor + '40';
  } else {
    el.style.background = '#1a1a2e';
    el.style.boxShadow  = '0 0 8px rgba(88,166,255,0.2)';
  }
}

/**
 * Returns CSS preview properties for a skin.
 * Used by marketplace, crates, trades, etc.
 * @returns {{ bg:string, sh:string, an:string } | null}
 */
function getSkinPreview(skinId) {
  const s = _SKIN_CSS[skinId];
  if (!s) return null;
  return { bg: s[0], sh: s[1], an: s[2] || '' };
}

/**
 * Builds a skin preview HTML div with inline styles.
 * Replaces marketplace buildSkinPreview.
 */
function buildSkinPreviewHTML(skinId, className, opts) {
  opts = opts || {};
  var bg, sh, an = '', fi = '';
  var extraClass = '';

  var style = getSkinPreview(skinId);
  if (style) {
    bg = style.bg;
    sh = style.sh;
    an = style.an;
    if (skinId === 'c_singularity') fi = 'brightness(0.3) contrast(3)';
  } else {
    // Fallback
    var c = (opts.skinInfo && opts.skinInfo.color) || (opts.rarity && opts.rarityColor) || '#4a9eff';
    bg = 'radial-gradient(circle at 35% 35%,' + c + 'ee 0%,' + c + ' 55%,' + c + '88 100%)';
    sh = '0 0 16px ' + c + '80';
  }

  // Apply mutation if present
  if (opts.mutation && typeof MUTATION_CONFIG !== 'undefined') {
    var mc = getMutationFilter(skinId, opts.mutation);
    if (mc) {
      if (mc.f) fi = mc.f;
      sh = '0 0 20px ' + mc.g + ',0 0 35px ' + mc.g;
      extraClass = ' mutation-' + opts.mutation;
    }
  }

  var inlineStyle = 'background:' + bg + ';box-shadow:' + sh + ';';
  if (an) inlineStyle += 'animation:' + an + ';';
  if (fi) inlineStyle += 'filter:' + fi + ';';

  return '<div class="' + className + extraClass + '" style="' + inlineStyle + '"></div>';
}

/**
 * Returns a canvas fillStyle (CanvasGradient or string) for in-game rendering.
 * Replaces the old getActiveSkinColor function with gradient support.
 */
function getSkinFill(ctx, skinId, x, y, r, t) {
  // perfMode → flat color
  if (typeof gameSettings !== 'undefined' && gameSettings.perfMode) {
    return getSkinFlatColor(skinId, t);
  }

  // Check for spinning conic gradient
  if (_SPIN[skinId] && _CON[skinId]) {
    var speed = _SPIN[skinId];
    var startAngle = (t / speed) * Math.PI * 2;
    return _cg(ctx, x, y, startAngle, _CON[skinId]);
  }

  // Check static conic
  if (_CON[skinId]) {
    return _cg(ctx, x, y, 0, _CON[skinId]);
  }

  // Check radial gradient (with highlight offset)
  if (_RAD[skinId]) {
    return _rg(ctx, x, y, r, _RAD[skinId]);
  }

  // Check centered radial gradient
  if (_RAD_C[skinId]) {
    return _rg(ctx, x, y, r, _RAD_C[skinId], 0, 0);
  }

  // Check linear gradient
  if (_LIN[skinId]) {
    var data = _LIN[skinId];
    return _lg(ctx, x, y, r, data[0], data.slice(1));
  }

  // Special: repeating linear (flags) — fall back to flat
  if (skinId === 'icon_brody_flag' || skinId === 'icon_profe_spain') {
    return getSkinFlatColor(skinId, t);
  }

  // Fallback: use flat color
  return getSkinFlatColor(skinId, t);
}

/**
 * Returns a flat CSS color string for a skin at time t.
 * Used for perfMode, shadows, strokes.
 */
function getSkinFlatColor(skinId, t) {
  var val = _FLAT[skinId];
  if (typeof val === 'function') return val(t || 0);
  if (typeof val === 'string') return val;
  // Not in map — try SKINS array fallback
  if (typeof SKINS !== 'undefined') {
    var skin = SKINS.find(function(s) { return s.id === skinId; });
    if (skin && skin.color) return skin.color;
  }
  return '#9be7ff';
}

/**
 * Returns glow color for a skin at time t.
 * Used for canvas shadowColor.
 */
function getSkinGlow(skinId, t) {
  var val = _GLOW[skinId];
  if (val) return val;
  // Generate from flat color
  var flat = getSkinFlatColor(skinId, t);
  if (flat && flat.charAt(0) === '#') return flat + '80';
  return flat || 'rgba(155,231,255,0.4)';
}

/**
 * Returns mutation filter override for a skin+mutation combo.
 * @returns {{ f:string, g:string } | null} — cssFilter and glowColor
 */
function getMutationFilter(baseSkinId, mutationType) {
  if (mutationType === 'prismatic') {
    // Prismatic always uses CSS keyframe animation — no static filter
    return { f: null, g: 'rgba(255,255,255,0.9)' };
  }

  // Per-skin override first
  if (_MUT_OVERRIDES[baseSkinId] && _MUT_OVERRIDES[baseSkinId][mutationType]) {
    return _MUT_OVERRIDES[baseSkinId][mutationType];
  }

  // Group default
  var group = _skinGroup(baseSkinId);
  if (_MUT_GROUPS[group] && _MUT_GROUPS[group][mutationType]) {
    return _MUT_GROUPS[group][mutationType];
  }

  // Generic fallback (shouldn't happen — all groups are covered)
  if (typeof MUTATION_CONFIG !== 'undefined' && MUTATION_CONFIG[mutationType]) {
    return { f: MUTATION_CONFIG[mutationType].cssFilter, g: MUTATION_CONFIG[mutationType].glowColor };
  }

  return null;
}

/**
 * Dev-mode validation: logs errors if any skin is missing preview coverage.
 */
function validateSkinCoverage() {
  if (typeof SKINS === 'undefined') return;
  var missing = [];
  for (var i = 0; i < SKINS.length; i++) {
    if (!_SKIN_CSS[SKINS[i].id]) missing.push(SKINS[i].id);
  }
  if (missing.length > 0) {
    console.error('[SKIN AUDIT] Missing CSS preview styles for:', missing.join(', '));
  }
  var missingCanvas = [];
  for (var j = 0; j < SKINS.length; j++) {
    var id = SKINS[j].id;
    if (!_RAD[id] && !_RAD_C[id] && !_LIN[id] && !_CON[id] && !_FLAT[id]) {
      missingCanvas.push(id);
    }
  }
  if (missingCanvas.length > 0) {
    console.warn('[SKIN AUDIT] Missing canvas/flat config for:', missingCanvas.join(', '));
  }
}

// Run validation after all scripts load (dev only)
if (typeof window !== 'undefined') {
  window.addEventListener('load', function() {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      setTimeout(validateSkinCoverage, 1000);
    }
  });
}
