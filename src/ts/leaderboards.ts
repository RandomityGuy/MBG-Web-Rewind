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
}