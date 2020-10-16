import { Frame } from "./frame"
import { Util } from "../util"
import { Level } from "../level";

function compareListEquality(l1: any[],l2: any[]) {
    for (var i = 0; i < l1.length; i++)
    {
        if (l1[i] != l2[i])
        {
            return false;
        }
    }
    return true;
}

function interpolateList(l1: number[],l2: number[],ratio: number) {
    let ret = [];
    for (var i = 0; i < l1.length; i++)
    {
        ret.push(Util.lerp(l1[i],l2[i],ratio));
    }
    return ret;
}

export class RewindManager
{
    frames: Frame[];
    level: Level;
    streamTimePosition: number;
    currentIndex: number;

    pushFrame(frame: Frame) {
        this.frames.push(frame);
    }

    popFrame(peek: boolean) {
        if (peek)
        {
            return this.frames[this.frames.length-1];
        }
        return this.frames.pop();
    }

    getFrameAt(index: number) {
        return this.frames[index];
    }

    getFrameCount() {
        return this.frames.length;
    }

    clear() {
        this.frames = [];
    }

    interpolateFrame(one: Frame, two: Frame, ratio: number, delta: number) {
        let f = new Frame();
        f.deltaMs = delta;

        if (one.timebonus > 0 && two.timebonus > 0)
        {
            f.ms = Math.min(one.ms,two.ms); //Stop time while rewinding
        }
	    else
	    {
	    	f.ms = Util.lerp(one.ms, two.ms, ratio);
        }
        
        f.position = Util.lerpThreeVectors(one.position,two.position,ratio);
        f.rotation = one.rotation.clone().slerp(two.rotation,ratio);
        f.velocity = Util.lerpThreeVectors(one.velocity,two.velocity,ratio);
        f.spin = Util.lerpThreeVectors(one.velocity,two.velocity,ratio);

        f.powerup = two.powerup;

        let isTTpickedUp = compareListEquality(one.ttstates,two.ttstates);
        if (isTTpickedUp)
        {
            f.timebonus = two.timebonus;
        }
        else
        {
            f.timebonus = Util.lerp(one.timebonus,two.timebonus,ratio);
        }

        // Damnit arrays are passed by reference, cant copy contents using simply '='
        // Thanks that pathedinteriors are actually time based and not position based
        f.timeSinceLoad = Util.lerp(one.timeSinceLoad,two.timeSinceLoad,ratio);
        // These ones cant be interpolated properly so we just return the latter frame's state
        f.gemcount = two.gemcount;
        f.gemstates = [...two.gemstates];

        // Dayum everything has its own clock and things and things happen accurately at the set time because of the way everythings set up. So, no need to interpolate. Yes!!
        f.ttstates = [...two.ttstates];
        f.powerupstates = [...two.powerupstates];
        f.lmstates = [...two.lmstates];

        f.activepowstates = [...two.activepowstates];
        f.gravityDir = two.gravityDir.clone(); // Dont want funky gravity bugs, so dont interpolate this
        f.trapdoordirs = [...two.trapdoordirs];
        f.trapdoorcontacttime = [...two.trapdoorcontacttime];
        f.trapdoorcompletion = [...two.trapdoorcompletion];

        f.elapsedTime = Util.lerp(one.elapsedTime,two.elapsedTime,ratio);

        // Surprisingly this was much shorter than the code in RewindManager.cpp
        return f;
    }

    getRealtimeFrameAtMs(ms: number) {
        //basically do a binary search
    
        if (ms < this.frames[0].ms)
            return this.frames[0].clone();
        if (ms > this.frames[this.frames.length-1].ms)
            return this.frames[this.frames.length-1].clone();
    
        let lo = 0, hi = frames.length - 1;
        let m;
    
        let index0 = -1;
        let index1 = -2;
    
        while (lo <= hi)
        {
            m = Math.floor((lo + hi) / 2);
    
            if (this.frames[m].ms < ms)
                lo = m + 1;
            else if (this.frames[m].ms > ms)
                hi = m - 1;
            else
            {
                index0 = index1 = m;
                break;
            }
        }
    
        if (index0 == index1) //We did find the frame, no need to interpolate
            return this.frames[index0].clone();
    
        if (index0 == -1 && index1 == -2)	//We didnt find the exact frame, need to interpolate
        {
            index0 = lo;
            index1 = hi;
        }
    
    
        if (index0 > index1) //Sort the indexes to ascending order
        {
            let temp = index0;
            index0 = index1;
            index1 = temp;
        }
    
        let ratio = (ms - this.frames[index0].ms) / (this.frames[index1].ms - this.frames[index0].ms);
        return this.interpolateFrame(this.frames[index0],this.frames[index1],ratio,ms); //new Frame(interpolateFrame(Frames[index0], Frames[index1], ratio, ms));
    }

    getFrameAtElapsed(ms: number) {
        //basically do a binary search
    
        if (ms < this.frames[0].elapsedTime)
            return this.frames[0].clone();
        if (ms > this.frames[this.frames.length-1].elapsedTime)
            return this.frames[this.frames.length-1].clone();
    
        let lo = 0, hi = frames.length - 1;
        let m;
    
        let index0 = -1;
        let index1 = -2;
    
        while (lo <= hi)
        {
            m = Math.floor((lo + hi) / 2);
    
            if (this.frames[m].elapsedTime < ms)
                lo = m + 1;
            else if (this.frames[m].elapsedTime > ms)
                hi = m - 1;
            else
            {
                index0 = index1 = m;
                break;
            }
        }
    
        if (index0 == index1) //We did find the frame, no need to interpolate
            return this.frames[index0].clone();
    
        if (index0 == -1 && index1 == -2)	//We didnt find the exact frame, need to interpolate
        {
            index0 = lo;
            index1 = hi;
        }
    
    
        if (index0 > index1) //Sort the indexes to ascending order
        {
            let temp = index0;
            index0 = index1;
            index1 = temp;
        }
    
        let ratio = (ms - this.frames[index0].elapsedTime) / (this.frames[index1].elapsedTime - this.frames[index0].elapsedTime);
        return this.interpolateFrame(this.frames[index0],this.frames[index1],ratio,ms); //new Frame(interpolateFrame(Frames[index0], Frames[index1], ratio, ms));
    }

