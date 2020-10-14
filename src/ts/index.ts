import './input';
import OIMO from "./declarations/oimo";
import { ResourceManager } from "./resources";
import * as THREE from "three";
import { AudioManager } from "./audio";
import './ui/home';
import { initLevelSelect } from "./ui/level_select";
import { startUi, initUi } from "./ui/ui";
import { StorageManager } from './storage';
import { Util } from './util';
import { initOptions } from './ui/options';

OIMO.Setting.defaultGJKMargin = 0.005; // Without this, the marble is very visibly floating above stuff.
OIMO.Setting.defaultContactPositionCorrectionAlgorithm = OIMO.PositionCorrectionAlgorithm.NGS; // Slower, but there's really only one collision object anyway so
THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);

const loadingMessage = document.querySelector('#loading-message') as HTMLDivElement;
const startGameDialog = document.querySelector('#start-game-dialog') as HTMLDivElement;

async function init() {
	await Util.init();
	await StorageManager.init();
	await ResourceManager.init();
	AudioManager.init();
	await Promise.all([initOptions(), initLevelSelect(), initUi()]);

	let started = false;
	const start = () => {
		started = true;
		startGameDialog.style.display = 'none';
		AudioManager.context.resume();
		startUi();
	};
	
	loadingMessage.style.display = 'none';
	if (AudioManager.context.state === "running") {
		// Start the game automatically if we already have audio autoplay permission.
		start();
		return;
	}

	// Otherwise, we need user interaction to start audio.
	
	if (Util.isInFullscreen()) {
		// No need to tell them to enter fullscreen if they're already in it
		startGameDialog.children[0].textContent = 'Click anywhere to start';
		startGameDialog.children[1].textContent = '';
	}
	startGameDialog.style.display = 'block';
	
	window.addEventListener('mousedown', () => {
		if (started) return;
		start();
	});
	window.addEventListener('keydown', (e) => {
		if (started) return;
		if (e.code === 'F11' && !Util.isInFullscreen()) start();
	});
}
window.onload = init;