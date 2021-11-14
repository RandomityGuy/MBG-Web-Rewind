import { RewindManager } from "./rewind_manager";
import { Gem } from "../shapes/gem";
import { TimeTravel } from "../shapes/time_travel";
import { PowerUp } from "../shapes/power_up";
import { LandMine } from "../shapes/land_mine";
import { TrapDoor } from "../shapes/trap_door";
import { Frame, MPState } from "./frame";
import { Util } from "../util";
import { setEmitFlags } from "typescript";
import { PathedInterior } from "../pathed_interior";
import { RandomPowerUp } from "../shapes/random_power_up";
import { TeleportTrigger } from "../triggers/teleport_trigger";
import { Nuke } from "../shapes/nuke";

class MissionState {
	gemstates: boolean[] = [];
	ttstates: number[] = [];
	powerupstates: number[] = [];
	explosivestates: number[] = [];
	randompupstates: number[] = [];

	trapdoordirs: number[] = [];
	trapdoorcontacttime: number[] = [];
	trapdoorcompletion: number[] = [];
	teleportstates: number[] = [];
}

export class Rewind {
	rewindManager: RewindManager;
	timescale = 1;
	frameskip = 0; // Unused
	frameskipFramecounter = 0;
	matchfps: boolean;
	previousFrame: Frame;

	getPowerupTimeStates() {
		let m = this.rewindManager.level.marble;
		return [m.superBounceEnableTime,m.shockAbsorberEnableTime,m.helicopterEnableTime,m.megaMarbleEnableTime];
	}

	setPowerupTimeStates(state: number[]) {
		this.rewindManager.level.marble.superBounceEnableTime = state[0];
		this.rewindManager.level.marble.shockAbsorberEnableTime = state[1];
		this.rewindManager.level.marble.helicopterEnableTime = state[2];
		this.rewindManager.level.marble.megaMarbleEnableTime = state[3];
	}

	// Its really amazing how small these functions are as compared to how large they were in Rewind.cpp
	getMissionState() {
		let sceneobjects = this.rewindManager.level.shapes;
		let missionstate = new MissionState();
		for (let i = 0; i < sceneobjects.length;i++)
		{
			let obj = sceneobjects[i];
			if (obj instanceof Gem)
			{
				missionstate.gemstates.push((obj as Gem).pickedUp);
			}
			if (obj instanceof PowerUp)
			{
				if (obj instanceof TimeTravel)
				{
					missionstate.ttstates.push((obj as TimeTravel).lastPickUpTime);
				}
				else if (obj instanceof RandomPowerUp) {
					missionstate.powerupstates.push((obj as PowerUp).lastPickUpTime);
					missionstate.randompupstates.push((obj as RandomPowerUp).cooldownDuration);
					missionstate.randompupstates.push((obj as RandomPowerUp).pickedUpCount);
				}
				else
				{
					missionstate.powerupstates.push((obj as PowerUp).lastPickUpTime);
				}
			}
			if (obj instanceof LandMine || obj instanceof Nuke)
			{
				missionstate.explosivestates.push((obj as LandMine | Nuke).disappearTime);
			}
			if (obj instanceof TrapDoor)
			{
				let trapdoor = obj as TrapDoor;
				// Oh phew this isnt a hassle here
				missionstate.trapdoorcontacttime.push(trapdoor.lastContactTime);
				missionstate.trapdoorcompletion.push(trapdoor.lastCompletion);
				missionstate.trapdoordirs.push(trapdoor.lastDirection);
			}
		}
		for (let i = 0; i < this.rewindManager.level.triggers.length; i++) {
			let obj = this.rewindManager.level.triggers[i];
			if (obj instanceof TeleportTrigger) {
				missionstate.teleportstates.push(obj.entryTime);
				missionstate.teleportstates.push(obj.exitTime);
			}
		}
		return missionstate;
	}

