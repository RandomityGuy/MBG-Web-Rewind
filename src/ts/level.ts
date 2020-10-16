import { DifParser } from "./parsing/dif_parser";
import { Interior } from "./interior";
import * as THREE from "three";
import { renderer, camera, orthographicCamera } from "./rendering";
import OIMO from "./declarations/oimo";
import { Marble } from "./marble";
import { Shape, SharedShapeData } from "./shape";
import { MissionElementSimGroup, MissionElementType, MissionElementStaticShape, MissionElementItem, MisParser, MissionElementSun, MissionElementTrigger, MissionElementInteriorInstance, MissionElementScriptObject, MissionElementAudioProfile } from "./parsing/mis_parser";
import { StartPad } from "./shapes/start_pad";
import { SignFinish } from "./shapes/sign_finish";
import { SignPlain } from "./shapes/sign_plain";
import { EndPad } from "./shapes/end_pad";
import { Gem } from "./shapes/gem";
import { SuperJump } from "./shapes/super_jump";
import { SignCaution } from "./shapes/sign_caution";
import { SuperBounce } from "./shapes/super_bounce";
import { RoundBumper } from "./shapes/round_bumper";
import { Helicopter } from "./shapes/helicopter";
import { DuctFan } from "./shapes/duct_fan";
import { AntiGravity } from "./shapes/anti_gravity";
import { LandMine } from "./shapes/land_mine";
import { ShockAbsorber } from "./shapes/shock_absorber";
import { SuperSpeed } from "./shapes/super_speed";
import { TimeTravel } from "./shapes/time_travel";
import { Tornado } from "./shapes/tornado";
import { TrapDoor } from "./shapes/trap_door";
import { TriangleBumper } from "./shapes/triangle_bumper";
import { Oilslick } from "./shapes/oilslick";
import { Util, Scheduler } from "./util";
import { PowerUp } from "./shapes/power_up";
import { gameButtons, releaseAllButtons } from "./input";
import { SmallDuctFan } from "./shapes/small_duct_fan";
import { PathedInterior } from "./pathed_interior";
import { Trigger } from "./triggers/trigger";
import { InBoundsTrigger } from "./triggers/in_bounds_trigger";
import { HelpTrigger } from "./triggers/help_trigger";
import { OutOfBoundsTrigger } from "./triggers/out_of_bounds_trigger";
import { displayTime, displayAlert, displayGemCount, gemCountElement, numberSources, setCenterText, displayHelp, showPauseScreen, hidePauseScreen, finishScreenDiv, showFinishScreen, stopAndExit } from "./ui/game";
import { ResourceManager } from "./resources";
import { AudioManager, AudioSource } from "./audio";
import { PhysicsHelper } from "./physics";
import { ParticleManager } from "./particles";
import { StorageManager } from "./storage";
import { Rewind } from "./rewind/rewind";
import { RewindManager } from "./rewind/rewind_manager";
import { Replay } from "./replay";
import { getCurrentLevelArray } from "./ui/level_select";

/** How often the physics will be updated, per second. */
export const PHYSICS_TICK_RATE = 120;
/** The vertical offsets of overlay shapes to get them all visually centered. */
const SHAPE_OVERLAY_OFFSETS = {
	"shapes/images/helicopter.dts": -67,
	"shapes/items/superjump.dts": -70,
	"shapes/items/superbounce.dts": -55,
	"shapes/items/superspeed.dts": -53,
	"shapes/items/shockabsorber.dts": -53
};
/** The time in milliseconds when the marble is released from the start pad. */
export const GO_TIME = 3500;
/** Default camera pitch */
const DEFAULT_PITCH = 0.45;

export interface TimeState {
	/** The time since the level was loaded, this ticks up continuously. */
	timeSinceLoad: number,
	/** The time of the current attempt, this also ticks up continuously but is reset to 0 on restart. */
	currentAttemptTime: number,
	/** The gameplay time, affected by time travels and what not. */
	gameplayClock: number,
	/** A value in [0, 1], representing how far in between two physics ticks we are. */
	physicsTickCompletion: number
}

interface LoadingState {
	/** How many things have loaded */
	loaded: number,
	/** How many things are going to be loaded */
	total: number
}

/** The central control unit of gameplay. Handles loading, simulation and rendering. */
export class Level extends Scheduler {
	mission: MissionElementSimGroup;
	missionPath: string;

	loadingState: LoadingState;

	scene: THREE.Scene;
	sunlight: THREE.DirectionalLight;
	sunDirection: THREE.Vector3;
	physics: PhysicsHelper;
	particles: ParticleManager;
	marble: Marble;
	interiors: Interior[] = [];
	triggers: Trigger[] = [];

	shapes: Shape[] = [];
	/** Holds data shared between multiple shapes of the same .dts path. */
	sharedShapeData = new Map<string, Promise<SharedShapeData>>();
	/** The shapes used for drawing HUD overlay (powerups in the corner) */
	overlayShapes: Shape[] = [];
	overlayScene: THREE.Scene;

	/** Holds the setInterval id */
	tickInterval: number;
	timeState: TimeState;
	/** The last performance.now() time the physics were ticked. */
	lastPhysicsTick: number = null;

	lastPaused = false;
	paused = false;
	/** If the level is stopped, it shouldn't be used anymore. */
	stopped = false;
	/** The timestate at the moment of finishing. */
	finishTime: TimeState = null;
	finishYaw: number;
	finishPitch: number;
	
	pitch = 0;
	yaw = 0;
	/** Where the camera was when the marble went OOB. */
	oobCameraPosition: THREE.Vector3;
	lastVerticalTranslation = new THREE.Vector3();
	currentUp = new OIMO.Vec3(0, 0, 1);
	/** The last time the orientation was changed (by a gravity modifier) */
	orientationChangeTime = -Infinity;
	/** The old camera orientation quat */
	oldOrientationQuat = new THREE.Quaternion();
	/** The new target camera orientation quat  */
	newOrientationQuat = new THREE.Quaternion();
	/** See usage. */
	previousMouseMovementDistance = 0;

