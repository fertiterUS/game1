(function () {
const Phaser = window.Phaser;

const GAME_TITLE = 'game1';
const TILE_SIZE = 16;
const MAP_WIDTH = 74;
const MAP_HEIGHT = 48;
const ROOM_ATTEMPTS = 95;
const MIN_ROOM = 5;
const MAX_ROOM = 12;

const FRAMES = {
  wall: [24, 25, 26, 27, 28, 29, 40, 41],
  floor: [36, 37, 38, 48, 49, 50],
  exit: 46,
  player: 84,
  npc: 85,
  gold: 0,
  potion: 113,
  blade: 127,
  enemies: [108, 110, 111, 120, 121]
};

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

function keyFor(x, y) {
  return `${x},${y}`;
}

function centerOf(room) {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2)
  };
}

function choose(list, rng) {
  return list[Math.floor(rng.frac() * list.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

class RogueScene extends Phaser.Scene {
  constructor() {
    super('RogueScene');
    this.floorNumber = 1;
    this.turn = 0;
    this.acceptInput = true;
    this.isOver = false;
    this.hasActiveRun = false;
    this.gameState = 'menu';
  }

  create() {
    this.registerSpritesheet();
    this.cameras.main.setZoom(2.5);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#151a18');

    this.tileLayer = null;
    this.hutLayer = null;
    this.npc = null;
    this.npcSprite = null;
    this.dialogTimer = null;
    this.enemySprites = new Map();
    this.itemSprites = new Map();
    this.messageQueue = [];
    this.resetPlayer();
    this.bindDomUi();
    this.bindKeys();
    this.setUiMode('menu');
    this.updateHud();
  }

  registerSpritesheet() {
    if (this.textures.exists('tiny-dungeon')) {
      return;
    }

    const source = document.getElementById('tiny-dungeon-image');
    this.textures.addSpriteSheet('tiny-dungeon', source, {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE
    });
  }

  bindDomUi() {
    this.ui = {
      root: document.getElementById('ui-root'),
      startMenu: document.getElementById('start-menu'),
      pauseMenu: document.getElementById('pause-menu'),
      gameOverMenu: document.getElementById('game-over-menu'),
      hud: document.getElementById('game-hud'),
      startButton: document.getElementById('start-button'),
      resumeButton: document.getElementById('resume-button'),
      pauseButton: document.getElementById('pause-button'),
      resumePauseButton: document.getElementById('resume-pause-button'),
      restartPauseButton: document.getElementById('restart-pause-button'),
      mainMenuButton: document.getElementById('main-menu-button'),
      restartGameOverButton: document.getElementById('restart-gameover-button'),
      gameOverMenuButton: document.getElementById('gameover-menu-button'),
      hpLabel: document.getElementById('hp-label'),
      hpFill: document.getElementById('hp-fill'),
      depthValue: document.getElementById('depth-value'),
      attackValue: document.getElementById('attack-value'),
      goldValue: document.getElementById('gold-value'),
      enemyValue: document.getElementById('enemy-value'),
      messageLog: document.getElementById('message-log'),
      dialogBox: document.getElementById('dialog-box'),
      dialogSpeaker: document.getElementById('dialog-speaker'),
      dialogText: document.getElementById('dialog-text'),
      minimap: document.getElementById('minimap'),
      npcPrompt: document.getElementById('npc-prompt'),
      bestDepth: document.getElementById('best-depth'),
      bestGold: document.getElementById('best-gold'),
      finalDepth: document.getElementById('final-depth'),
      finalGold: document.getElementById('final-gold'),
      finalTurns: document.getElementById('final-turns')
    };

    this.ui.startButton.addEventListener('click', () => this.beginRun());
    this.ui.resumeButton.addEventListener('click', () => this.resumeRun());
    this.ui.pauseButton.addEventListener('click', () => this.pauseRun());
    this.ui.resumePauseButton.addEventListener('click', () => this.resumeRun());
    this.ui.restartPauseButton.addEventListener('click', () => this.beginRun());
    this.ui.mainMenuButton.addEventListener('click', () => this.openMainMenu());
    this.ui.restartGameOverButton.addEventListener('click', () => this.beginRun());
    this.ui.gameOverMenuButton.addEventListener('click', () => this.openMainMenu());

    this.updateRecordUi();
  }

  resetPlayer() {
    this.player = {
      x: 0,
      y: 0,
      hp: 14,
      maxHp: 14,
      attack: 3,
      gold: 0
    };
  }

  beginRun() {
    this.resetPlayer();
    this.hasActiveRun = true;
    this.isOver = false;
    this.gameState = 'playing';
    this.startFloor(1);
    this.setUiMode('playing');
  }

  pauseRun() {
    if (!this.hasActiveRun || this.isOver || this.gameState !== 'playing') {
      return;
    }

    this.gameState = 'paused';
    this.acceptInput = false;
    this.setUiMode('paused');
  }

  resumeRun() {
    if (!this.hasActiveRun || this.isOver) {
      return;
    }

    this.gameState = 'playing';
    this.acceptInput = true;
    this.setUiMode('playing');
  }

  openMainMenu() {
    this.gameState = 'menu';
    this.acceptInput = false;
    this.setUiMode('menu');
  }

  setUiMode(mode) {
    if (!this.ui) {
      return;
    }

    this.ui.root.dataset.mode = mode;
    this.ui.startMenu.classList.toggle('is-active', mode === 'menu');
    this.ui.pauseMenu.classList.toggle('is-active', mode === 'paused');
    this.ui.gameOverMenu.classList.toggle('is-active', mode === 'gameover');
    this.ui.hud.classList.toggle('is-hidden', mode === 'menu');
    this.ui.resumeButton.disabled = !this.hasActiveRun || this.isOver;
    this.ui.npcPrompt.classList.toggle('is-hidden', mode !== 'playing' || !this.canTalkToNpc());

    if (mode !== 'playing') {
      this.hideDialog();
    }
  }

  readRecord() {
    try {
      return JSON.parse(window.localStorage.getItem(`${GAME_TITLE}-record`)) || { depth: 0, gold: 0 };
    } catch (_error) {
      return { depth: 0, gold: 0 };
    }
  }

  writeRecord(record) {
    try {
      window.localStorage.setItem(`${GAME_TITLE}-record`, JSON.stringify(record));
    } catch (_error) {
      return;
    }
  }

  updateRecordUi() {
    if (!this.ui) {
      return;
    }

    const record = this.readRecord();
    this.ui.bestDepth.textContent = String(record.depth || 0);
    this.ui.bestGold.textContent = String(record.gold || 0);
  }

  saveRecord() {
    const record = this.readRecord();
    const nextRecord = {
      depth: Math.max(record.depth || 0, this.floorNumber),
      gold: Math.max(record.gold || 0, this.player.gold)
    };
    this.writeRecord(nextRecord);
    this.updateRecordUi();
  }

  bindKeys() {
    this.input.keyboard.on('keydown', (event) => {
      if (event.repeat) {
        return;
      }

      if (event.key === 'Escape') {
        if (this.gameState === 'playing') {
          this.pauseRun();
        } else if (this.gameState === 'paused') {
          this.resumeRun();
        }
        return;
      }

      if (event.key === 'Enter') {
        if (this.gameState === 'menu' || this.gameState === 'gameover') {
          this.beginRun();
        } else if (this.gameState === 'paused') {
          this.resumeRun();
        }
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        this.beginRun();
        return;
      }

      if (this.gameState !== 'playing') {
        return;
      }

      if (event.key.toLowerCase() === 'e') {
        this.interactNpc();
        return;
      }

      if (event.key === ' ' || event.key.toLowerCase() === 'f') {
        this.attackNearestEnemy();
        return;
      }

      const direction = this.keyToDirection(event.key);
      if (direction) {
        this.tryMovePlayer(direction.x, direction.y);
      }
    });
  }

  keyToDirection(key) {
    const lower = key.toLowerCase();

    if (key === 'ArrowLeft' || lower === 'a') return { x: -1, y: 0 };
    if (key === 'ArrowRight' || lower === 'd') return { x: 1, y: 0 };
    if (key === 'ArrowUp' || lower === 'w') return { x: 0, y: -1 };
    if (key === 'ArrowDown' || lower === 's') return { x: 0, y: 1 };

    return null;
  }

  startFloor(nextFloor) {
    this.floorNumber = nextFloor;
    this.isOver = false;
    this.gameState = 'playing';
    this.acceptInput = true;
    this.messageQueue.length = 0;
    this.seed = `${Date.now()}-${this.floorNumber}`;
    this.rng = new Phaser.Math.RandomDataGenerator([this.seed]);

    const generated = this.generateDungeon();
    this.grid = generated.grid;
    this.rooms = generated.rooms;
    this.exit = generated.exit;
    this.hut = generated.hut;
    this.turn = 0;

    this.player.x = generated.start.x;
    this.player.y = generated.start.y;
    this.npc = this.placeNpc(this.hut, generated.start);
    this.enemies = this.spawnEnemies();
    this.items = this.spawnItems();

    this.drawDungeon();
    this.drawActors();
    this.drawItems();
    this.updateHud();
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.startFollow(this.playerSprite, true, 0.14, 0.14);
    this.flashMessage(`Depth ${this.floorNumber}`);
  }

  generateDungeon() {
    const grid = Array.from({ length: MAP_HEIGHT }, () =>
      Array.from({ length: MAP_WIDTH }, () => ({
        solid: true,
        floorFrame: choose(FRAMES.floor, this.rng),
        wallFrame: choose(FRAMES.wall, this.rng)
      }))
    );

    const rooms = [];

    for (let i = 0; i < ROOM_ATTEMPTS; i += 1) {
      const w = this.rng.between(MIN_ROOM, MAX_ROOM);
      const h = this.rng.between(MIN_ROOM, MAX_ROOM);
      const x = this.rng.between(2, MAP_WIDTH - w - 3);
      const y = this.rng.between(4, MAP_HEIGHT - h - 3);
      const room = { x, y, w, h };

      if (rooms.some((other) => this.roomsOverlap(room, other))) {
        continue;
      }

      this.carveRoom(grid, room);

      if (rooms.length > 0) {
        this.carveCorridor(grid, centerOf(rooms[rooms.length - 1]), centerOf(room));
      }

      rooms.push(room);
    }

    if (rooms.length < 4) {
      return this.generateDungeon();
    }

    const start = centerOf(rooms[0]);
    const exit = centerOf(rooms[rooms.length - 1]);
    grid[exit.y][exit.x].solid = false;
    const hut = this.prepareStarterHut(grid, rooms[0], start);

    return { grid, rooms, start, exit, hut };
  }

  prepareStarterHut(grid, room, start) {
    const w = Math.max(5, Math.min(9, room.w));
    const h = Math.max(5, Math.min(7, room.h));
    const x = clamp(start.x - Math.floor(w / 2), room.x, room.x + room.w - w);
    const y = clamp(start.y - Math.floor(h / 2), room.y, room.y + room.h - h);
    const hut = { x, y, w, h };

    for (let ty = y; ty < y + h; ty += 1) {
      for (let tx = x; tx < x + w; tx += 1) {
        grid[ty][tx].solid = false;
        grid[ty][tx].zone = 'hut';
      }
    }

    return hut;
  }

  placeNpc(hut, start) {
    const spots = [
      { x: start.x + 1, y: start.y },
      { x: start.x, y: start.y + 1 },
      { x: start.x - 1, y: start.y },
      { x: start.x, y: start.y - 1 }
    ];
    const spot =
      spots.find((candidate) => this.isInsideHut(candidate.x, candidate.y, hut) && !this.isSolid(candidate.x, candidate.y)) ||
      { x: hut.x + hut.w - 2, y: hut.y + 1 };

    return {
      x: spot.x,
      y: spot.y,
      frame: FRAMES.npc,
      gifted: false,
      talks: 0
    };
  }

  isInsideHut(x, y, hut = this.hut) {
    return Boolean(hut && x >= hut.x && y >= hut.y && x < hut.x + hut.w && y < hut.y + hut.h);
  }

  roomsOverlap(a, b) {
    return (
      a.x < b.x + b.w + 2 &&
      a.x + a.w + 2 > b.x &&
      a.y < b.y + b.h + 2 &&
      a.y + a.h + 2 > b.y
    );
  }

  carveRoom(grid, room) {
    for (let y = room.y; y < room.y + room.h; y += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) {
        grid[y][x].solid = false;
      }
    }
  }

  carveCorridor(grid, from, to) {
    let x = from.x;
    let y = from.y;
    const horizontalFirst = this.rng.frac() > 0.5;

    const stepX = () => {
      while (x !== to.x) {
        grid[y][x].solid = false;
        x += Math.sign(to.x - x);
      }
    };

    const stepY = () => {
      while (y !== to.y) {
        grid[y][x].solid = false;
        y += Math.sign(to.y - y);
      }
    };

    if (horizontalFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }

    grid[to.y][to.x].solid = false;
  }

  drawDungeon() {
    if (this.tileLayer) {
      this.tileLayer.destroy();
    }
    if (this.hutLayer) {
      this.hutLayer.destroy();
    }

    this.tileLayer = this.add
      .renderTexture(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE)
      .setOrigin(0)
      .setDepth(0);

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const tile = this.grid[y][x];
        const frame = tile.solid ? tile.wallFrame : tile.floorFrame;
        this.tileLayer.drawFrame('tiny-dungeon', frame, x * TILE_SIZE, y * TILE_SIZE);

        if (!tile.solid && this.rng.frac() < 0.035) {
          this.tileLayer.drawFrame(
            'tiny-dungeon',
            choose([4, 5, 55, 56, 60, 61], this.rng),
            x * TILE_SIZE,
            y * TILE_SIZE
          );
        }
      }
    }

    this.tileLayer.drawFrame(
      'tiny-dungeon',
      FRAMES.exit,
      this.exit.x * TILE_SIZE,
      this.exit.y * TILE_SIZE
    );

    this.drawStarterHut();
  }

  drawStarterHut() {
    if (!this.hut) {
      return;
    }

    const { x, y, w, h } = this.hut;
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const width = w * TILE_SIZE;
    const height = h * TILE_SIZE;

    this.hutLayer = this.add.graphics().setDepth(4);
    this.hutLayer.fillStyle(0x8a654c, 0.36);
    this.hutLayer.fillRect(px, py, width, height);
    this.hutLayer.lineStyle(2, 0x2b2428, 0.86);
    this.hutLayer.strokeRect(px + 1, py + 1, width - 2, height - 2);
    this.hutLayer.lineStyle(1, 0xc49b68, 0.28);

    for (let plankY = py + 8; plankY < py + height; plankY += 8) {
      this.hutLayer.lineBetween(px + 3, plankY, px + width - 4, plankY);
    }

    this.hutLayer.fillStyle(0xe5cf78, 0.22);
    this.hutLayer.fillRect(px + 4, py + 4, width - 8, 3);
  }

  drawActors() {
    if (this.playerSprite) {
      this.playerSprite.destroy();
    }
    if (this.npcSprite) {
      this.npcSprite.destroy();
    }

    for (const sprite of this.enemySprites.values()) {
      sprite.destroy();
    }
    this.enemySprites.clear();

    this.playerSprite = this.add
      .sprite(this.player.x * TILE_SIZE + 8, this.player.y * TILE_SIZE + 8, 'tiny-dungeon', FRAMES.player)
      .setDepth(30);

    if (this.npc) {
      this.npcSprite = this.add
        .sprite(this.npc.x * TILE_SIZE + 8, this.npc.y * TILE_SIZE + 8, 'tiny-dungeon', this.npc.frame)
        .setDepth(28);
      this.npcSprite.setTint(0xc9dbcb);
    }

    for (const enemy of this.enemies) {
      const sprite = this.add
        .sprite(enemy.x * TILE_SIZE + 8, enemy.y * TILE_SIZE + 8, 'tiny-dungeon', enemy.frame)
        .setDepth(25);
      this.enemySprites.set(enemy.id, sprite);
    }
  }

  drawItems() {
    for (const sprite of this.itemSprites.values()) {
      sprite.destroy();
    }
    this.itemSprites.clear();

    for (const item of this.items) {
      const sprite = this.add
        .sprite(item.x * TILE_SIZE + 8, item.y * TILE_SIZE + 8, 'tiny-dungeon', item.frame)
        .setDepth(15);
      this.itemSprites.set(item.id, sprite);
    }
  }

  spawnEnemies() {
    const enemies = [];
    const targetCount = clamp(6 + this.floorNumber * 2, 8, 22);
    const blocked = new Set([keyFor(this.player.x, this.player.y), keyFor(this.exit.x, this.exit.y)]);

    if (this.npc) {
      blocked.add(keyFor(this.npc.x, this.npc.y));
    }

    for (let i = 0; i < targetCount; i += 1) {
      const spot = this.randomFreeSpot(blocked, 7);
      if (!spot) {
        continue;
      }

      blocked.add(keyFor(spot.x, spot.y));
      enemies.push({
        id: `enemy-${this.floorNumber}-${i}-${this.rng.uuid()}`,
        x: spot.x,
        y: spot.y,
        hp: 3 + Math.floor(this.floorNumber * 0.75),
        attack: 1 + Math.floor(this.floorNumber / 4),
        frame: choose(FRAMES.enemies, this.rng)
      });
    }

    return enemies;
  }

  spawnItems() {
    const items = [];
    const blocked = new Set([
      keyFor(this.player.x, this.player.y),
      keyFor(this.exit.x, this.exit.y),
      this.npc ? keyFor(this.npc.x, this.npc.y) : null,
      ...this.enemies.map((enemy) => keyFor(enemy.x, enemy.y))
    ].filter(Boolean));
    const goldCount = clamp(5 + this.floorNumber, 6, 18);

    for (let i = 0; i < goldCount; i += 1) {
      const spot = this.randomFreeSpot(blocked, 3);
      if (spot) {
        blocked.add(keyFor(spot.x, spot.y));
        items.push({
          id: `gold-${this.floorNumber}-${i}-${this.rng.uuid()}`,
          type: 'gold',
          frame: FRAMES.gold,
          amount: this.rng.between(1, 6 + this.floorNumber),
          ...spot
        });
      }
    }

    for (let i = 0; i < 2; i += 1) {
      const spot = this.randomFreeSpot(blocked, 3);
      if (spot) {
        blocked.add(keyFor(spot.x, spot.y));
        items.push({
          id: `potion-${this.floorNumber}-${i}-${this.rng.uuid()}`,
          type: 'potion',
          frame: FRAMES.potion,
          amount: 5,
          ...spot
        });
      }
    }

    if (this.floorNumber % 2 === 0) {
      const spot = this.randomFreeSpot(blocked, 4);
      if (spot) {
        items.push({
          id: `blade-${this.floorNumber}-${this.rng.uuid()}`,
          type: 'blade',
          frame: FRAMES.blade,
          amount: 1,
          ...spot
        });
      }
    }

    return items;
  }

  randomFreeSpot(blocked, minDistanceFromPlayer) {
    for (let attempts = 0; attempts < 400; attempts += 1) {
      const room = choose(this.rooms, this.rng);
      const x = this.rng.between(room.x + 1, room.x + room.w - 2);
      const y = this.rng.between(room.y + 1, room.y + room.h - 2);

      if (
        !this.isSolid(x, y) &&
        this.grid[y][x].zone !== 'hut' &&
        !blocked.has(keyFor(x, y)) &&
        distance({ x, y }, this.player) >= minDistanceFromPlayer
      ) {
        return { x, y };
      }
    }

    return null;
  }

  tryMovePlayer(dx, dy) {
    if (this.gameState !== 'playing' || !this.acceptInput || this.isOver) {
      return;
    }

    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (this.isSolid(nx, ny)) {
      this.bump(this.playerSprite, dx, dy);
      return;
    }

    if (this.npcAt(nx, ny)) {
      this.interactNpc();
      return;
    }

    const enemy = this.enemyAt(nx, ny);
    if (enemy) {
      this.damageEnemy(enemy, this.player.attack);
      this.takeTurn();
      return;
    }

    this.player.x = nx;
    this.player.y = ny;
    this.moveSprite(this.playerSprite, nx, ny);
    this.pickupAt(nx, ny);

    if (nx === this.exit.x && ny === this.exit.y) {
      this.player.hp = clamp(this.player.hp + 2, 1, this.player.maxHp);
      this.startFloor(this.floorNumber + 1);
      return;
    }

    this.takeTurn();
  }

  attackNearestEnemy() {
    if (this.gameState !== 'playing' || !this.acceptInput || this.isOver) {
      return;
    }

    const enemy = this.enemies
      .filter((target) => distance(target, this.player) === 1)
      .sort((a, b) => a.hp - b.hp)[0];

    if (!enemy) {
      return;
    }

    this.damageEnemy(enemy, this.player.attack + 1);
    this.takeTurn();
  }

  takeTurn() {
    this.turn += 1;
    this.enemyTurn();
    this.updateHud();
  }

  enemyTurn() {
    const occupied = new Set(this.enemies.map((enemy) => keyFor(enemy.x, enemy.y)));

    if (this.npc) {
      occupied.add(keyFor(this.npc.x, this.npc.y));
    }

    for (const enemy of [...this.enemies]) {
      if (!this.enemies.includes(enemy)) {
        continue;
      }

      occupied.delete(keyFor(enemy.x, enemy.y));

      if (distance(enemy, this.player) === 1) {
        this.damagePlayer(enemy.attack);
        occupied.add(keyFor(enemy.x, enemy.y));
        continue;
      }

      const canSmellPlayer = distance(enemy, this.player) < 11;
      const options = canSmellPlayer ? this.preferredSteps(enemy) : Phaser.Utils.Array.Shuffle([...DIRS]);

      for (const dir of options) {
        const nx = enemy.x + dir.x;
        const ny = enemy.y + dir.y;

        if (
          this.isSolid(nx, ny) ||
          occupied.has(keyFor(nx, ny)) ||
          (nx === this.player.x && ny === this.player.y)
        ) {
          continue;
        }

        enemy.x = nx;
        enemy.y = ny;
        occupied.add(keyFor(nx, ny));
        this.moveSprite(this.enemySprites.get(enemy.id), nx, ny);
        break;
      }
    }
  }

  preferredSteps(enemy) {
    return [...DIRS].sort((a, b) => {
      const da = distance({ x: enemy.x + a.x, y: enemy.y + a.y }, this.player);
      const db = distance({ x: enemy.x + b.x, y: enemy.y + b.y }, this.player);
      return da - db;
    });
  }

  damageEnemy(enemy, amount) {
    enemy.hp -= amount;
    const sprite = this.enemySprites.get(enemy.id);
    this.flashSprite(sprite, 0xfff0a3);

    if (enemy.hp <= 0) {
      this.enemies = this.enemies.filter((item) => item.id !== enemy.id);
      this.enemySprites.delete(enemy.id);
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        scale: 0.4,
        duration: 110,
        onComplete: () => sprite.destroy()
      });

      if (this.rng.frac() < 0.48) {
        this.dropGold(enemy.x, enemy.y);
      }
    }
  }

  damagePlayer(amount) {
    this.player.hp -= amount;
    this.flashSprite(this.playerSprite, 0xff6b6b);
    this.cameras.main.shake(80, 0.003);

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.isOver = true;
      this.acceptInput = false;
      this.flashMessage('Run ended');
      this.showGameOver();
    }
  }

  canTalkToNpc() {
    return Boolean(this.npc && distance(this.player, this.npc) <= 1);
  }

  interactNpc() {
    if (!this.canTalkToNpc()) {
      this.flashMessage('周围没有可以交谈的人。');
      return;
    }

    this.npc.talks += 1;

    if (!this.npc.gifted) {
      this.npc.gifted = true;
      const missingHp = this.player.maxHp - this.player.hp;

      if (missingHp > 0) {
        const healed = Math.min(4, missingHp);
        this.player.hp = clamp(this.player.hp + healed, 1, this.player.maxHp);
        this.showDialog('村口看守', `火边还能歇一会儿。你恢复了 ${healed} 点生命。`);
      } else {
        this.player.gold += 2;
        this.showDialog('村口看守', '带上这枚路钱吧。地牢不会对空手的人温柔。');
      }
    } else if (this.npc.talks % 2 === 0) {
      this.showDialog('村口看守', '小地图上的黄色标记就是下一层入口。别在石墙边绕太久。');
    } else {
      this.showDialog('村口看守', '新砌的石墙颜色更深，和地板容易分清。迷路时先看右上角。');
    }

    this.updateHud();
  }

  showDialog(speaker, text, duration = 4800) {
    if (!this.ui || !this.ui.dialogBox) {
      return;
    }

    if (this.dialogTimer) {
      this.dialogTimer.remove(false);
      this.dialogTimer = null;
    }

    this.ui.dialogSpeaker.textContent = speaker;
    this.ui.dialogText.textContent = text;
    this.ui.dialogBox.classList.remove('is-hidden');
    this.dialogTimer = this.time.delayedCall(duration, () => this.hideDialog());
  }

  hideDialog() {
    if (!this.ui || !this.ui.dialogBox) {
      return;
    }

    this.ui.dialogBox.classList.add('is-hidden');

    if (this.dialogTimer) {
      this.dialogTimer.remove(false);
      this.dialogTimer = null;
    }
  }

  showGameOver() {
    this.hasActiveRun = false;
    this.gameState = 'gameover';
    this.acceptInput = false;
    this.saveRecord();
    this.updateHud();

    if (this.ui) {
      this.ui.finalDepth.textContent = String(this.floorNumber);
      this.ui.finalGold.textContent = String(this.player.gold);
      this.ui.finalTurns.textContent = String(this.turn);
    }

    this.time.delayedCall(260, () => this.setUiMode('gameover'));
  }

  pickupAt(x, y) {
    const item = this.items.find((candidate) => candidate.x === x && candidate.y === y);
    if (!item) {
      return;
    }

    if (item.type === 'gold') {
      this.player.gold += item.amount;
      this.flashMessage(`+${item.amount} gold`);
    }

    if (item.type === 'potion') {
      const before = this.player.hp;
      this.player.hp = clamp(this.player.hp + item.amount, 1, this.player.maxHp);
      this.flashMessage(`+${this.player.hp - before} hp`);
    }

    if (item.type === 'blade') {
      this.player.attack += 1;
      this.flashMessage('+1 attack');
    }

    this.items = this.items.filter((candidate) => candidate.id !== item.id);
    const sprite = this.itemSprites.get(item.id);
    this.itemSprites.delete(item.id);

    this.tweens.add({
      targets: sprite,
      y: sprite.y - 8,
      alpha: 0,
      duration: 180,
      onComplete: () => sprite.destroy()
    });
  }

  dropGold(x, y) {
    if (this.itemAt(x, y)) {
      return;
    }

    const item = {
      id: `drop-${this.floorNumber}-${this.turn}-${this.rng.uuid()}`,
      type: 'gold',
      frame: FRAMES.gold,
      amount: this.rng.between(1, 4 + this.floorNumber),
      x,
      y
    };
    this.items.push(item);

    const sprite = this.add
      .sprite(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 'tiny-dungeon', item.frame)
      .setDepth(15)
      .setAlpha(0);
    this.itemSprites.set(item.id, sprite);
    this.tweens.add({ targets: sprite, alpha: 1, y: sprite.y - 2, yoyo: true, duration: 120 });
  }

  moveSprite(sprite, x, y) {
    if (!sprite) {
      return;
    }

    this.tweens.add({
      targets: sprite,
      x: x * TILE_SIZE + 8,
      y: y * TILE_SIZE + 8,
      duration: 64,
      ease: 'Quad.easeOut'
    });
  }

  bump(sprite, dx, dy) {
    this.tweens.add({
      targets: sprite,
      x: sprite.x + dx * 3,
      y: sprite.y + dy * 3,
      duration: 42,
      yoyo: true
    });
  }

  flashSprite(sprite, color) {
    if (!sprite) {
      return;
    }

    sprite.setTint(color);
    this.time.delayedCall(80, () => sprite.clearTint());
  }

  flashMessage(message) {
    this.messageQueue.unshift(message);
    this.messageQueue = this.messageQueue.slice(0, 4);

    if (this.ui) {
      this.ui.messageLog.textContent = this.messageQueue.join('\n');
    }
  }

  restartRun() {
    this.beginRun();
  }

  updateHud() {
    if (!this.ui) {
      return;
    }

    const hpPercent = clamp((this.player.hp / this.player.maxHp) * 100, 0, 100);
    this.ui.hpLabel.textContent = `HP ${this.player.hp}/${this.player.maxHp}`;
    this.ui.hpFill.style.width = `${hpPercent}%`;
    this.ui.depthValue.textContent = String(this.floorNumber);
    this.ui.attackValue.textContent = String(this.player.attack);
    this.ui.goldValue.textContent = String(this.player.gold);
    this.ui.enemyValue.textContent = String(this.enemies ? this.enemies.length : 0);
    this.ui.resumeButton.disabled = !this.hasActiveRun || this.isOver;
    this.ui.npcPrompt.classList.toggle('is-hidden', this.gameState !== 'playing' || !this.canTalkToNpc());
    this.drawMiniMap();
  }

  enemyAt(x, y) {
    return this.enemies.find((enemy) => enemy.x === x && enemy.y === y);
  }

  npcAt(x, y) {
    return this.npc && this.npc.x === x && this.npc.y === y;
  }

  itemAt(x, y) {
    return this.items.find((item) => item.x === x && item.y === y);
  }

  drawMiniMap() {
    if (!this.ui || !this.ui.minimap || !this.grid) {
      return;
    }

    const canvas = this.ui.minimap;
    const ctx = canvas.getContext('2d');
    const scale = 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0e1212';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const tile = this.grid[y][x];
        if (tile.solid) {
          ctx.fillStyle = '#242b35';
        } else if (tile.zone === 'hut') {
          ctx.fillStyle = '#8a654c';
        } else {
          ctx.fillStyle = '#52635f';
        }
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    for (const item of this.items || []) {
      ctx.fillStyle = item.type === 'gold' ? '#d6b85e' : '#b98ab5';
      ctx.fillRect(item.x * scale, item.y * scale, scale, scale);
    }

    for (const enemy of this.enemies || []) {
      ctx.fillStyle = '#bf544b';
      ctx.fillRect(enemy.x * scale, enemy.y * scale, scale, scale);
    }

    if (this.npc) {
      ctx.fillStyle = '#8ec4ac';
      ctx.fillRect(this.npc.x * scale - 1, this.npc.y * scale - 1, 4, 4);
    }

    ctx.fillStyle = '#e5cf78';
    ctx.fillRect(this.exit.x * scale - 1, this.exit.y * scale - 1, 4, 4);

    ctx.fillStyle = '#f4eed6';
    ctx.fillRect(this.player.x * scale - 1, this.player.y * scale - 1, 4, 4);
  }

  isSolid(x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) {
      return true;
    }

    return this.grid[y][x].solid;
  }
}

window.RogueScene = RogueScene;
})();