	setMissionState(missionstate: MissionState) {
		let sceneobjects = this.rewindManager.level.shapes;

		for (let i = 0; i < sceneobjects.length; i++)
		{
			let obj = sceneobjects[i];
			if (obj instanceof Gem)
			{
				let state = missionstate.gemstates[0];
				missionstate.gemstates.splice(0,1);
				(obj as Gem).setHide(state);
			}
			if (obj instanceof PowerUp)
			{
				if (obj instanceof TimeTravel)
				{
					let state = missionstate.ttstates[0];
					missionstate.ttstates.splice(0,1);
					(obj as TimeTravel).lastPickUpTime = state;
				}
				else if (obj instanceof RandomPowerUp)
				{
					let state = missionstate.powerupstates[0];
					missionstate.powerupstates.splice(0,1);
					(obj as PowerUp).lastPickUpTime = state;

					state = missionstate.randompupstates[0];
					missionstate.randompupstates.splice(0, 1);
					(obj as RandomPowerUp).cooldownDuration = state;

					state = missionstate.randompupstates[0];
					missionstate.randompupstates.splice(0, 1);
					(obj as RandomPowerUp).pickedUpCount = state;

				} else
				{
					let state = missionstate.powerupstates[0];
					missionstate.powerupstates.splice(0,1);
					(obj as PowerUp).lastPickUpTime = state;
				}
			}
			if (obj instanceof LandMine || obj instanceof Nuke)
			{
				let state = missionstate.explosivestates[0];
				missionstate.explosivestates.splice(0,1);
				(obj as LandMine | Nuke).disappearTime = state;
			}
			if (obj instanceof TrapDoor)
			{
				let trapdoor = obj as TrapDoor;
				// Oh phew this isnt a hassle here
				let contacttime = missionstate.trapdoorcontacttime[0];
				let completion  = missionstate.trapdoorcompletion[0];
				let dir = missionstate.trapdoordirs[0];

				missionstate.trapdoorcontacttime.splice(0,1);
				missionstate.trapdoorcompletion.splice(0,1);
				missionstate.trapdoordirs.splice(0,1);

				trapdoor.lastContactTime = contacttime;
				trapdoor.lastCompletion = completion;
				trapdoor.lastDirection = dir;
			}
		}
		for (let i = 0; i < this.rewindManager.level.triggers.length; i++) {
			let obj = this.rewindManager.level.triggers[i];
			if (obj instanceof TeleportTrigger) {
				let entryTime = missionstate.teleportstates[0];
				let exitTime = missionstate.teleportstates[1];
				missionstate.teleportstates.splice(0, 2);
				obj.entryTime = entryTime;
				obj.exitTime = exitTime;
			}
		}
	}

	getMPStates() {
		let level = this.rewindManager.level;

		let states: MPState[] = [];

		for (let i = 0; i < level.interiors.length; i++)
		{
			let itr = level.interiors[i];
			if (itr instanceof PathedInterior)
			{
				let pi = itr as PathedInterior;
				if (pi.triggers.length > 0) // We'll just carefully monitor these
					states.push({currentTime: pi.currentTime, targetTime: pi.targetTime, changeTime: pi.changeTime});
			}
		}

		return states;
	}

	setMPStates(states: MPState[]) {
		let level = this.rewindManager.level;

		for (let i = 0; i < level.interiors.length; i++)
		{
			let itr = level.interiors[i];
			if (itr instanceof PathedInterior)
			{
				let pi = itr as PathedInterior;

				if (pi.triggers.length > 0) {
					let state = states[0];
					states.splice(0,1);
					pi.targetTime = state.targetTime;
					pi.changeTime = state.changeTime;
					pi.currentTime = state.currentTime;
				}
			}
		}

		return states;
	}

	getCurrentFrame(ms: number) {
		let marble = this.rewindManager.level.marble;
		let level = this.rewindManager.level;

		let f = new Frame();
		f.ms = ms;
		f.deltaMs = level.deltaMs;
		f.elapsedTime = level.timeState.currentAttemptTime;
		f.ms = level.timeState.gameplayClock;
		f.position = marble.body.position.clone();
		f.rotation = marble.body.orientation.clone();
		f.velocity = marble.body.linearVelocity.clone();
		f.spin = marble.body.angularVelocity.clone();
		f.powerup = level.heldPowerUp;
		f.timebonus = level.currentTimeTravelBonus;
		f.gemcount = level.gemCount;
		f.activepowstates = this.getPowerupTimeStates();
		f.gravityDir = level.currentUp.clone(); // Damn.. but this storing "up" has bugs though when using the actual MBG physics
		let missionstate = this.getMissionState();
		f.gemstates = missionstate.gemstates;
		f.ttstates = missionstate.ttstates;
		f.powerupstates = missionstate.powerupstates;
		f.trapdoordirs = missionstate.trapdoordirs;
		f.trapdoorcontacttime = missionstate.trapdoorcontacttime;
		f.trapdoorcompletion = missionstate.trapdoorcompletion;
		f.lmstates = missionstate.explosivestates;
		f.timeSinceLoad = level.timeState.timeSinceLoad;
		f.mpstates = this.getMPStates();
		f.physicsTime = level.timeState.physicsTickCompletion;
		f.lastContactNormal = level.marble.lastContactNormal.clone();
		f.blast = level.blastAmount;
		f.currentCheckpoint = level.currentCheckpoint;
		f.currentCheckpointTrigger = level.currentCheckpointTrigger;
		f.checkpointCollectedGems = new Set<Gem>(level.checkpointCollectedGems);
		f.checkpointHeldPowerUp = level.checkpointHeldPowerUp;
		f.checkpointUp = level.checkpointUp?.clone();
		f.checkpointBlast = level.checkpointBlast;
		f.respawnTimes = level.respawnTimes;
		f.randompupTimes = missionstate.randompupstates;
		f.teleportDisableTime = level.marble.teleportDisableTime;
		f.teleportEnableTime = level.marble.teleportEnableTime;
		f.teleportTimes = missionstate.teleportstates;

		return f;
	}

