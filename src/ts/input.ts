import { state } from "./state";
import { StorageManager } from "./storage";
import { gameUiDiv } from "./ui/game";

export const currentMousePosition = {
	x: 0,
	y: 0
};

window.addEventListener('mousemove', (e) => {
	currentMousePosition.x = e.clientX;
	currentMousePosition.y = e.clientY;
	state.currentLevel?.onMouseMove(e);
});

window.addEventListener('mousedown', (e) => {
	if (!StorageManager.data) return;
	// Request pointer lock if we're currently in-game
	if (state.currentLevel && !state.currentLevel.paused && !state.currentLevel.finishTime) document.documentElement.requestPointerLock();

	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName) {
		// Check if the mouse button is mapped to something
		for (let button in StorageManager.data.settings.gameButtonMapping) {
			let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
			if (buttonName !== StorageManager.data.settings.gameButtonMapping[key]) continue;
	
			gameButtons[key] = true;
			
			if (state.currentLevel) {
				if (key === 'jump') state.currentLevel.jumpQueued = true;
				if (key === 'use') state.currentLevel.useQueued = true;
			}
		}
	}
});

window.addEventListener('mouseup', (e) => {
	if (!StorageManager.data) return;

	let buttonName = ["LMB", "MMB", "RMB"][e.button];
	if (buttonName) {
		for (let button in StorageManager.data.settings.gameButtonMapping) {
			let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
			if (buttonName !== StorageManager.data.settings.gameButtonMapping[key]) continue;
	
			gameButtons[key] = false;
		}
	}
});

window.addEventListener('keydown', (e) => {
	if (!StorageManager.data) return;

	// Check if the key button is mapped to something
	for (let button in StorageManager.data.settings.gameButtonMapping) {
		let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
		if (e.code !== StorageManager.data.settings.gameButtonMapping[key]) continue;

		gameButtons[key] = true;

		if (state.currentLevel) {
			if (key === 'jump') state.currentLevel.jumpQueued = true;
			if (key === 'use') state.currentLevel.useQueued = true;
		}
	}

	if (e.code === 'KeyR' && !(!state.currentLevel || gameUiDiv.classList.contains('hidden') || !state.currentLevel || state.currentLevel.paused || state.currentLevel.finishTime)) {
		state.currentLevel.rewinding = true;
	}
});

window.addEventListener('keyup', (e) => {
	if (!StorageManager.data) return;

	for (let button in StorageManager.data.settings.gameButtonMapping) {
		let key = button as keyof typeof StorageManager.data.settings.gameButtonMapping;
		if (e.code !== StorageManager.data.settings.gameButtonMapping[key]) continue;

		gameButtons[key] = false;
	}

	if (e.code === 'KeyR' && !(!state.currentLevel || gameUiDiv.classList.contains('hidden') || !state.currentLevel || state.currentLevel.paused || state.currentLevel.finishTime)) {
		state.currentLevel.rewinding = false;
	}
});

window.addEventListener('contextmenu', (e) => e.preventDefault()); // Disable right click context menu for good

window.addEventListener('beforeunload', (e) => {
	// Ask the user if they're sure about closing the tab if they're currently in game
	if (state.currentLevel) {
		e.preventDefault();
		e.returnValue = '';
	}
});

/** The current pressed state of all the game buttons. */
export const gameButtons = {
	up: false,
	down: false,
	left: false,
	right: false,
	jump: false,
	use: false,
	cameraUp: false,
	cameraDown: false,
	cameraLeft: false,
	cameraRight: false,
	freeLook: false,
	rewind: false,
};

export const releaseAllButtons = () => {
	for (let key in gameButtons) gameButtons[key as keyof typeof gameButtons] = false;
};