    getNextRewindFrame(delta: number) {
        if (delta < 0) return null;

        if (this.frames.length == 0) return null;

        if (this.frames.length >= 2)
        {
            if (delta < this.frames[this.frames.length-1].deltaMs)
            {
                let first = this.frames[this.frames.length - 1].clone();
                let second = this.frames[this.frames.length - 2].clone();
                this.frames.pop();

                let interpolated = this.interpolateFrame(first, second, delta / first.deltaMs, delta);

                this.frames.push(interpolated.clone());

                return interpolated;
            }
            else
            {
                let first = this.frames[this.frames.length - 1].clone();

                let deltaAccumulator = 0;
                let midframe = this.frames[this.frames.length - 1].clone();

                let outOfFrames = 0;

                while (deltaAccumulator < delta)
                {
                    if (this.frames.length == 0)
                    {
                        outOfFrames = 1;
                        break;
                    }
                    midframe = this.frames[this.frames.length - 1].clone();
                    this.frames.pop();
                    deltaAccumulator += midframe.deltaMs;
                }
                if (!outOfFrames)
                {
                    //this.frames.pop_back();

                    let lastframe = this.frames.length == 0 ? midframe : this.frames[this.frames.length-1].clone();

                    let interpolated = this.interpolateFrame(first, lastframe, delta /deltaAccumulator, deltaAccumulator - delta);

                    this.frames.push(interpolated.clone());
                    return interpolated;
                }
                else
                {
                    let interpolated = this.interpolateFrame(first, midframe, delta / deltaAccumulator, deltaAccumulator - delta);

                    this.frames.push(interpolated.clone());
                    return interpolated;
                }

            }
        }
        else
        {
            let ret = this.frames.pop();
            return ret;
        }
    }

    spliceReplay(ms: number) {
        let replay = this.level.replay;

        let idx = 0;

        // Get the indices at the point we need to splice, use binary search
        if (ms < replay.currentAttemptTimes[0]) idx = 0;
        else
        {
            if (ms > replay.currentAttemptTimes[replay.currentAttemptTimes.length-1])
                idx = replay.currentAttemptTimes.length - 1;
            else
            {
                let lo = 0, hi = replay.currentAttemptTimes.length - 1;
                let m;

                let index0 = -1;
                let index1 = -2;

                while (lo <= hi)
                {
                    m = Math.floor((lo + hi) / 2);

                    if (replay.currentAttemptTimes[m] < ms)
                        lo = m + 1;
                    else if (replay.currentAttemptTimes[m] > ms)
                        hi = m - 1;
                    else
                    {
                        index0 = index1 = m;
                        break;
                    }
                }

                if (index0 == index1) // We did find the frame, no need to interpolate
                    idx = index0;
                else
                if (index0 == -1 && index1 == -2)	// We didnt find the exact frame, need to interpolate
                {
                    index0 = lo;
                    index1 = hi;
                }

                idx = Math.max(index0,index1); // Should probably interpolate if this happens          
            }
        }

        replay.currentAttemptTimes = replay.currentAttemptTimes.slice(0,idx);
        replay.marblePositions = replay.marblePositions.slice(0,idx);
        replay.marbleOrientations = replay.marbleOrientations.slice(0,idx);
        replay.marbleLinearVelocities = replay.marbleLinearVelocities.slice(0,idx);
        replay.marbleAngularVelocities = replay.marbleAngularVelocities.slice(0,idx);
        
        // I scream

        function removeConditional(arr: any[],n: number) {
            let newArr = [];
            for (let element of arr)
            {
                if (element.tickIndex < n) newArr.push(element);
            }
            return newArr;
        }

        replay.marbleInside = removeConditional(replay.marbleInside,idx);
        replay.marbleEnter = removeConditional(replay.marbleEnter,idx);
        replay.marbleContact = removeConditional(replay.marbleContact,idx);
        replay.uses = removeConditional(replay.uses,idx);

        replay.cameraOrientations = replay.cameraOrientations.slice(0,idx);
        replay.rollingSoundGain = replay.rollingSoundGain.slice(0,idx);
        replay.rollingSoundPlaybackRate = replay.rollingSoundPlaybackRate.slice(0,idx);
        replay.slidingSoundGain = replay.slidingSoundGain.slice(0,idx);
        replay.jumpSoundTimes = replay.jumpSoundTimes.slice(0,idx);

        replay.bounceTimes = removeConditional(replay.bounceTimes,idx);

        replay.currentTickIndex = replay.currentAttemptTimes.length;

        
    }

    getNextFrame(delta: number) {
        this.streamTimePosition += delta;
        if (this.streamTimePosition < 0) this.streamTimePosition = 0;
        let timepos = this.streamTimePosition;

        let testF = this.getFrameAtElapsed(delta);

        if (testF == null) return null;

        return testF;
    }


}