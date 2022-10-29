# Marble Blast - Web Port - Rewind Edition
This implements rewinding capabilities to the MB Web Port located [here](https://github.com/Vanilagy/MarbleBlast)  
Current release is hosted [here](http://mbgwrewind.pythonanywhere.com/)

## Currently Implemented Features
- Rewind support for marble, all collectibles, timer, shape animations, all hazards, gravity, moving platforms, teleports, checkpoint and blast.
- Rewind timescaling
- MBP/MBU/Touch support

## Usage
Start a level, press and hold 'Left Shift' to rewind

## Building
To compile, run `npm install --legacy-peer-deps`, then `npm run compile`. For fast building after initial build, do `npm run watch-fast`.

## Running the server
Python 3 is required to run the server.  
Install the requirements using `pip install -r requirements.txt`, then run the flask server by running run-flask.bat