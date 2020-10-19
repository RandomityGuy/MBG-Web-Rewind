import { RewindManager } from "./rewind_manager";
import { Gem } from "../shapes/gem";
import { TimeTravel } from "../shapes/time_travel";
import { PowerUp } from "../shapes/power_up";
import { LandMine } from "../shapes/land_mine";
import { TrapDoor } from "../shapes/trap_door";
import { Frame } from "./frame";
import { Util } from "../util";
import { setEmitFlags } from "typescript";

class MissionState {
    gemstates: boolean[] = [];
    ttstates: number[] = [];
    powerupstates: number[] = [];
    explosivestates: number[] = [];

    trapdoordirs: number[] = [];
    trapdoorcontacttime: number[] = [];
    trapdoorcompletion: number[] = [];
}

export class Rewind {
    rewindManager: RewindManager
    timescale: number = 1;
    frameskip: number = 0; // Unused
    matchfps: boolean;
    previousFrame: Frame;

    getPowerupTimeStates() {
        let m = this.rewindManager.level.marble;
        return [m.superBounceEnableTime,m.shockAbsorberEnableTime,m.helicopterEnableTime];
    }

    setPowerupTimeStates(state: number[]) {
        this.rewindManager.level.marble.superBounceEnableTime = state[0];
        this.rewindManager.level.marble.shockAbsorberEnableTime = state[1];
        this.rewindManager.level.marble.helicopterEnableTime = state[2];
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
                else
                {
                    missionstate.powerupstates.push((obj as PowerUp).lastPickUpTime);
                }
            }
            if (obj instanceof LandMine)
            {
                missionstate.explosivestates.push((obj as LandMine).disappearTime);
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
                else
                {
                    let state = missionstate.powerupstates[0];
                    missionstate.powerupstates.splice(0,1);
                    (obj as PowerUp).lastPickUpTime = state;
                }
            }
            if (obj instanceof LandMine)
            {
                let state = missionstate.explosivestates[0];
                missionstate.explosivestates.splice(0,1);
                (obj as LandMine).disappearTime = state;
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
    }

    getCurrentFrame(ms: number) {
        let marble = this.rewindManager.level.marble;
        let level = this.rewindManager.level;

        let f = new Frame();
        f.ms = ms;
        f.deltaMs = level.deltaMs;
        f.elapsedTime = level.timeState.currentAttemptTime;
        f.ms = level.timeState.gameplayClock;
        f.position = Util.vecOimoToThree(marble.body.getPosition());
        f.rotation = marble.body.getOrientation();
        f.velocity = Util.vecOimoToThree(marble.body.getLinearVelocity());
        f.spin = Util.vecOimoToThree(marble.body.getAngularVelocity());
        f.powerup = level.heldPowerUp;
        f.timebonus = level.currentTimeTravelBonus;
        f.gemcount = level.gemCount;
        f.activepowstates = this.getPowerupTimeStates();
        f.gravityDir = Util.vecOimoToThree(level.currentUp); // Damn.. but this storing "up" has bugs though when using the actual MBG physics
        let missionstate = this.getMissionState();
        f.gemstates = missionstate.gemstates;
        f.ttstates = missionstate.ttstates;
        f.powerupstates = missionstate.powerupstates;
        f.trapdoordirs = missionstate.trapdoordirs;
        f.trapdoorcontacttime = missionstate.trapdoorcontacttime;
        f.trapdoorcompletion = missionstate.trapdoorcompletion;
        f.lmstates = missionstate.explosivestates;
        f.timeSinceLoad = level.timeState.timeSinceLoad;

        return f;
    }

    rewindFrame(f: Frame) {
        let marble = this.rewindManager.level.marble;
        let level = this.rewindManager.level;

        level.outOfBounds = false;
        level.cancel(level.oobSchedule);
        
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
            framedata = this.previousFrame.clone();
        }

        level.currentTimeTravelBonus = framedata.timebonus;
        level.timeState.currentAttemptTime = framedata.elapsedTime;
        level.timeState.gameplayClock = framedata.ms;
        level.timeState.timeSinceLoad = framedata.timeSinceLoad;

        marble.body.setPosition(Util.vecThreeToOimo(framedata.position));
        marble.body.setOrientation(framedata.rotation);
        marble.body.setLinearVelocity(Util.vecThreeToOimo(framedata.velocity));
        marble.body.setAngularVelocity(Util.vecThreeToOimo(framedata.spin));

        let state = new MissionState();
        state.explosivestates = framedata.lmstates;
        state.gemstates = framedata.gemstates;
        state.powerupstates = framedata.powerupstates;
        state.ttstates = framedata.ttstates;
        state.trapdoordirs = framedata.trapdoordirs;
        state.trapdoorcompletion = framedata.trapdoorcompletion;
        state.trapdoorcontacttime = framedata.trapdoorcontacttime;

        this.setPowerupTimeStates(framedata.activepowstates);
        if (!Util.isSameVector(level.currentUp,framedata.gravityDir))
        {
            level.setUp(Util.vecThreeToOimo(framedata.gravityDir),level.timeState);
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