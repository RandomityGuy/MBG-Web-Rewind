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

    static async upload_top_replay(mission: string, score: number, replayId: string) {
        var scores = await this.get_scores(mission,1);
        if (scores[0]?.[1] >= score) {

            let replayData = await StorageManager.databaseGet('replays', replayId) as ArrayBuffer;
            if (!replayData) return;

            await fetch(`./leaderboards/uploadreplay?mission=${decodeURIComponent(mission)}&time=${decodeURIComponent(score.toString())}`, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: replayData
             } );            
        }
    }
}