// 2 player local multiplayer - top down shooter
// both players share one keyboard, no mouse

var WIDTH = getWidth();
var HEIGHT = getHeight();

// gameplay values
var PLAYER_R = 14;
var PLAYER_SPD = 250;
var PLAYER_HP = 100;
var DASH_MULT = 6;
var DASH_TIME = 0.15;
var DASH_CD = 3;

var BULLET_R = 5;
var BULLET_SPD = 650;
var FIRE_CD = 0.12;
var BULLET_DMG = 10;
var OFFSCREEN_MARGIN = 50;

var RESPAWN_DELAY = 2;
var FPS = 60;
var DT = 1 / FPS;

// track which keys are held
var keys = {};
var gameState = "settings";
var loopTimer = null;

keyDownMethod(function(e) {
    keys[e.keyCode] = true;
    if (gameState === "settings") onSettingsKey(e.keyCode);
});
keyUpMethod(function(e) {
    keys[e.keyCode] = false;
});

function held(code) {
    return keys[code] === true;
}

// keycodes i need
var W = 87, A = 65, S = 83, D = 68;
var T = 84, F = 70, G = 71, H = 72;
var I = 73, J = 74, K = 75, L = 76;
var Q = 81, M = 77;
var SPACE = 32, ENTER = 13;
var UP = 38, LEFT = 37, DOWN = 40, RIGHT = 39;
var SLASH = 191, PERIOD = 190, RSHIFT = 16;
var K1 = 49, K2 = 50, K5 = 53;


// control presets - each one is [move keys, aim keys, shoot, dash, labels]
var p1Layouts = [
    { mv: [W,A,S,D], aim: [T,F,G,H], fire: SPACE, dash: Q,
      mvName: "WASD", aimName: "TFGH", fireName: "SPACE", dashName: "Q" },
    { mv: [T,F,G,H], aim: [W,A,S,D], fire: SPACE, dash: Q,
      mvName: "TFGH", aimName: "WASD", fireName: "SPACE", dashName: "Q" }
];

var p2Layouts = [
    { mv: [UP,LEFT,DOWN,RIGHT], aim: [I,J,K,L], fire: SLASH, dash: M,
      mvName: "Arrows", aimName: "IJKL", fireName: "/", dashName: "M" },
    { mv: [I,J,K,L], aim: [UP,LEFT,DOWN,RIGHT], fire: SLASH, dash: M,
      mvName: "IJKL", aimName: "Arrows", fireName: "/", dashName: "M" },
    { mv: [UP,LEFT,DOWN,RIGHT], aim: [I,J,K,L], fire: PERIOD, dash: M,
      mvName: "Arrows", aimName: "IJKL", fireName: ".", dashName: "M" },
    { mv: [I,J,K,L], aim: [UP,LEFT,DOWN,RIGHT], fire: PERIOD, dash: M,
      mvName: "IJKL", aimName: "Arrows", fireName: ".", dashName: "M" },
    { mv: [UP,LEFT,DOWN,RIGHT], aim: [I,J,K,L], fire: RSHIFT, dash: M,
      mvName: "Arrows", aimName: "IJKL", fireName: "R-SHIFT", dashName: "M" },
    { mv: [I,J,K,L], aim: [UP,LEFT,DOWN,RIGHT], fire: RSHIFT, dash: M,
      mvName: "IJKL", aimName: "Arrows", fireName: "R-SHIFT", dashName: "M" }
];

var p1Pick = 0;
var p2Pick = 0;


// ---------- settings screen ----------

