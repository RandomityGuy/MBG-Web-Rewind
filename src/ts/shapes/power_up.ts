import { Util } from "../util";
import { Shape } from "../shape";
import { TimeState } from "../level";
import { displayAlert } from "../ui/game";

/** Powerups can be collected and used by the player for bonus effects. */
export abstract class PowerUp extends Shape {
	lastPickUpTime: number = null;
	/** Reappears after this time. */
	cooldownDuration: number = 7000;
	/** Whether or not to automatically use the powerup instantly on pickup. */
	autoUse = false;
	ambientRotate = true;
	collideable = false;
	shareMaterials = false;
	/** The name of the powerup that is shown on pickup. */
	pickUpName: string;

	onMarbleInside(time: TimeState) {
		let pickupable = this.lastPickUpTime === null || (time.currentAttemptTime - this.lastPickUpTime) >= this.cooldownDuration;
		if (!pickupable) return;
		
		if (this.pickUp()) {
			this.lastPickUpTime = time.currentAttemptTime;
			if (this.autoUse) this.use(time);

			displayAlert(`You picked up a ${this.pickUpName}!`);
		}
	}

	render(time: TimeState) {
		super.render(time);

		let opacity = 1;
		if (this.lastPickUpTime && this.cooldownDuration > 0) {
			let availableTime = this.lastPickUpTime + this.cooldownDuration;
			opacity = Util.clamp((time.currentAttemptTime - availableTime) / 1000, 0, 1);
		}

		this.setOpacity(opacity);
	}

	reset() {
		this.lastPickUpTime = null;
	}

	/** If this function returns true, the pickup was successful. */
	abstract pickUp(): boolean;
	abstract use(time: TimeState): void;
}