	currentTimeTravelBonus = 0;
	heldPowerUp: PowerUp = null;
	totalGems = 0;
	gemCount = 0;
	outOfBounds = false;
	/** When the jump button was pressed, remember that it was pressed until the next tick to execute the jump. */
	jumpQueued = false;
	useQueued = false;
	
	timeTravelSound: AudioSource;
	music: AudioSource;
	replay: Replay;

	// Rewind 
	rewinding = false;
	rewind: Rewind;
	lastRewinding = false;

	deltaMs: number; // Why isnt this stored anywhere
	oobSchedule: number;

	constructor(missionGroup: MissionElementSimGroup, missionPath: string) {
		super();
		this.mission = missionGroup;
		this.missionPath = missionPath;
		this.loadingState = { loaded: 0, total: 0};
	}

	/** Loads all necessary resources and builds the mission. */
	async init() {
		// Scan the mission for elements to determine required loading effort
		const scanMission = (simGroup: MissionElementSimGroup) => {
			for (let element of simGroup.elements) {
				if ([MissionElementType.InteriorInstance, MissionElementType.Item, MissionElementType.PathedInterior, MissionElementType.StaticShape].includes(element._type)) {
					this.loadingState.total++;
				} else if (element._type === MissionElementType.SimGroup) {
					scanMission(element);
				}
			}
		};
		scanMission(this.mission);
		this.loadingState.total += 6 + 1 + 3 + 6; // For the scene, marble, UI and sounds (includes music!)

		this.physics = new PhysicsHelper(this);
		await this.initScene();
		await this.initMarble(); this.loadingState.loaded += 1;
		await this.addSimGroup(this.mission);
		await this.initUi(); this.loadingState.loaded += 3;
		await this.initSounds(); this.loadingState.loaded += 6;

		this.particles = new ParticleManager(this);
		await this.particles.init();
		this.replay = new Replay(this);

		this.rewind = new Rewind();
		this.rewind.rewindManager = new RewindManager();
		this.rewind.rewindManager.level = this;
	}

	async start() {
		if (this.stopped) return;

		this.timeState = {
			timeSinceLoad: 0,
			currentAttemptTime: 0,
			gameplayClock: 0,
			physicsTickCompletion: 0
		};

		displayHelp('');
		displayAlert('');

		this.restart();
		for (let shape of this.shapes) await shape.onLevelStart();

		this.updateCamera(this.timeState); // Ensure that the camera is positioned correctly before the first tick for correct positional audio playback
		this.render(); // This will also do a tick
		this.tickInterval = setInterval(() => this.tick());
		this.music.play();
	}

	async initScene() {
		this.scene = new THREE.Scene();

		let sunElement = this.mission.elements.find((element) => element._type === MissionElementType.Sun) as MissionElementSun;
		this.sunDirection = MisParser.parseVector3(sunElement.direction);
		let directionalColor = MisParser.parseVector4(sunElement.color);
		let ambientColor = MisParser.parseVector4(sunElement.ambient);

		// Create the ambient light
		let ambientLight = new THREE.AmbientLight(new THREE.Color(ambientColor.x, ambientColor.y, ambientColor.z), 1);
        ambientLight.position.z = 0;
        ambientLight.position.y = 5;
		this.scene.add(ambientLight);
		
		// Create the sunlight and set up the shadow camera
        let sunlight = new THREE.DirectionalLight(new THREE.Color(directionalColor.x, directionalColor.y, directionalColor.z), 1);
        this.scene.add(sunlight);
		sunlight.castShadow = true;
		sunlight.shadow.camera.far = 10000;
        sunlight.shadow.camera.left = -0.8; // The shadow area itself is very small 'cause it only needs to cover the marble and the gyrocopter
        sunlight.shadow.camera.right = 0.8;
        sunlight.shadow.camera.bottom = -0.8;
		sunlight.shadow.camera.top = 0.8;
		sunlight.shadow.mapSize.width = 200;
		sunlight.shadow.mapSize.height = 200;
		sunlight.shadow.radius = 2;
		this.scene.add(sunlight.target); // Necessary for it to update
		this.sunlight = sunlight;

		// Init the skybox
		// Split it up into steps manually for more granularity in the loading state
		let skyboxImages: (HTMLImageElement | HTMLCanvasElement)[] = [];
		skyboxImages[0] = await ResourceManager.loadImage('./assets/data/skies/sky_lf.jpg'); this.loadingState.loaded++;
		skyboxImages[1] = await ResourceManager.loadImage('./assets/data/skies/sky_rt.jpg'); this.loadingState.loaded++;
		skyboxImages[2] = await ResourceManager.loadImage('./assets/data/skies/sky_bk.jpg'); this.loadingState.loaded++;
		skyboxImages[3] = await ResourceManager.loadImage('./assets/data/skies/sky_fr.jpg'); this.loadingState.loaded++;
		skyboxImages[4] = await ResourceManager.loadImage('./assets/data/skies/sky_up.jpg'); this.loadingState.loaded++;
		skyboxImages[5] = await ResourceManager.loadImage('./assets/data/skies/sky_dn.jpg'); this.loadingState.loaded++;

		// three.js skyboxes are aligned with respect to y-up, but everything here is z-up. Therefore we need to do some manual image transformation hackery.
		skyboxImages[0] = Util.modifyImageWithCanvas(skyboxImages[0], -Math.PI/2, true);
		skyboxImages[1] = Util.modifyImageWithCanvas(skyboxImages[1], Math.PI/2, true);
		skyboxImages[2] = Util.modifyImageWithCanvas(skyboxImages[2], 0, true);
		skyboxImages[3] = Util.modifyImageWithCanvas(skyboxImages[3], Math.PI, true);
		skyboxImages[4] = Util.modifyImageWithCanvas(skyboxImages[4], Math.PI, true);
		skyboxImages[5] = Util.modifyImageWithCanvas(skyboxImages[5], 0, true);
		let skyboxTexture = new THREE.CubeTexture(skyboxImages);
		skyboxTexture.needsUpdate = true;
		this.scene.background = skyboxTexture;
	}