function showSettings() {
    removeAll();

    var bg = new Rectangle(WIDTH, HEIGHT);
    bg.setPosition(0, 0);
    bg.setColor("#0d1525");
    add(bg);

    var title = new Text("2-PLAYER SETUP", "bold 20pt Arial");
    title.setPosition(WIDTH / 2 - 115, 45);
    title.setColor("#ffffff");
    add(title);

    var hint = new Text("pick your controls, then press 5 to play", "11pt Arial");
    hint.setPosition(WIDTH / 2 - 140, 68);
    hint.setColor("#666666");
    add(hint);

    // p1 section
    var lay1 = p1Layouts[p1Pick];
    drawLabel(WIDTH / 2 - 150, 100, "PLAYER 1", "#4dc9f6");
    drawControlLine(WIDTH / 2 - 140, 128, "Move:  " + lay1.mvName);
    drawControlLine(WIDTH / 2 - 140, 148, "Aim:   " + lay1.aimName);
    drawControlLine(WIDTH / 2 - 140, 168, "Shoot: " + lay1.fireName);
    drawControlLine(WIDTH / 2 - 140, 188, "Dash:  " + lay1.dashName);

    var swap1 = new Text("[1] swap move/aim", "10pt Arial");
    swap1.setPosition(WIDTH / 2 - 140, 212);
    swap1.setColor("#4dc9f6");
    add(swap1);

    // divider
    var line = new Line(WIDTH / 2 - 160, 230, WIDTH / 2 + 160, 230);
    line.setColor("#1a3050");
    add(line);

    // p2 section
    var lay2 = p2Layouts[p2Pick];
    drawLabel(WIDTH / 2 - 150, 255, "PLAYER 2", "#f67280");
    drawControlLine(WIDTH / 2 - 140, 283, "Move:  " + lay2.mvName);
    drawControlLine(WIDTH / 2 - 140, 303, "Aim:   " + lay2.aimName);
    drawControlLine(WIDTH / 2 - 140, 323, "Shoot: " + lay2.fireName);
    drawControlLine(WIDTH / 2 - 140, 343, "Dash:  " + lay2.dashName);

    var swap2 = new Text("[2] cycle layout", "10pt Arial");
    swap2.setPosition(WIDTH / 2 - 140, 367);
    swap2.setColor("#f67280");
    add(swap2);

    // start button at the very bottom with plenty of room
    var btnY = HEIGHT - 40;
    var startTxt = new Text("[ 5 ] START", "bold 15pt Arial");
    startTxt.setPosition(WIDTH / 2 - 55, btnY);
    startTxt.setColor("#44ff44");
    add(startTxt);
}

function drawLabel(x, y, text, color) {
    var dot = new Circle(6);
    dot.setPosition(x - 14, y - 5);
    dot.setColor(color);
    add(dot);
    var lbl = new Text(text, "bold 14pt Arial");
    lbl.setPosition(x, y);
    lbl.setColor(color);
    add(lbl);
}

function drawControlLine(x, y, text) {
    var t = new Text(text, "12pt Arial");
    t.setPosition(x, y);
    t.setColor("#bbbbbb");
    add(t);
}

function onSettingsKey(code) {
    if (code === K1) {
        p1Pick = (p1Pick + 1) % p1Layouts.length;
        showSettings();
    } else if (code === K2) {
        p2Pick = (p2Pick + 1) % p2Layouts.length;
        showSettings();
    } else if (code === K5) {
        beginGame();
    }
}


// ---------- math stuff ----------

function norm(x, y) {
    var len = Math.sqrt(x * x + y * y);
    if (len === 0) return {x: 0, y: 0};
    return {x: x / len, y: y / len};
}

function distSquared(x1, y1, x2, y2) {
    var dx = x1 - x2;
    var dy = y1 - y2;
    return dx * dx + dy * dy;
}


// ---------- input reading ----------

function getInput(mvKeys, aimKeys, fireKey, dashKey) {
    var mx = 0, my = 0;
    if (held(mvKeys[0])) my = -1;
    if (held(mvKeys[1])) mx = -1;
    if (held(mvKeys[2])) my = 1;
    if (held(mvKeys[3])) mx = 1;

    var ax = 0, ay = 0;
    if (held(aimKeys[0])) ay = -1;
    if (held(aimKeys[1])) ax = -1;
    if (held(aimKeys[2])) ay = 1;
    if (held(aimKeys[3])) ax = 1;

    return {
        mx: mx, my: my,
        ax: ax, ay: ay,
        shoot: held(fireKey),
        dash: held(dashKey)
    };
}


// ---------- player ----------

function makePlayer(x, y, col, tag) {
    return {
        x: x, y: y,
        r: PLAYER_R,
        speed: PLAYER_SPD,
        hp: PLAYER_HP,
        maxHp: PLAYER_HP,
        col: col,
        tag: tag,
        cd: 0,
        aimX: 0, aimY: -1,
        dashCD: 0, dashTimer: 0,
        dashDX: 0, dashDY: 0,
        kills: 0,
        dead: false,
        respawn: 0
    };
}

