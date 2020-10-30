import OIMO from "../declarations/oimo";
import { Util } from "../util";
import * as THREE from "three";
import { Quaternion, Vector3 } from "three";
import { PowerUp } from "../shapes/power_up";
import { NumberLiteralType } from "typescript";

export interface MPState // So basically interface is struct. good to know ig
{
    currentTime: number,
    targetTime: number,
    changeTime: number
}

export class Frame
{
    ms: number // The time on the clock
    deltaMs: number // The time delta between two successive frames
    position: THREE.Vector3 // The posititon of the marble
    rotation: OIMO.Quat // The rotation of the marble
    velocity: THREE.Vector3 // The velocity of the marble
    spin: THREE.Vector3 // The angular velocity of the marble
    powerup: PowerUp // The powerup stored at that frame in the inventory
    timebonus: number // The time at which a time bonus was picked
    timeSinceLoad: number // the time since the level was loaded
    mpstates: MPState[] // Stores pathedInterior states
    gemcount: number // Number of gems collected
    gemstates: boolean[] // List of visibilities of gems
    ttstates: number[] // List of times since a time travel was collected
    powerupstates: number[] // List of times a powerup was collected
    // gamestate: string // holy shit this is so deterministic, damn i didnt even need this
    lmstates: number[] // List of times when a landmine exploded
    // nextstatetime: number // Damnnn
    activepowstates: number[] // List of times when a Helicopter/ShockAbsorber/SuperBounce was used
    gravityDir: THREE.Vector3 // The "up" of the level
    trapdoordirs: number[] // List of directions of trapdoor
    trapdoorcontacttime: number[] // List of times when a trapdoor was touched
    trapdoorcompletion: number[] // List of trapdoor completions
    elapsedTime: number // same as timeSinceLoad
    physicsTime: number

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
        return retf;

    }
}