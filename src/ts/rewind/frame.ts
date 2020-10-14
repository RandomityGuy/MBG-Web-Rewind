import OIMO from "../declarations/oimo";
import { Util } from "../util";
import * as THREE from "three";
import { Quaternion, Vector3 } from "three";
import { PowerUp } from "../shapes/power_up";

export class Frame
{
    ms: number
    deltaMs: number
    position: Vector3
    velocity: Vector3
    spin: Vector3
    powerup: PowerUp
    timebonus: number
    timeSinceLoad: number
    gemcount: number
    gemstates: boolean[]
    ttstates: number[]
    powerupstates: number[]
    // gamestate: string // holy shit this is so deterministic, damn i didnt even need this
    lmstates: number[]
    // nextstatetime: number // Damnnn
    activepowstates: number[]
    gravityDir: Vector3
    trapdoordirs: number[]
    trapdoorcontacttime: number[]
    trapdoorcompletion: number[]
    elapsedTime: number

    clone() {
        let retf = new Frame();
        retf.ms = this.ms;
        retf.deltaMs = this.deltaMs;
        retf.position = this.position.clone();
        retf.velocity = this.velocity.clone();
        retf.spin = this.spin.clone();
        retf.powerup = this.powerup;
        retf.timebonus = this.timebonus;
        retf.timeSinceLoad = this.timeSinceLoad;
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
        return retf;

    }
}