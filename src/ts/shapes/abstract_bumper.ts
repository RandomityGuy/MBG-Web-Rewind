import { Shape } from "../shape";
import OIMO from "../declarations/oimo";
import { state } from "../state";
import { Util } from "../util";

export abstract class AbstractBumper extends Shape {
	wiggleAnimationStart = -Infinity;

	onMarbleContact(contact: OIMO.Contact, time: number) {
		let contactNormal = contact.getManifold().getNormal();
		if (contact.getShape1().userData === this.id) contactNormal = contactNormal.scale(-1);

		let marble = state.currentLevel.marble;
		
		marble.setLinearVelocityInDirection(contactNormal, 15, false);
		this.wiggleAnimationStart = time;
	}

	render(time: number) {
		super.render(time);

		let elapsed = Math.min(1e10, time - this.wiggleAnimationStart);
		let wiggleFactor = Util.clamp(1 - elapsed / 333, 0, 1);
		let sine = Util.lerp(0, Math.sin(elapsed / 50), wiggleFactor);
		let wiggleX = 1 + 0.4 * sine;
		let wiggleY = 1 - 0.4 * sine;

		this.group.scale.set(wiggleX, wiggleY, 1);
	}
}