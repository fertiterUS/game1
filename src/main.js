(function () {
const Phaser = window.Phaser;
const RogueScene = window.RogueScene;

function bootGame() {
  const config = {
    type: Phaser.CANVAS,
    parent: 'game',
    width: 960,
    height: 640,
    backgroundColor: '#101820',
    title: 'game1',
    pixelArt: true,
    roundPixels: true,
    render: {
      antialias: false,
      pixelArt: true,
      roundPixels: true
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [RogueScene]
  };

  new Phaser.Game(config);
}

const spriteSheet = document.getElementById('tiny-dungeon-image');

if (spriteSheet.complete && spriteSheet.naturalWidth > 0) {
  bootGame();
} else {
  spriteSheet.addEventListener('load', bootGame, { once: true });
  spriteSheet.addEventListener(
    'error',
    () => {
      console.error('Failed to load Tiny Dungeon spritesheet.');
    },
    { once: true }
  );
}
})();