function tickPlayer(p, inp) {
    // waiting to respawn
    if (p.dead) {
        p.respawn -= DT;
        if (p.respawn <= 0) {
            p.dead = false;
            p.hp = p.maxHp;
            p.x = WIDTH * 0.2 + Math.random() * WIDTH * 0.6;
            p.y = HEIGHT * 0.2 + Math.random() * HEIGHT * 0.6;
        }
        return;
    }

    // tick cooldowns
    if (p.cd > 0) p.cd -= DT;
    if (p.dashCD > 0) p.dashCD -= DT;

    // start a dash
    if (inp.dash && p.dashCD <= 0 && p.dashTimer <= 0) {
        if (inp.mx !== 0 || inp.my !== 0) {
            var d = norm(inp.mx, inp.my);
            p.dashDX = d.x;
            p.dashDY = d.y;
            p.dashTimer = DASH_TIME;
            p.dashCD = DASH_CD;
        }
    }

    // move
    if (p.dashTimer > 0) {
        p.dashTimer -= DT;
        p.x += p.dashDX * p.speed * DASH_MULT * DT;
        p.y += p.dashDY * p.speed * DASH_MULT * DT;
    } else if (inp.mx !== 0 || inp.my !== 0) {
        var dir = norm(inp.mx, inp.my);
        p.x += dir.x * p.speed * DT;
        p.y += dir.y * p.speed * DT;
    }

    // stay in bounds
    if (p.x < p.r) p.x = p.r;
    if (p.x > WIDTH - p.r) p.x = WIDTH - p.r;
    if (p.y < p.r) p.y = p.r;
    if (p.y > HEIGHT - p.r) p.y = HEIGHT - p.r;

    // aim
    if (inp.ax !== 0 || inp.ay !== 0) {
        var a = norm(inp.ax, inp.ay);
        p.aimX = a.x;
        p.aimY = a.y;
    }

    // shoot
    if (inp.shoot && p.cd <= 0) {
        p.cd = FIRE_CD;
        shoot(p);
    }
}


// ---------- bullets ----------

var bullets = [];

function shoot(p) {
    var spawnDist = p.r + BULLET_R + 2;
    bullets.push({
        x: p.x + p.aimX * spawnDist,
        y: p.y + p.aimY * spawnDist,
        vx: p.aimX * BULLET_SPD,
        vy: p.aimY * BULLET_SPD,
        r: BULLET_R,
        who: p,
        col: p.col
    });
}

function tickBullets() {
    for (var i = bullets.length - 1; i >= 0; i--) {
        var b = bullets[i];
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        // kill bullets that left the screen
        if (b.x < -OFFSCREEN_MARGIN || b.x > WIDTH + OFFSCREEN_MARGIN ||
            b.y < -OFFSCREEN_MARGIN || b.y > HEIGHT + OFFSCREEN_MARGIN) {
            bullets.splice(i, 1);
        }
    }
}


// ---------- collisions ----------

function checkHits(p1, p2) {
    // bullet vs player
    for (var i = bullets.length - 1; i >= 0; i--) {
        var b = bullets[i];
        var guys = [p1, p2];
        for (var j = 0; j < 2; j++) {
            var tgt = guys[j];
            if (tgt.dead || b.who === tgt) continue;

            var rr = b.r + tgt.r;
            if (distSquared(b.x, b.y, tgt.x, tgt.y) < rr * rr) {
                tgt.hp -= BULLET_DMG;
                // little knockback
                var push = norm(tgt.x - b.x, tgt.y - b.y);
                tgt.x += push.x * 3;
                tgt.y += push.y * 3;
                // remove bullet
                bullets.splice(i, 1);
                // check kill
                if (tgt.hp <= 0) {
                    tgt.dead = true;
                    tgt.respawn = RESPAWN_DELAY;
                    b.who.kills++;
                }
                break;
            }
        }
    }

    // push players apart if overlapping
    if (!p1.dead && !p2.dead) {
        var rr = p1.r + p2.r;
        var dd = distSquared(p1.x, p1.y, p2.x, p2.y);
        if (dd < rr * rr && dd > 0) {
            var dist = Math.sqrt(dd);
            var push = (rr - dist) / 2;
            var nx = (p1.x - p2.x) / dist;
            var ny = (p1.y - p2.y) / dist;
            p1.x += nx * push;
            p1.y += ny * push;
            p2.x -= nx * push;
            p2.y -= ny * push;
        }
    }
}


// ---------- drawing ----------

function draw(p1, p2) {
    removeAll();

    // bg
    var bg = new Rectangle(WIDTH, HEIGHT);
    bg.setPosition(0, 0);
    bg.setColor("#0d1525");
    add(bg);

    // arena edge
    var edge = new Rectangle(WIDTH - 8, HEIGHT - 8);
    edge.setPosition(4, 4);
    edge.setColor("#0d1525");
    edge.setBorderColor("#1a3050");
    edge.setBorderWidth(2);
    add(edge);

    // midline
    var mid = new Line(WIDTH / 2, 20, WIDTH / 2, HEIGHT - 20);
    mid.setColor("#1a3050");
    add(mid);

    // bullets
    for (var i = 0; i < bullets.length; i++) {
        var b = bullets[i];
        var dot = new Circle(b.r);
        dot.setPosition(b.x, b.y);
        dot.setColor(b.col);
        add(dot);
    }

    // players
    drawGuy(p1);
    drawGuy(p2);

    // scores + controls
    drawHud(p1, p2);
}