	async initMarble() {
		this.marble = new Marble(this);
		await this.marble.init();

		this.scene.add(this.marble.group);
		this.physics.initMarble();
	}

	async initUi() {
		// Load all necessary UI image elements
		await ResourceManager.loadImages(Object.values(numberSources).map(x => "./assets/ui/game/numbers/" + x));
		await ResourceManager.loadImages(["ready.png", "set.png", "go.png", "outofbounds.png", "powerup.png"].map(x => "./assets/ui/game/" + x));

		// Set up the HUD overlay

		let hudOverlayShapePaths = new Set<string>();
		for (let shape of this.shapes) {
			if (shape instanceof PowerUp || shape instanceof Gem) {
				// We need to display the gem and powerup shapes in the HUD
				hudOverlayShapePaths.add(shape.dtsPath);
			}
		}

		this.overlayScene = new THREE.Scene();
		let overlayLight = new THREE.AmbientLight(0xffffff);
		this.overlayScene.add(overlayLight);

		for (let path of hudOverlayShapePaths) {
			let shape = new Shape();
			shape.dtsPath = path;
			shape.ambientRotate = true;
			await shape.init();

			this.overlayShapes.push(shape);
			this.overlayScene.add(shape.group); // Add the shape temporarily (permanently if gem) for a GPU update
			if (path.includes("gem")) shape.ambientSpinFactor /= -2; // Gems spin the other way apparently
			else shape.ambientSpinFactor /= 2;
		}

		if (this.totalGems > 0) {
			// Show the gem overlay
			gemCountElement.style.display = '';
		} else {
			// Hide the gem UI
			gemCountElement.style.display = 'none';
		}

		// Render everything once to force a GPU upload
		renderer.render(this.overlayScene, orthographicCamera);

		// Remove everything but gems again
		for (let shape of this.overlayShapes) {
			if (shape.dtsPath.includes('gem')) continue;
			this.overlayScene.remove(shape.group);
		}
	}

	async initSounds() {
		let levelIndex = getCurrentLevelArray().findIndex(x => x.simGroup === this.mission);
		let musicFileName = ['groovepolice.ogg', 'classic vibe.ogg', 'beach party.ogg'][(levelIndex + 1) % 3]; // The music choice is based off of level index

		await AudioManager.loadBuffers(["spawn.wav", "ready.wav", "set.wav", "go.wav", "whoosh.wav", "timetravelactive.wav", "infotutorial.wav", musicFileName]);
		this.music = AudioManager.createAudioSource(musicFileName, AudioManager.musicGain);
		this.music.node.loop = true;
		await this.music.promise;
	}

	/** Adds all elements within a sim group. */
	async addSimGroup(simGroup: MissionElementSimGroup) {
		// Check if it's a pathed interior group
		if (simGroup.elements.find((element) => element._type === MissionElementType.PathedInterior)) {
			// Create the pathed interior
			let pathedInterior = await PathedInterior.createFromSimGroup(simGroup, this);

			this.scene.add(pathedInterior.group);
			this.physics.addInterior(pathedInterior);
			this.interiors.push(pathedInterior);
			for (let trigger of pathedInterior.triggers) this.triggers.push(trigger);

			return;
		}

		let promises: Promise<any>[] = [];

		for (let element of simGroup.elements) {
			switch (element._type) {
				case MissionElementType.SimGroup: {
					promises.push(this.addSimGroup(element));
				}; break;
				case MissionElementType.InteriorInstance: {
					promises.push(this.addInterior(element));
				}; break;
				case MissionElementType.StaticShape: case MissionElementType.Item: {
					promises.push(this.addShape(element));
				}; break;
				case MissionElementType.Trigger: {
					this.addTrigger(element);
				}; break;
			}
		}

		await Promise.all(promises);
	}