	rewindFrame(f: Frame) {
		let marble = this.rewindManager.level.marble;
		let level = this.rewindManager.level;

		level.outOfBounds = false;
		level.clearScheduleId('oobRestart');

		let rewindDelta = level.deltaMs;

		let framedata: Frame = null;

		if (this.rewindManager.getFrameCount() <= 1)
		{
			if (this.rewindManager.getFrameCount() != 0)
			{
				framedata = this.rewindManager.popFrame(false);
			}
		}
		else
		{
			if (this.timescale != 1 || this.frameskip != 0 || this.matchfps)
			{
				rewindDelta *= Math.max(this.timescale,0.1);
				framedata = this.rewindManager.getNextRewindFrame(rewindDelta);

				if (framedata == null)
				{
					framedata = this.previousFrame.clone();
				}
			}
			else
			{
				if (f == null)
				{
					framedata = this.rewindManager.popFrame(false);
				}
				else
				{
					framedata = f;
				}
				this.previousFrame = framedata.clone();
			}
			if (framedata != null) // Need to make this tower of checks since god knows what could possibly happen
			{
				this.previousFrame = framedata.clone();
			}
			else
			{
				framedata = this.previousFrame.clone();
			}
		}
		if (framedata != null)
		{
			this.previousFrame = framedata.clone();
		}
		else
		{
			if (this.previousFrame == null) return; // Rip us, if this ever happens
			framedata = this.previousFrame.clone();
		}

		level.currentTimeTravelBonus = framedata.timebonus;
		level.maxDisplayedTime = framedata.ms;
		level.timeState.currentAttemptTime = framedata.elapsedTime;
		level.timeState.gameplayClock = framedata.ms;
		level.timeState.timeSinceLoad = framedata.timeSinceLoad;
		level.timeState.physicsTickCompletion = framedata.physicsTime;
		level.blastAmount = framedata.blast;
		level.currentCheckpoint = framedata.currentCheckpoint;
		level.currentCheckpointTrigger = framedata.currentCheckpointTrigger;
		level.checkpointCollectedGems = framedata.checkpointCollectedGems;
		level.checkpointHeldPowerUp = framedata.checkpointHeldPowerUp;
		level.checkpointUp = framedata.checkpointUp?.clone();
		level.checkpointBlast = framedata.checkpointBlast;
		level.respawnTimes = framedata.respawnTimes;

        if (level.finishTime !== null) {
            level.finishTime = null;
            level.clearScheduleId('finishSchedule');
        }

		marble.body.position.copy(framedata.position);
		marble.body.orientation.copy(framedata.rotation);
		marble.body.linearVelocity.copy(framedata.velocity);
		marble.body.angularVelocity.copy(framedata.spin);
		marble.lastContactNormal.copy(framedata.lastContactNormal);
		marble.teleportDisableTime = framedata.teleportDisableTime;
		marble.teleportEnableTime = framedata.teleportEnableTime;

		let state = new MissionState();
		state.explosivestates = framedata.lmstates;
		state.gemstates = framedata.gemstates;
		state.powerupstates = framedata.powerupstates;
		state.ttstates = framedata.ttstates;
		state.trapdoordirs = framedata.trapdoordirs;
		state.trapdoorcompletion = framedata.trapdoorcompletion;
		state.trapdoorcontacttime = framedata.trapdoorcontacttime;
		state.randompupstates = framedata.randompupTimes;
		state.teleportstates = framedata.teleportTimes;

		this.setPowerupTimeStates(framedata.activepowstates);
		if (!Util.isSameVector(level.currentUp,framedata.gravityDir))
		{
			level.setUp(framedata.gravityDir, false);
			// Hacky things
			level.orientationChangeTime =  level.timeState.currentAttemptTime - 300;
			let oldorient = level.newOrientationQuat;
			level.newOrientationQuat = level.oldOrientationQuat;
			level.oldOrientationQuat = oldorient;
		}

		// more hacky gravity cam stuff
		let gravitycompletion = Util.clamp((level.timeState.currentAttemptTime - level.orientationChangeTime) / 300, 0, 1);
		if (gravitycompletion == 0)
		{
			level.newOrientationQuat = level.oldOrientationQuat;
			level.orientationChangeTime = -Infinity;
		}

		level.gemCount = framedata.gemcount;

		this.setMissionState(state);
		this.setMPStates(framedata.mpstates);

		//level = framedata.powerup;
		if (level.heldPowerUp == null)
		{
			if (framedata.powerup != null)
			{
				level.setPowerUp(framedata.powerup);
			}
		}
		else
		{
			if (framedata.powerup == null)
			{
				level.deselectPowerUp();
			}
			else
			{
				level.setPowerUp(framedata.powerup);
			}
		}


	}


}