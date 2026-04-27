# game1

一个像素风格、2D 俯视角 Roguelike 小游戏原型。项目使用 **Phaser 3 + Electron**，可以在 VSCode 里开发，并可打包 macOS / Windows 桌面版。

## 需要安装

1. Node.js LTS
2. VSCode
3. VSCode 推荐插件会在打开项目时提示安装：Prettier、EditorConfig

## 运行

```bash
npm install
npm run dev
```

## 操作

- `WASD` 或方向键移动
- 撞上敌人会攻击
- `Space` 或 `F` 攻击相邻敌人
- 靠近 NPC 后按 `E` 交谈
- 右上角小地图会显示玩家、NPC、出口和敌人
- `R` 重新开始

## 打包

```bash
npm run package:mac
npm run package:win
```

打包后的文件会输出到 `release/`。在 macOS 上打 Windows 包时，Electron Builder 可能需要额外的 Wine 环境；如果只在本机测试，可以先用 `npm run dev`。

## 素材

素材来自 Kenney 的 Tiny Dungeon，CC0 许可。当前游戏使用了重新调色并强化墙面辨识度的素材 `public/assets/kenney-tiny-dungeon/tilemap_game1.png`，详情见 `ATTRIBUTION.md`。

## 自己添加内容

- 改菜单和 HUD 文字：`index.html`
- 改 UI 颜色、按钮、布局：`src/style.css`
- 改地图、角色数值、敌人、掉落、菜单逻辑：`src/scenes/RogueScene.js`
- 添加新图片素材：放进 `public/assets/`
- 改应用名、打包名：`package.json`