function drawGuy(p) {
    if (p.dead) {
        // grey x mark and countdown
        var ghost = new Circle(p.r * 0.5);
        ghost.setPosition(p.x, p.y);
        ghost.setColor("#333");
        add(ghost);
        var timer = new Text(Math.ceil(p.respawn) + "", "14pt Arial");
        timer.setPosition(p.x - 5, p.y + 5);
        timer.setColor("#888");
        add(timer);
        return;
    }

    // body
    var circle = new Circle(p.r);
    circle.setPosition(p.x, p.y);
    circle.setColor(p.col);
    add(circle);

    // aim line
    var len = p.r + 12;
    var gun = new Line(p.x, p.y, p.x + p.aimX * len, p.y + p.aimY * len);
    gun.setColor("#fff");
    gun.setLineWidth(2);
    add(gun);

    // hp bar
    var barW = 30;
    var barX = p.x - barW / 2;
    var barY = p.y - p.r - 10;

    var barBg = new Rectangle(barW, 4);
    barBg.setPosition(barX, barY);
    barBg.setColor("#333");
    add(barBg);

    var pct = p.hp / p.maxHp;
    var fillW = Math.max(0, pct * barW);
    if (fillW > 0) {
        var barFill = new Rectangle(fillW, 4);
        barFill.setPosition(barX, barY);
        // green > yellow > red
        var barCol = "#44ff44";
        if (p.hp <= 25) barCol = "#ff4444";
        else if (p.hp <= 50) barCol = "#ffaa00";
        barFill.setColor(barCol);
        add(barFill);
    }

    // dash ready dot
    if (p.dashCD <= 0) {
        var ready = new Circle(3);
        ready.setPosition(p.x, p.y + p.r + 8);
        ready.setColor("#0ff");
        add(ready);
    }

    // name
    var name = new Text(p.tag, "10pt Arial");
    name.setPosition(p.x - 8, p.y - p.r - 16);
    name.setColor("#aaa");
    add(name);
}

function drawHud(p1, p2) {
    var c1 = p1Layouts[p1Pick];
    var c2 = p2Layouts[p2Pick];

    // p1 top left
    var k1 = new Text("P1: " + p1.kills + " kills", "15pt Arial");
    k1.setPosition(15, 28);
    k1.setColor(p1.col);
    add(k1);
    var hp1 = new Text("HP " + Math.max(0, p1.hp), "11pt Arial");
    hp1.setPosition(15, 46);
    hp1.setColor("#aaa");
    add(hp1);

    // p2 top right
    var k2 = new Text("P2: " + p2.kills + " kills", "15pt Arial");
    k2.setPosition(WIDTH - 130, 28);
    k2.setColor(p2.col);
    add(k2);
    var hp2 = new Text("HP " + Math.max(0, p2.hp), "11pt Arial");
    hp2.setPosition(WIDTH - 130, 46);
    hp2.setColor("#aaa");
    add(hp2);

    // controls at bottom
    var t1 = new Text("P1: " + c1.mvName + " move | " + c1.aimName + " aim | " + c1.fireName + " shoot | " + c1.dashName + " dash", "9pt Arial");
    t1.setPosition(10, HEIGHT - 22);
    t1.setColor("#555");
    add(t1);

    var t2 = new Text("P2: " + c2.mvName + " move | " + c2.aimName + " aim | " + c2.fireName + " shoot | " + c2.dashName + " dash", "9pt Arial");
    t2.setPosition(10, HEIGHT - 8);
    t2.setColor("#555");
    add(t2);
}


// ---------- game loop ----------

var player1, player2;

function beginGame() {
    gameState = "playing";

    player1 = makePlayer(WIDTH * 0.25, HEIGHT / 2, "#4dc9f6", "P1");
    player1.aimX = 1;

    player2 = makePlayer(WIDTH * 0.75, HEIGHT / 2, "#f67280", "P2");
    player2.aimX = -1;

    bullets = [];
    loopTimer = setTimer(tick, 1000 / FPS);
}

function tick() {
    var c1 = p1Layouts[p1Pick];
    var c2 = p2Layouts[p2Pick];

    var in1 = getInput(c1.mv, c1.aim, c1.fire, c1.dash);
    var in2 = getInput(c2.mv, c2.aim, c2.fire, c2.dash);

    tickPlayer(player1, in1);
    tickPlayer(player2, in2);
    tickBullets();
    checkHits(player1, player2);

    draw(player1, player2);
}

// show settings first
showSettings();