	async addInterior(element: MissionElementInteriorInstance) {
		let path = element.interiorfile.slice(element.interiorfile.indexOf('interiors/'));
		let difFile = await DifParser.loadFile('./assets/data/' + path);
		if (!difFile) return;

		let interior = new Interior(difFile, path, this);
		await interior.init();
		interior.setTransform(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		this.scene.add(interior.group);
		this.physics.addInterior(interior);
		this.interiors.push(interior);
	}

	async addShape(element: MissionElementStaticShape | MissionElementItem) {
		let shape: Shape;

		// Add the correct shape based on type
		let dataBlockLowerCase = element.datablock.toLowerCase();
		if (dataBlockLowerCase === "startpad") shape = new StartPad();
		else if (dataBlockLowerCase === "endpad") shape = new EndPad();
		else if (dataBlockLowerCase === "signfinish") shape = new SignFinish();
		else if (dataBlockLowerCase.startsWith("signplain")) shape = new SignPlain(element as MissionElementStaticShape);
		else if (dataBlockLowerCase.startsWith("gemitem")) shape = new Gem(element as MissionElementItem), this.totalGems++;
		else if (dataBlockLowerCase === "superjumpitem") shape = new SuperJump();
		else if (dataBlockLowerCase.startsWith("signcaution")) shape = new SignCaution(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "superbounceitem") shape = new SuperBounce();
		else if (dataBlockLowerCase === "roundbumper") shape = new RoundBumper();
		else if (dataBlockLowerCase === "trianglebumper") shape = new TriangleBumper();
		else if (dataBlockLowerCase === "helicopteritem") shape = new Helicopter();
		else if (dataBlockLowerCase === "ductfan") shape = new DuctFan();
		else if (dataBlockLowerCase === "smallductfan") shape = new SmallDuctFan();
		else if (dataBlockLowerCase === "antigravityitem") shape = new AntiGravity();
		else if (dataBlockLowerCase === "landmine") shape = new LandMine();
		else if (dataBlockLowerCase === "shockabsorberitem") shape = new ShockAbsorber();
		else if (dataBlockLowerCase === "superspeeditem") shape = new SuperSpeed();
		else if (dataBlockLowerCase === "timetravelitem") shape = new TimeTravel(element as MissionElementItem);
		else if (dataBlockLowerCase === "tornado") shape = new Tornado();
		else if (dataBlockLowerCase === "trapdoor") shape = new TrapDoor(element as MissionElementStaticShape);
		else if (dataBlockLowerCase === "oilslick") shape = new Oilslick();

		if (!shape) return;

		this.shapes.push(shape);
		// This is a bit hacky, but wait a short amount so that all shapes will have been created by the time this codepath continues. This is necessary for correct sharing of data between shapes.
		await Util.wait(10);
		await shape.init(this, element._id);

		shape.setTransform(MisParser.parseVector3(element.position), MisParser.parseRotation(element.rotation), MisParser.parseVector3(element.scale));

		this.scene.add(shape.group);
		this.physics.addShape(shape);
	}

	addTrigger(element: MissionElementTrigger) {
		let trigger: Trigger;

		// Create a trigger based on type
		if (element.datablock === "OutOfBoundsTrigger") {
			trigger = new OutOfBoundsTrigger(element, this);
		} else if (element.datablock === "InBoundsTrigger") {
			trigger = new InBoundsTrigger(element, this);
		} else if (element.datablock === "HelpTrigger") {
			trigger = new HelpTrigger(element, this);
		}

		if (!trigger) return;

		this.triggers.push(trigger);
		this.physics.addTrigger(trigger);
	}

	/** Restarts and resets the level. */
	restart() {
		this.timeState.currentAttemptTime = 0;
		this.timeState.gameplayClock = 0;
		this.currentTimeTravelBonus = 0;
		this.outOfBounds = false;
		this.oobSchedule = -1;
		this.lastPhysicsTick = null;
		
		if (this.totalGems > 0) {
			this.gemCount = 0;
			displayGemCount(this.gemCount, this.totalGems);
		}

		this.finishTime = null;

		let startPad = this.shapes.find((shape) => shape instanceof StartPad);
		// Place the marble a bit above the start pad
		this.marble.body.setPosition(new OIMO.Vec3(startPad.worldPosition.x, startPad.worldPosition.y, startPad.worldPosition.z + 3));
		this.marble.group.position.copy(Util.vecOimoToThree(this.marble.body.getPosition()));
		this.marble.reset();

		// Determine starting camera orientation based on the start pad
		let euler = new THREE.Euler();
		euler.setFromQuaternion(startPad.worldOrientation, "ZXY");
		this.yaw = euler.z + Math.PI/2;
		this.pitch = DEFAULT_PITCH;

		let missionInfo = this.mission.elements.find((element) => element._type === MissionElementType.ScriptObject && element._subtype === "MissionInfo") as MissionElementScriptObject;
		if (missionInfo.starthelptext) displayHelp(missionInfo.starthelptext); // Show the start help text

		for (let shape of this.shapes) shape.reset();
		for (let interior of this.interiors) interior.reset();

		// Reset the physics
		this.currentUp = new OIMO.Vec3(0, 0, 1);
		this.orientationChangeTime = -Infinity;
		this.oldOrientationQuat = new THREE.Quaternion();
		this.newOrientationQuat = new THREE.Quaternion();
		this.setGravityIntensity(20);
		this.physics.reset();
		
		this.deselectPowerUp();
		setCenterText('none');

		this.timeTravelSound?.stop();
		this.timeTravelSound = null;

		this.replay.init();

		// Queue the ready-set-go events

		AudioManager.play('spawn.wav');

		this.clearSchedule();
		this.schedule(500, () => {
			// setCenterText('ready');
			AudioManager.play('ready.wav');
		});
		this.schedule(2000, () => {
			// setCenterText('set');
			AudioManager.play('set.wav');
		});
		this.schedule(GO_TIME, () => {
			// setCenterText('go');
			AudioManager.play('go.wav');
		});
		this.schedule(5500, () => {
			if (!this.outOfBounds) setCenterText('none');
		});

		this.rewind.rewindManager.clear();
		this.rewinding = false;
	}

	updateGameState()
	{
		if (this.timeState.currentAttemptTime < 500)
		{
			setCenterText('none');
		}
		if (this.timeState.currentAttemptTime >= 500 && this.timeState.currentAttemptTime < 2000)
		{
			setCenterText('ready');
		}
		if (this.timeState.currentAttemptTime >= 2000 && this.timeState.currentAttemptTime < GO_TIME)
		{
			setCenterText('set');
		}
		if (this.timeState.currentAttemptTime >= GO_TIME && this.timeState.currentAttemptTime < 5500)
		{
			setCenterText('go');
		}
		if (this.timeState.currentAttemptTime >= 5500)
		{
			setCenterText('none');
		}
	}

	render() {
		if (this.stopped) return;

		let time = performance.now();
		this.tick(time);

		let physicsTickLength = 1000 / PHYSICS_TICK_RATE;
		let completion = Util.clamp((time - this.lastPhysicsTick) / physicsTickLength, 0, 1);
		// Set up an intermediate time state for smoother rendering
		let tempTimeState: TimeState = {
			timeSinceLoad: this.timeState.timeSinceLoad + completion * physicsTickLength,
			currentAttemptTime: this.timeState.currentAttemptTime + completion * physicsTickLength,
			gameplayClock: (this.currentTimeTravelBonus || this.timeState.currentAttemptTime < GO_TIME)? this.timeState.gameplayClock : this.timeState.gameplayClock + completion * physicsTickLength,
			physicsTickCompletion: completion
		};

		this.marble.render(tempTimeState);
		for (let interior of this.interiors) interior.render(tempTimeState);
		for (let shape of this.shapes) shape.render(tempTimeState);
		this.particles.render(tempTimeState.timeSinceLoad);

		this.updateCamera(tempTimeState);

		// Update the shadow camera
		let shadowCameraPosition = this.marble.group.position.clone();
		shadowCameraPosition.sub(this.sunDirection.clone().multiplyScalar(5));
		this.sunlight.shadow.camera.position.copy(shadowCameraPosition);
		this.sunlight.position.copy(shadowCameraPosition);
		this.sunlight.target.position.copy(this.marble.group.position);

		renderer.render(this.scene, camera);

		// Update the overlay
		for (let overlayShape of this.overlayShapes) {
			overlayShape.group.position.x = 500;
			overlayShape.render(this.timeState);

			if (overlayShape.dtsPath.includes("gem")) {
				overlayShape.group.scale.setScalar(45);
				overlayShape.group.position.y = 25;
				overlayShape.group.position.z = -35;
			} else {
				overlayShape.group.scale.setScalar(40);
				overlayShape.group.position.y = window.innerWidth - 55;
				overlayShape.group.position.z = SHAPE_OVERLAY_OFFSETS[overlayShape.dtsPath as keyof typeof SHAPE_OVERLAY_OFFSETS];
			}
		}

		renderer.autoClear = false; // Make sure not to clear the previous canvas
		renderer.render(this.overlayScene, orthographicCamera);
		renderer.autoClear = true;

		displayTime((this.finishTime ?? tempTimeState).gameplayClock / 1000);

		requestAnimationFrame(() => this.render());
	}

	/** Updates the position of the camera based on marble position and orientation. */
	updateCamera(timeState: TimeState) {
		let marblePosition = Util.vecThreeToOimo(this.marble.group.position);
		let orientationQuat = this.getOrientationQuat(timeState);
		let up = new THREE.Vector3(0, 0, 1).applyQuaternion(orientationQuat);
		let directionVector = new THREE.Vector3(1, 0, 0);
		// The camera is translated up a bit so it looks "over" the marble
		let cameraVerticalTranslation = new THREE.Vector3(0, 0, 0.3);

		if (this.replay.mode === 'playback') {
			let indexLow = Math.max(0, this.replay.currentTickIndex - 1);
			let indexHigh = this.replay.currentTickIndex;

			// Smoothly interpolate pitch and yaw between the last two keyframes
			this.pitch = Util.lerp(this.replay.cameraOrientations[indexLow].pitch, this.replay.cameraOrientations[indexHigh].pitch, timeState.physicsTickCompletion);
			this.yaw = Util.lerp(this.replay.cameraOrientations[indexLow].yaw, this.replay.cameraOrientations[indexHigh].yaw, timeState.physicsTickCompletion);
		}

		if (this.finishTime) {
			// Make the camera spin around slowly
			this.pitch = Util.lerp(this.finishPitch, DEFAULT_PITCH, Util.clamp((timeState.currentAttemptTime - this.finishTime.currentAttemptTime) / 333, 0, 1));
			this.yaw = this.finishYaw - (timeState.currentAttemptTime - this.finishTime.currentAttemptTime) / 1000 * 0.6;
		}

		if (!this.outOfBounds) {
			directionVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.pitch);
			directionVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw);
			directionVector.applyQuaternion(orientationQuat);

			cameraVerticalTranslation.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.pitch);
			cameraVerticalTranslation.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw);
			cameraVerticalTranslation.applyQuaternion(orientationQuat);

			camera.up = up;
			camera.position.set(marblePosition.x, marblePosition.y, marblePosition.z).sub(directionVector.clone().multiplyScalar(2.5));
			camera.lookAt(Util.vecOimoToThree(marblePosition));
			camera.position.add(cameraVerticalTranslation);

			// Handle wall intersections:

			const closeness = 0.1;
			let rayCastOrigin = marblePosition.add(this.currentUp.scale(0.2));

			let processedShapes = new Set<OIMO.Shape>();
			for (let i = 0; i < 3; i++) {
				// Shoot rays from the marble to the postiion of the camera
				let rayCastDirection = Util.vecThreeToOimo(camera.position).sub(rayCastOrigin);
				rayCastDirection.addEq(rayCastDirection.clone().normalize().scale(2));

				let firstHit: OIMO.RayCastHit = null;
				let self = this;
				this.physics.world.rayCast(rayCastOrigin, rayCastOrigin.add(rayCastDirection), {
					process(shape, hit) {
						if (shape !== self.marble.shape && !processedShapes.has(shape) && (!firstHit || hit.fraction < firstHit.fraction)) {
							firstHit = Util.jsonClone(hit);
							processedShapes.add(shape);
						}
					}
				});

				if (firstHit) {
					// Construct a plane at the point of ray impact based on the normal
					let plane = new THREE.Plane();
					let normal = Util.vecOimoToThree(firstHit.normal).multiplyScalar(-1);
					let position = Util.vecOimoToThree(firstHit.position);
					plane.setFromNormalAndCoplanarPoint(normal, position);

					// Project the camera position onto the plane
					let target = new THREE.Vector3();
					let projected = plane.projectPoint(camera.position, target);

					// If the camera is too far from the plane anyway, break
					let dist = plane.distanceToPoint(camera.position);
					if (dist >= closeness) break;

					// Go the projected point and look at the marble
					camera.position.copy(projected.add(normal.multiplyScalar(closeness)));
					Util.cameraLookAtDirect(camera, Util.vecOimoToThree(marblePosition));

					let rotationAxis = new THREE.Vector3(1, 0, 0);
					rotationAxis.applyQuaternion(camera.quaternion);

					let theta = Math.atan(0.3 / 2.5); // 0.3 is the vertical translation, 2.5 the distance away from the marble.

					// Rotate the camera back upwards such that the marble is in the same visual location on screen as before
					camera.rotateOnWorldAxis(rotationAxis, theta);
					continue;
				}
				break;
			}

			this.lastVerticalTranslation = cameraVerticalTranslation;
		} else {
			// Simply look at the marble
			camera.position.copy(this.oobCameraPosition);
			camera.position.sub(this.lastVerticalTranslation)
			camera.lookAt(Util.vecOimoToThree(marblePosition));
			camera.position.add(this.lastVerticalTranslation);
		}
	}

	tick(time?: number) {
		if (this.paused || this.stopped) return;
		if (time === undefined) time = performance.now();
		let playReplay = this.replay.mode === 'playback';

		if (!playReplay && (gameButtons.use || this.useQueued)) {
			if (this.outOfBounds) {
				// Skip the out of bounce "animation" and restart immediately
				this.clearSchedule();
				this.restart();
			} else if (this.heldPowerUp && document.pointerLockElement) {
				this.replay.recordUsePowerUp(this.heldPowerUp);
				this.heldPowerUp.use(this.timeState);
			}
		}
		this.useQueued = false;

		if (this.lastPhysicsTick === null) {
			// If there hasn't been a physics tick yet, ensure there is one now
			this.lastPhysicsTick = time - 1000 / PHYSICS_TICK_RATE * 1.1;
		}

		/** Time since the last physics tick */
		let elapsed = time - this.lastPhysicsTick;
		if (elapsed >= 1000) {
			elapsed = 1000;
			this.lastPhysicsTick = time - 1000;
		}

		this.deltaMs = elapsed;

		let tickDone = false;
		// Make sure to execute the correct amount of ticks
		while (elapsed >= 1000 / PHYSICS_TICK_RATE) {
			// By ticking we advance time, so advance time.
			this.timeState.timeSinceLoad += 1000 / PHYSICS_TICK_RATE;
			this.timeState.currentAttemptTime += 1000 / PHYSICS_TICK_RATE;
			this.lastPhysicsTick += 1000 / PHYSICS_TICK_RATE;
			elapsed -= 1000 / PHYSICS_TICK_RATE;

			this.tickSchedule(this.timeState.currentAttemptTime);
			if (!playReplay) this.physics.step(); // Step the physics

			for (let shape of this.shapes) shape.tick(this.timeState);

			if (!playReplay) {
				// Update pathed interior positions after the physics tick because they will have changed position only after the physics tick was calculated, not during.
				for (let interior of this.interiors) if (interior instanceof PathedInterior) interior.updatePosition();
				this.marble.tick(this.timeState);
			}
			this.marble.updatePowerUpStates(this.timeState);
			
			this.jumpQueued = false;

			if (this.timeState.currentAttemptTime < GO_TIME && !playReplay) {
				// Lock the marble to the space above the start pad

				let startPad = this.shapes.find((element) => element instanceof StartPad);
				let position = this.marble.body.getPosition().clone();
				position.x = startPad.worldPosition.x;
				position.y = startPad.worldPosition.y;
				this.marble.body.setPosition(position);

				let vel = this.marble.body.getLinearVelocity();
				vel.x = vel.y = 0;
				this.marble.body.setLinearVelocity(vel);

				let angVel = this.marble.body.getAngularVelocity();
				// Cap the angular velocity so it doesn't go haywire
				if (angVel.length() > 60) angVel.normalize().scaleEq(60);
				this.marble.body.setAngularVelocity(angVel);

				this.marble.shape.setFriction(0);
			} else {
				this.marble.shape.setFriction(1);
			}
			
			if (this.finishTime) {
				let elapsed = this.timeState.currentAttemptTime - this.finishTime.currentAttemptTime;
				if (elapsed >= 2000 && finishScreenDiv.classList.contains('hidden') && this.replay.mode !== 'playback') {
					// Show the finish screen
					document.exitPointerLock();
					showFinishScreen();
				}
			}

			if (gameButtons.cameraLeft) this.yaw += 1.5 / PHYSICS_TICK_RATE;
			if (gameButtons.cameraRight) this.yaw -= 1.5 / PHYSICS_TICK_RATE;
			if (gameButtons.cameraUp) this.pitch -= 1.5 / PHYSICS_TICK_RATE;
			if (gameButtons.cameraDown) this.pitch += 1.5 / PHYSICS_TICK_RATE;

			this.particles.tick();
			tickDone = true;

			// Record or playback the replay
			if (!playReplay) this.replay.record();
			else {
				this.replay.playback();
				if (this.replay.isPlaybackComplete()) {
					stopAndExit();
					return;
				}
			}
						
			// Note: It is incorrect that this TT code here runs after physics and shape updating, it should run at the top of this loop's body. However, changing this code's position now would make all TT catches about ~8 milliseconds later, giving an unfair advantage to those who have already set leaderboard scores using the previous calculation. So, for the sake of score integrity, we're keeping it this way.
			if (this.timeState.currentAttemptTime >= GO_TIME) {
				if (this.currentTimeTravelBonus > 0) {
					// Subtract remaining time travel time
					this.currentTimeTravelBonus -= 1000 / PHYSICS_TICK_RATE;

					if (!this.timeTravelSound) {
						this.timeTravelSound = AudioManager.createAudioSource('timetravelactive.wav');
						this.timeTravelSound.node.loop = true;
						this.timeTravelSound.play();
					}
				} else {
					// Increase the gameplay time
					this.timeState.gameplayClock += 1000 / PHYSICS_TICK_RATE;

					this.timeTravelSound?.stop();
					this.timeTravelSound = null;
				}

				if (this.currentTimeTravelBonus < 0) {
					// If we slightly undershot the zero mark of the remaining time travel bonus, add the "lost time" back onto the gameplay clock:
					this.timeState.gameplayClock += -this.currentTimeTravelBonus;
					this.currentTimeTravelBonus = 0;
				}
			}

			if (!this.rewinding && !playReplay)
			{
				this.rewind.rewindManager.pushFrame(this.rewind.getCurrentFrame(1000 / PHYSICS_TICK_RATE)); // Fair enough, its a constant delta t
			}
		}


		if (this.rewinding && !playReplay)
		{
			this.rewind.rewindFrame(null);
			this.updateUI();
		}

		if (this.lastRewinding && !this.rewinding) // We just stopped rewinding, so edit out the replay
		{
			this.rewind.rewindManager.spliceReplay(this.timeState.currentAttemptTime);
		}

		this.lastRewinding = this.rewinding;

		this.updateGameState();

		AudioManager.updatePositionalAudio(this.timeState, camera.position, this.yaw);
		this.pitch = Math.max(-Math.PI/2 + Math.PI/4, Math.min(Math.PI/2 - 0.0001, this.pitch)); // The player can't look straight up
		if (tickDone) this.calculatePreemptiveTransforms();
	}

	/** Predicts the position of the marble in the next physics tick to allow for smooth, interpolated rendering. */
	calculatePreemptiveTransforms() {
		let vel = this.marble.body.getLinearVelocity();
		// Naive: Just assume the marble moves as if nothing was in its way and it continued with its current velocity.
		let predictedPosition = this.marble.body.getPosition().add(vel.scale(1 / PHYSICS_TICK_RATE)).add(this.physics.world.getGravity().scale(1 / PHYSICS_TICK_RATE**2 / 2));

		let angVel = this.marble.body.getAngularVelocity();
		let orientation = this.marble.body.getOrientation();
		let threeOrientation = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
		let changeQuat = new THREE.Quaternion();
		changeQuat.setFromAxisAngle(Util.vecOimoToThree(angVel).normalize(), angVel.length() / PHYSICS_TICK_RATE);
		changeQuat.multiply(threeOrientation);
		let predictedOrientation = new OIMO.Quat(threeOrientation.x, threeOrientation.y, threeOrientation.z, threeOrientation.w);

		this.marble.preemptivePosition = predictedPosition;
		this.marble.preemptiveOrientation = predictedOrientation;
	}

	/** Get the current interpolated orientation quaternion. */
	getOrientationQuat(time: TimeState) {
		let completion = Util.clamp((time.currentAttemptTime - this.orientationChangeTime) / 300, 0, 1);
		return this.oldOrientationQuat.clone().slerp(this.newOrientationQuat, completion);
	}

	/** Sets the current up vector and gravity with it. */
	setUp(vec: OIMO.Vec3, time: TimeState) {
		this.currentUp = vec;
		this.physics.world.setGravity(vec.scale(-1 * this.physics.world.getGravity().length()));

		let currentQuat = this.getOrientationQuat(time);
		let oldUp = new THREE.Vector3(0, 0, 1);
		oldUp.applyQuaternion(currentQuat);

		let quatChange = new THREE.Quaternion();
		// Instead of calculating the new quat from nothing, calculate it from the last one to guarantee the shortest possible rotation.
		quatChange.setFromUnitVectors(oldUp, Util.vecOimoToThree(vec));

		this.newOrientationQuat = quatChange.multiply(currentQuat);
		this.oldOrientationQuat = currentQuat;
		this.orientationChangeTime = time.currentAttemptTime;
	}

	setGravityIntensity(intensity: number) {
		let gravityVector = this.currentUp.scale(-1 * intensity);
		this.physics.world.setGravity(gravityVector);
	}

	onMouseMove(e: MouseEvent) {
		if (!document.pointerLockElement || this.finishTime || this.paused || this.replay.mode === 'playback') return;

		// temp
		let totalDistance = Math.hypot(e.movementX, e.movementY);
		if (totalDistance > 300 && location.search.includes('debug')) alert(totalDistance + ', ' + e.movementX + ' ' + e.movementY);

				// Strangely enough, Chrome really bugs out sometimes and flings the mouse into a random direction quickly. We try to catch that here and ignore the mouse movement if we detect it.
		if (totalDistance > 350 && this.previousMouseMovementDistance * 4 < totalDistance) {
			this.previousMouseMovementDistance *= 1.5; // Make the condition harder to hit the next time
			return;
		};
		this.previousMouseMovementDistance = totalDistance;

		let factor = Util.lerp(1 / 2500, 1 / 100, StorageManager.data.settings.mouseSensitivity);
		let yFactor = StorageManager.data.settings.invertYAxis? -1 : 1;
		let freeLook = StorageManager.data.settings.alwaysFreeLook || gameButtons.freeLook;

		if (freeLook) this.pitch += e.movementY * factor * yFactor;
		this.yaw -= e.movementX * factor;
	}

	pickUpPowerUp(powerUp: PowerUp) {
		if (this.heldPowerUp && powerUp.constructor === this.heldPowerUp.constructor) return false;
		this.heldPowerUp = powerUp;

		for (let overlayShape of this.overlayShapes) {
			if (overlayShape.dtsPath.includes("gem")) continue;

			// Show the corresponding icon in the HUD
			if (overlayShape.dtsPath === powerUp.dtsPath) this.overlayScene.add(overlayShape.group);
			else this.overlayScene.remove(overlayShape.group);
		}

		AudioManager.play(powerUp.sounds[0]);

		return true;
	}

	setPowerUp(powerUp: PowerUp) {
		if (this.heldPowerUp && powerUp.constructor === this.heldPowerUp.constructor) return false;
		this.heldPowerUp = powerUp;

		for (let overlayShape of this.overlayShapes) {
			if (overlayShape.dtsPath.includes("gem")) continue;

			// Show the corresponding icon in the HUD
			if (overlayShape.dtsPath === powerUp.dtsPath) this.overlayScene.add(overlayShape.group);
			else this.overlayScene.remove(overlayShape.group);
		}

		return true;
	}

	setPowerUpPreview(powerUp: PowerUp) {

		if (powerUp == null)
		{	
			for (let overlayShape of this.overlayShapes) {
				if (overlayShape.dtsPath.includes("gem")) continue;
				this.overlayScene.remove(overlayShape.group);
			}
		}
		else
		{
			if (this.heldPowerUp && powerUp.constructor === this.heldPowerUp.constructor) return false;

			for (let overlayShape of this.overlayShapes) {
				if (overlayShape.dtsPath.includes("gem")) continue;

				// Show the corresponding icon in the HUD
				if (overlayShape.dtsPath === powerUp.dtsPath) this.overlayScene.add(overlayShape.group);
				else this.overlayScene.remove(overlayShape.group);
			}

			return true;
		}
	}

	deselectPowerUp() {
		if (!this.heldPowerUp) return;
		this.heldPowerUp = null;

		for (let overlayShape of this.overlayShapes) {
			if (overlayShape.dtsPath.includes("gem")) continue;
			this.overlayScene.remove(overlayShape.group);
		}
	}

	updateUI()
	{
		displayGemCount(this.gemCount, this.totalGems);
		this.updateGameState();
		// this.setPowerUpPreview(null);
		// this.setPowerUpPreview(this.heldPowerUp);
	}

	pickUpGem() {
		this.gemCount++;
		let string: string;

		// Show a notification (and sound) based on the gems remaining
		if (this.gemCount === this.totalGems) {
			string = "You have all the gems, head for the finish!";
			AudioManager.play('gotallgems.wav');
		} else {
			string = "You picked up a gem.  ";

			let remaining = this.totalGems - this.gemCount;
			if (remaining === 1) {
				string += "Only one gem to go!";
			} else {
				string += `${remaining} gems to go!`;
			}

			AudioManager.play('gotgem.wav');
		}

		displayAlert(string);
		this.updateUI();
	}

	addTimeTravelBonus(bonus: number, timeToRevert: number) {
		if (this.currentTimeTravelBonus === 0) {
			this.timeState.gameplayClock -= timeToRevert;
			bonus -= timeToRevert;
		}

		this.currentTimeTravelBonus += bonus;
	}

	/** Triggers the out-of-bounds state. */
	goOutOfBounds() {
		if (this.outOfBounds || this.finishTime) return;

		this.updateCamera(this.timeState); // Update the camera at the point of OOB-ing
		this.outOfBounds = true;
		this.oobCameraPosition = camera.position.clone();
		setCenterText('outofbounds');
		AudioManager.play('whoosh.wav');

		this.oobSchedule = this.schedule(this.timeState.currentAttemptTime + 2000, () => this.restart());
	}

	touchFinish() {
		if (this.finishTime !== null || this.outOfBounds) return;

		this.replay.recordTouchFinish();

		if (this.gemCount < this.totalGems) {
			AudioManager.play('missinggems.wav');
			displayAlert("You can't finish without all the gems!!");
		} else {
			// The level was completed! Store the time of finishing.
			let finishAreaShape = this.shapes.find((shape) => shape instanceof EndPad).colliders[0].body.getShapeList();
			let completionOfImpact = this.physics.computeCompletionOfImpactWithShape(finishAreaShape);
			let toSubtract = (1 - completionOfImpact) * 1000 / PHYSICS_TICK_RATE;

			this.finishTime = Util.jsonClone(this.timeState);
			// Compute the precise finish time here
			this.finishTime.timeSinceLoad -= toSubtract;
			this.finishTime.currentAttemptTime -= toSubtract;
			if (this.currentTimeTravelBonus === 0) this.finishTime.gameplayClock -= toSubtract;
			this.finishTime.physicsTickCompletion = completionOfImpact;
			
			if (this.replay.mode === 'playback') this.finishTime = this.replay.finishTime;

			this.finishYaw = this.yaw;
			this.finishPitch = this.pitch;

			let endPad = this.shapes.find((shape) => shape instanceof EndPad) as EndPad;
			endPad.spawnFirework(this.timeState);

			displayAlert("Congratulations! You've finished!");
		}
	}

	/** Pauses the level. */
	pause() {
		this.paused = true;
		document.exitPointerLock();
		releaseAllButtons(); // Safety measure to prevent keys from getting stuck
		showPauseScreen();
	}

	/** Unpauses the level. */
	unpause() {
		this.paused = false;
		document.documentElement.requestPointerLock();
		hidePauseScreen();
		this.lastPhysicsTick = performance.now();
	}

	/** Ends the level irreversibly. */
	stop() {
		this.stopped = true;
		clearInterval(this.tickInterval);

		this.music.stop();
		for (let shape of this.shapes) {
			if (shape instanceof Tornado || shape instanceof DuctFan) shape.soundSource?.stop();
		}

		this.marble.rollingSound?.stop();
		this.marble.slidingSound?.stop();
		this.marble.helicopterSound?.stop();
		this.marble.shockAbsorberSound?.stop();
		this.marble.superBounceSound?.stop();

		AudioManager.stopAllAudio();
	}

	/** Returns how much percent the level has finished loading. */
	getLoadingCompletion() {
		return this.loadingState.total? this.loadingState.loaded / this.loadingState.total : 0;
	}
}