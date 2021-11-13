# Marble Blast Gold - Web Port - Rewind Edition
This implements rewinding capabilities to the MBG Web Port located [here](https://github.com/Vanilagy/MarbleBlast)  
Current release is hosted [here](http://mbgwrewind.pythonanywhere.com/)

## Currently Implemented Features
- Rewind support for marble, all collectibles, timer, shape animations, all hazards, gravity, moving platforms, teleports, checkpoint and blast.
- Rewind timescaling
- MBP/MBU/Touch support

## Usage
Start a level, press and hold 'Left Shift' to rewind

## Building and developing
If you wish to build the game yourself, simply clone the repository, then run `npm install --legacy-peer-deps` and `npm run compile`, which will compile the TypeScript code using [rollup](https://rollupjs.org/guide/en/). Then run `npm start` to start up the server (runs on :8080 by default). If you want to configure the port and other server options, modify `server/data/config.json`. For fast development run `npm run watch-fast` (or `npm run watch` for a slower, but typechecked version). If you wish to bundle the project, run `npm run bundle`, which uses [Sarcina](https://github.com/Vanilagy/Sarcina) and writes to `dist/`.

**Note:** This project has a dependency that requires `node-gyp`. Install `node-gyp` _before_ running `npm install` on this project with `npm install -g node-gyp`, and if you're on Windows, make sure to run `npm install --global --production windows-build-tools` right afterwards in an _elevated command prompt_ (one with admin rights) to handle the annoying installation stuff