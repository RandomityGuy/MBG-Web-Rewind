import { Replay } from "./replay";
import { ResourceManager } from "./resources";
import { StorageManager } from "./storage";

export class Leaderboards
{
    static async get_scores(mission: String,count: number = 100) {

        let response = await fetch('./leaderboards?' + new URLSearchParams(
            {
                mission: mission.toString(),
                count: count.toString()
            })
            );
        return await response.json();
    }

    static async post_score(mission: String, username: string, score: number) {
        await fetch('./leaderboards', {
            method: "POST",
            headers: {
				'Content-Type': 'application/json',
			},
            body: JSON.stringify({
                "mission": mission,
                "username": username,
                "score": score
            })
         } );
    }

    static async upload_top_replay(mission: string, score: number, replayData: ArrayBuffer) {
        let scores = await this.get_scores(mission,1);
        if (scores[0]?.[1] >= score || scores.length === 0) {
            await fetch(`./leaderboards/uploadreplay?mission=${decodeURIComponent(mission)}&time=${decodeURIComponent(score.toString())}`, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: replayData
             } );       
        }
    }

    static async get_top_replay(mission: string) {
        let resp = await fetch(`./leaderboards/replay?mission=${decodeURIComponent(mission)}`, {
            method: "GET"
        });

        let file = await resp.blob();

        let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(file);

        return arrayBuffer;
    }

    static async has_top_replay(mission: string) {
        let resp = await fetch(`./leaderboards/has_replay?mission=${decodeURIComponent(mission)}`, {
            method: "GET"
        });
        let t = await resp.text();
        if (t === "true") return true;
        else return false;
    }
}