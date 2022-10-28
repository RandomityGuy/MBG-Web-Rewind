import { Util } from "../util";
import { PowerUp } from "../shapes/power_up";
import { Vector3 } from "../math/vector3";
import { Quaternion } from "../math/quaternion";
import { Shape } from "../shape";
import { CheckpointTrigger } from "../triggers/checkpoint_trigger";
import { Gem } from "../shapes/gem";

export interface MPState // So basically interface is struct. good to know ig
{
	currentTime: number,
	targetTime: number,
	changeTime: number
}

export class Frame
{
	ms: number; // The time on the clock
	deltaMs: number; // The time delta between two successive frames
	position: Vector3; // The posititon of the marble
	rotation: Quaternion; // The rotation of the marble
	velocity: Vector3; // The velocity of the marble
	spin: Vector3; // The angular velocity of the marble
	powerup: PowerUp; // The powerup stored at that frame in the inventory
	timebonus: number; // The time at which a time bonus was picked
	timeSinceLoad: number; // the time since the level was loaded
	mpstates: MPState[]; // Stores pathedInterior states
	gemcount: number; // Number of gems collected
	gemstates: boolean[]; // List of visibilities of gems
	ttstates: number[]; // List of times since a time travel was collected
	powerupstates: number[]; // List of times a powerup was collected
	// gamestate: string // holy shit this is so deterministic, damn i didnt even need this
	lmstates: number[]; // List of times when a landmine exploded
	// nextstatetime: number // Damnnn
	activepowstates: number[]; // List of times when a Helicopter/ShockAbsorber/SuperBounce was used
	gravityDir: Vector3; // The "up" of the level
	trapdoordirs: number[]; // List of directions of trapdoor
	trapdoorcontacttime: number[]; // List of times when a trapdoor was touched
	trapdoorcompletion: number[]; // List of trapdoor completions
	elapsedTime: number; // same as timeSinceLoad
	physicsTime: number;
	lastContactNormal: Vector3;

	// MBU
	blast: number;

	// Checkpoint
	/** Stores the shape that is the destination of the current checkpoint. */
	currentCheckpoint: Shape = null;
	/** If the checkpoint was triggered by a trigger, this field stores that trigger. */
	currentCheckpointTrigger: CheckpointTrigger = null;
	checkpointCollectedGems = new Set<Gem>();
	checkpointHeldPowerUp: PowerUp = null;
	/** Up vector at the point of checkpointing */
	checkpointUp: Vector3 = null;
	checkpointBlast: number = null;
	respawnTimes = 0;

	randompupTimes: number[];

	teleportEnableTime: number;
	teleportDisableTime: number;

	teleportTimes: number[];


	clone() {
		let retf = new Frame();
		retf.ms = this.ms;
		retf.deltaMs = this.deltaMs;
		retf.position = this.position.clone();
		retf.rotation = this.rotation.clone();
		retf.velocity = this.velocity.clone();
		retf.spin = this.spin.clone();
		retf.powerup = this.powerup;
		retf.timebonus = this.timebonus;
		retf.timeSinceLoad = this.timeSinceLoad;
		retf.mpstates = [...this.mpstates];
		retf.gemcount = this.gemcount;
		retf.gemstates = [...this.gemstates];
		retf.ttstates = [...this.ttstates];
		retf.powerupstates = [...this.powerupstates];
		retf.lmstates = [...this.lmstates];
		retf.activepowstates = [...this.activepowstates];
		retf.gravityDir = this.gravityDir.clone();
		retf.trapdoordirs = [...this.trapdoordirs];
		retf.trapdoorcontacttime = [...this.trapdoorcontacttime];
		retf.trapdoorcompletion = [...this.trapdoorcompletion];
		retf.elapsedTime = this.elapsedTime;
		retf.physicsTime = this.physicsTime;
		retf.lastContactNormal = this.lastContactNormal;
		return retf;

	}
}