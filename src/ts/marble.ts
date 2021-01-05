import OIMO from "./declarations/oimo";
import * as THREE from "three";
import { ResourceManager } from "./resources";
import { isPressed, gamepadAxes } from "./input";
import { PHYSICS_TICK_RATE, TimeState, Level, GO_TIME } from "./level";
import { Shape } from "./shape";
import { Util } from "./util";
import { AudioManager, AudioSource } from "./audio";
import { StorageManager } from "./storage";
import { MisParser } from "./parsing/mis_parser";

export const MARBLE_RADIUS = 0.2;
export const MARBLE_ROLL_FORCE = 40 || 40;

export const bounceParticleOptions = {
	ejectionPeriod: 1,
	ambientVelocity: new THREE.Vector3(0, 0, 0.0),
	ejectionVelocity: 2.6,
	velocityVariance: 0.25 * 0.5,
	emitterLifetime: 4,
	inheritedVelFactor: 0,
	particleOptions: {
		texture: 'particles/star.png',
		blending: THREE.NormalBlending,
		spinSpeed: 90,
		spinRandomMin: -90,
		spinRandomMax: 90,
		lifetime: 500,
		lifetimeVariance: 100,
		dragCoefficient: 0.5,
		acceleration: -2,
		colors: [{r: 0.9, g: 0, b: 0, a: 1}, {r: 0.9, g: 0.9, b: 0, a: 1}, {r: 0.9, g: 0.9, b: 0, a: 0}],
		sizes: [0.25, 0.25, 0.25],
		times: [0, 0.75, 1]
	}
};

/** Controls marble behavior and responds to player input. */
export class Marble {
	level: Level;
	group: THREE.Group;
	sphere: THREE.Mesh;
	shape: OIMO.Shape;
	body: OIMO.RigidBody;
	/** The predicted position of the marble in the next tick. */
	preemptivePosition: OIMO.Vec3;
	/** The predicted orientation of the marble in the next tick. */
	preemptiveOrientation: OIMO.Quat;

	/** The default jump impulse of the marble. */
	jumpImpulse = 7.3; // For now, seems to fit more.
	/** The default restitution of the marble. */
	bounceRestitution = 0.5;

	/** Forcefield around the player shown during super bounce and shock absorber usage. */
	forcefield: Shape;
	/** Helicopter shown above the marble shown during gyrocopter usage. */
	helicopter: Shape;
	superBounceEnableTime = -Infinity;
	shockAbsorberEnableTime = -Infinity;
	helicopterEnableTime = -Infinity;
	helicopterSound: AudioSource = null;
	shockAbsorberSound: AudioSource = null;
	superBounceSound: AudioSource = null;

	lastPos = new OIMO.Vec3();
	lastVel = new OIMO.Vec3();
	lastAngVel = new OIMO.Vec3();
	/** Necessary for super speed. */
	lastContactNormal = new OIMO.Vec3(0, 0, 1);
	/** Keep track of when the last collision happened to avoid handling collision with the same object twice in a row. */
	collisionTimeout = 0;
	
	rollingSound: AudioSource;
	slidingSound: AudioSource;

	constructor(level: Level) {
		this.level = level;
	}

	async init() {
		this.group = new THREE.Group();

		if (this.level.mission.misFile.marbleAttributes["jumpImpulse"] !== undefined) 
			this.jumpImpulse = MisParser.parseNumber(this.level.mission.misFile.marbleAttributes["jumpImpulse"]);
		if (this.level.mission.misFile.marbleAttributes["bounceRestitution"] !== undefined) 
			this.bounceRestitution = MisParser.parseNumber(this.level.mission.misFile.marbleAttributes["bounceRestitution"]);

		// Get the correct texture
		let marbleTexture: THREE.Texture;
		let customTextureBlob = await StorageManager.databaseGet('keyvalue', 'marbleTexture');
		if (customTextureBlob) {
			try {
				let url = ResourceManager.getUrlToBlob(customTextureBlob);
				marbleTexture = await ResourceManager.getTexture(url, false, '');
			} catch (e) {
				console.error("Failed to load custom marble texture:", e);
			}
		} else {
			marbleTexture = await ResourceManager.getTexture("shapes/balls/base.marble.png");
		}

		// Create the 3D object
        let geometry = new THREE.SphereBufferGeometry(MARBLE_RADIUS, 32, 32);
		let sphere = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({map: marbleTexture, color: 0xffffff}));
		sphere.castShadow = true;
		this.sphere = sphere;
		this.group.add(sphere);

		// Create the collision geometry
		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = new OIMO.SphereGeometry(MARBLE_RADIUS);
		shapeConfig.friction = 1;
		shapeConfig.restitution = this.bounceRestitution;
		let shape = new OIMO.Shape(shapeConfig);

		let config = new OIMO.RigidBodyConfig();
		let body = new OIMO.RigidBody(config);
		body.addShape(shape);
		body.setAutoSleep(false);

		this.body = body;
		this.shape = shape;

		this.forcefield = new Shape();
		this.forcefield.dtsPath = "shapes/images/glow_bounce.dts";
		await this.forcefield.init(this.level);
		this.forcefield.setOpacity(0);
		this.forcefield.showSequences = false; // Hide the weird default animation it does
		this.sphere.add(this.forcefield.group);

		this.helicopter = new Shape();
		// Easter egg: Due to an iconic bug where the helicopter would instead look like a glow bounce, this can now happen 0.1% of the time.
		this.helicopter.dtsPath = (Math.random() < 1 / 1000)? "shapes/images/glow_bounce.dts" : "shapes/images/helicopter.dts";
		this.helicopter.castShadow = true;
		await this.helicopter.init(this.level);
		this.helicopter.setOpacity(0);
		this.group.add(this.helicopter.group);

		// Load the necessary rolling sounds
		await AudioManager.loadBuffers(["jump.wav", "bouncehard1.wav", "bouncehard2.wav", "bouncehard3.wav", "bouncehard4.wav", "rolling_hard.wav", "sliding.wav"]);

		this.rollingSound = AudioManager.createAudioSource('rolling_hard.wav');
		this.rollingSound.play();
		this.rollingSound.gain.gain.value = 0;
		this.rollingSound.node.loop = true;

		this.slidingSound = AudioManager.createAudioSource('sliding.wav');
		this.slidingSound.play();
		this.slidingSound.gain.gain.value = 0;
		this.slidingSound.node.loop = true;

		await Promise.all([this.rollingSound.promise, this.slidingSound.promise]);

		if (StorageManager.data.settings.reflectiveMarble) {
			// Add environment map reflection to the marble
			sphere.material.envMap = this.level.envMap;
			sphere.material.combine = THREE.MixOperation;
			sphere.material.reflectivity = 0.15;
		}
	}

	tick(time: TimeState) {
		// Construct the raw movement vector from inputs
		let movementVec = new THREE.Vector3(0, 0, 0);
		if (isPressed('up')) movementVec.add(new THREE.Vector3(1, 0, 0));
		if (isPressed('down')) movementVec.add(new THREE.Vector3(-1, 0, 0));
		if (isPressed('left')) movementVec.add(new THREE.Vector3(0, 1, 0));
		if (isPressed('right')) movementVec.add(new THREE.Vector3(0, -1, 0));
		
		// Add gamepad input and restrict if necessary
		movementVec.add(new THREE.Vector3(-gamepadAxes.marbleY, -gamepadAxes.marbleX));
		if (movementVec.x > 1.0)
			movementVec.x = 1.0;
		if (movementVec.x < -1.0)
			movementVec.x = -1.0;
		if (movementVec.y > 1.0)
			movementVec.y = 1.0;
		if (movementVec.y < -1.0)
			movementVec.y = -1.0;

		let inputStrength = movementVec.length();

		// Rotate the vector accordingly
		movementVec.multiplyScalar(MARBLE_ROLL_FORCE * 5 / PHYSICS_TICK_RATE);
		movementVec.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.level.yaw);

		let quat = this.level.newOrientationQuat;
		movementVec.applyQuaternion(quat);

		// Try to find a touching contact
		let current = this.body.getContactLinkList();
		let touching: OIMO.ContactLink;
		let allContactNormals: OIMO.Vec3[] = []; // Keep a list of all contact normals here
		while (current) {
			let contact = current.getContact();
			if (contact.isTouching()) {
				touching = current;
				
				// Update the contact to fix artifacts
				let contact = current.getContact();
				contact._updateManifold();
				contact._postSolve();

				let contactNormal = contact.getManifold().getNormal();
				let surfaceShape = contact.getShape2();
				if (surfaceShape === this.shape) {
					// Invert the normal based on shape order
					contactNormal = contactNormal.scale(-1);
					surfaceShape = contact.getShape1();
				}

				allContactNormals.push(contactNormal);
			}

			current = current.getNext();
		}
		current = touching; // Take the last touching contact. Only doing collision logic with one contact normal might seem questionable, but keep in mind that there almost always will be only one.

		// The axis of rotation (for angular velocity) is the cross product of the current up vector and the movement vector, since the axis of rotation is perpendicular to both.
		let movementRotationAxis = this.level.currentUp.cross(Util.vecThreeToOimo(movementVec));

		this.collisionTimeout--;

		if (current) {
			let contact = current.getContact();
			//let contactNormal = contact.getManifold().getNormal();
			let surfaceShape = contact.getShape2();
			if (surfaceShape === this.shape) surfaceShape = contact.getShape1();
			let contactNormal = Util.last(allContactNormals);
			this.lastContactNormal = contactNormal;
			let inverseContactNormal = contactNormal.scale(-1);

			// How much the current surface is pointing up
			let contactNormalUpDot = Math.abs(contactNormal.dot(this.level.currentUp));
			let collisionTimeoutNeeded = false;

			// The rotation necessary to get from the up vector to the contact normal.
			let contactNormalRotation = new OIMO.Quat();
			contactNormalRotation.setArc(this.level.currentUp, contactNormal);
			movementRotationAxis.mulMat3Eq(contactNormalRotation.toMat3());

			let lastSurfaceRelativeVelocity = this.lastVel.sub(surfaceShape.getRigidBody().getLinearVelocity());
			let surfaceRelativeVelocity = this.body.getLinearVelocity().sub(surfaceShape.getRigidBody().getLinearVelocity());
			let maxDotSlide = 0.5; // 30°

			// Implements sliding: If we hit the surface at an angle below 45°, and have movement keys pressed, we don't bounce.
			let dot0 = -contactNormal.dot(lastSurfaceRelativeVelocity.clone().normalize());
			if (dot0 > 0.001 && dot0 <= maxDotSlide && movementVec.length() > 0) {
				let dot = contactNormal.dot(surfaceRelativeVelocity);
				let linearVelocity = this.body.getLinearVelocity();
				let originalLength = linearVelocity.length();
				linearVelocity.addEq(contactNormal.scale(-dot)); // Remove all velocity in the direction of the surface normal

				let newLength = this.body.getLinearVelocity().length();
				let diff = originalLength - newLength;
				linearVelocity.normalize().scaleEq(newLength + diff * 2); // Give a small speedboost

				this.body.setLinearVelocity(linearVelocity);
			}

			// If we're using a shock absorber, give the marble a velocity boost on contact based on its angular velocity.
			outer:
			if (time.currentAttemptTime - this.shockAbsorberEnableTime < 5000) {
				let dot = -this.lastVel.dot(contactNormal);
				if (dot < 0) break outer;

				let boost = this.lastAngVel.cross(contactNormal).scale(dot / 300);
				this.body.addLinearVelocity(boost);
			}

			// Create a certain velocity boost on collisions with walls based on angular velocity. This assists in making wall-hits feel more natural.
			outer:
			if (this.collisionTimeout <= 0) {
				let angularBoost = this.body.getAngularVelocity().cross(contactNormal).scale((1 - contactNormal.dot(this.level.currentUp)) * contactNormal.dot(this.body.getLinearVelocity()) / (Math.PI * 2) / 15);
				if (angularBoost.length() < 0.01) break outer;

				// Remove a bit of the current velocity so that the response isn't too extreme
				let currentVelocity = this.body.getLinearVelocity();
				let ratio = angularBoost.length() / currentVelocity.length();
				currentVelocity = currentVelocity.scale(1 / (1 + ratio * 0.5)).add(angularBoost);
				this.body.setLinearVelocity(currentVelocity);

				collisionTimeoutNeeded = true;
			}

			// See if, out of all contact normals, there is one that's not at a 90° angle to the up vector.
			let allContactNormalUpDots = allContactNormals.map(x => Math.abs(x.dot(this.level.currentUp)));
			if (this.collisionTimeout <= 0 && (isPressed('jump') || this.level.jumpQueued) && allContactNormalUpDots.find(x => x > 1e-10)) {
				// Handle jumping
				this.setLinearVelocityInDirection(contactNormal, this.jumpImpulse + surfaceShape.getRigidBody().getLinearVelocity().dot(contactNormal), true, () => {
					this.playJumpSound();
					collisionTimeoutNeeded = true;
					if (this.level.replay.canStore) this.level.replay.jumpSoundTimes.push(this.level.replay.currentTickIndex);
				});
			}

			let impactVelocity = -contactNormal.dot(this.lastVel.sub(surfaceShape.getRigidBody().getLinearVelocity()));
			if (this.collisionTimeout <= 0) {
				// Create bounce particles
				if (impactVelocity > 6) this.showBounceParticles();

				let volume = Util.clamp((impactVelocity / 12)**1.5, 0, 1);

				if (impactVelocity > 1) {
					// Play a collision impact sound
					this.playBounceSound(volume);
					collisionTimeoutNeeded = true;
					if (this.level.replay.canStore) this.level.replay.bounceTimes.push({ tickIndex: this.level.replay.currentTickIndex, volume: volume, showParticles: impactVelocity > 6 });
				}
			}

			// Handle rolling and sliding sounds
			if (contactNormal.dot(surfaceRelativeVelocity) < 0.01) {
				let predictedMovement = this.body.getAngularVelocity().cross(this.level.currentUp).scale(1 / Math.PI / 2);
				// The expected movement based on the current angular velocity. If actual movement differs too much, we consider the marble to be "sliding".

				if (predictedMovement.dot(surfaceRelativeVelocity) < -0.00001 || (predictedMovement.length() > 0.5 && predictedMovement.length() > surfaceRelativeVelocity.length() * 1.5)) {
					this.slidingSound.gain.gain.value = 0.6;
					this.rollingSound.gain.gain.value = 0;
				} else {
					this.slidingSound.gain.gain.value = 0;
					let pitch = Util.clamp(surfaceRelativeVelocity.length() / 15, 0, 1) * 0.75 + 0.75;

					this.rollingSound.gain.gain.linearRampToValueAtTime(Util.clamp(pitch - 0.75, 0, 1), AudioManager.context.currentTime + 0.02);
					this.rollingSound.node.playbackRate.value = pitch;
				}
			} else {
				this.slidingSound.gain.gain.value = 0;
				this.rollingSound.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
			}

			// Weaken the marble's angular power based on the friction and steepness of the surface
			let dot = Util.vecThreeToOimo(movementVec).normalize().dot(inverseContactNormal);
			let penalty = Math.max(0, dot - Math.max(0, (surfaceShape.getFriction() - 1.0)));
			movementRotationAxis = movementRotationAxis.scale(1 - penalty);

			// Handle velocity slowdown
			let angVel = this.body.getAngularVelocity();
			let direction = movementRotationAxis.clone().normalize();
			let dot2 = Math.max(0, angVel.dot(direction));
			angVel = angVel.sub(direction.scale(dot2));
			angVel = angVel.scale(0.02 ** (1 / PHYSICS_TICK_RATE));
			angVel = angVel.add(direction.scale(dot2));
		 	if (time.currentAttemptTime >= GO_TIME)	this.body.setAngularVelocity(angVel);

			if (dot2 + movementRotationAxis.length() > 12 * Math.PI*2 * inputStrength / contactNormalUpDot) {
				// Cap the rolling velocity
				let newLength = Math.max(0, 12 * Math.PI*2 * inputStrength / contactNormalUpDot - dot2);
				movementRotationAxis = movementRotationAxis.normalize().scale(newLength);
			}

			if (collisionTimeoutNeeded) this.collisionTimeout = 2;
		}

		// Handle airborne movement
		if (!current) {
			// Angular acceleration isn't quite as speedy
			movementRotationAxis = movementRotationAxis.scale(1/2);

			let airMovementVector = new OIMO.Vec3(movementVec.x, movementVec.y, movementVec.z);
			let airVelocity = (time.currentAttemptTime - this.helicopterEnableTime) < 5000 ? 5 : 3.2; // Change air velocity for the helicopter
			if (this.level.finishTime) airVelocity = 0;
			airMovementVector = airMovementVector.scale(airVelocity / PHYSICS_TICK_RATE);
			this.body.addLinearVelocity(airMovementVector);

			this.slidingSound.gain.gain.value = 0;
			this.rollingSound.gain.gain.linearRampToValueAtTime(0, AudioManager.context.currentTime + 0.02);
		}

		// Apply angular acceleration, but make sure the angular velocity doesn't exceed some maximum
		this.body.setAngularVelocity(Util.addToVectorCapped(this.body.getAngularVelocity(), movementRotationAxis, 120));

		this.lastPos = this.body.getPosition();
		this.lastVel = this.body.getLinearVelocity();
		this.lastAngVel = this.body.getAngularVelocity();

		// Store sound state in the replay
		let r = this.level.replay;
		if (r.canStore) {
			r.rollingSoundGain.push(this.rollingSound.gain.gain.value);
			r.rollingSoundPlaybackRate.push(this.rollingSound.node.playbackRate.value);
			r.slidingSoundGain.push(this.slidingSound.gain.gain.value);
		}	
	}

	updatePowerUpStates(time: TimeState) {
		if (time.currentAttemptTime - this.shockAbsorberEnableTime < 5000) {
			// Show the shock absorber (takes precedence over super bounce)
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(0);

			if (!this.shockAbsorberSound) {
				this.shockAbsorberSound = AudioManager.createAudioSource('superbounceactive.wav');
				this.shockAbsorberSound.node.loop = true;
				this.shockAbsorberSound.play();
			}
		} else if (time.currentAttemptTime - this.superBounceEnableTime < 5000) {
			// Show the super bounce
			this.forcefield.setOpacity(1);
			this.shape.setRestitution(1.6); // Found through experimentation

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
		} else {
			// Stop both shock absorber and super bounce
			this.forcefield.setOpacity(0);
			this.shape.setRestitution(this.bounceRestitution);

			this.shockAbsorberSound?.stop();
			this.shockAbsorberSound = null;
			this.superBounceSound?.stop();
			this.superBounceSound = null;
		}
		if (time.currentAttemptTime - this.superBounceEnableTime < 5000 && !this.superBounceSound) {
			// Play the super bounce sound
			this.superBounceSound = AudioManager.createAudioSource('forcefield.wav');
			this.superBounceSound.node.loop = true;
			this.superBounceSound.play();
		}

		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) {
			// Show the helicopter
			this.helicopter.setOpacity(1);
			this.helicopter.setTransform(new THREE.Vector3(), this.level.newOrientationQuat, new THREE.Vector3(1, 1, 1));
			this.level.setGravityIntensity(this.level.defaultGravity * 0.25);
			
			if (!this.helicopterSound) {
				this.helicopterSound = AudioManager.createAudioSource('use_gyrocopter.wav');
				this.helicopterSound.node.loop = true;
				this.helicopterSound.play();
			}
		} else {
			// Stop the helicopter
			this.helicopter.setOpacity(0);
			this.level.setGravityIntensity(this.level.defaultGravity);

			this.helicopterSound?.stop();
			this.helicopterSound = null;
		}
	}

	playJumpSound() {
		AudioManager.play(['jump.wav']);
	}

	playBounceSound(volume: number) {
		AudioManager.play(['bouncehard1.wav', 'bouncehard2.wav', 'bouncehard3.wav', 'bouncehard4.wav'], volume);
	}

	showBounceParticles() {
		this.level.particles.createEmitter(bounceParticleOptions, Util.vecOimoToThree(this.body.getPosition()));
	}

	/** Sets linear velocity in a specific direction, but capped. Used for things like jumping and bumpers. */
	setLinearVelocityInDirection(direction: OIMO.Vec3, magnitude: number, onlyIncrease: boolean, onIncrease: () => any = () => {}) {
		let unitVelocity = this.body.getLinearVelocity().clone().normalize();
		let dot = unitVelocity.dot(direction);
		let directionalSpeed = dot * this.body.getLinearVelocity().length();

		if ((directionalSpeed < magnitude || !onlyIncrease)) {
			let velocity = this.body.getLinearVelocity();
			velocity = velocity.sub(direction.scale(directionalSpeed));
			velocity = velocity.add(direction.scale(magnitude));

			this.body.setLinearVelocity(velocity);
			onIncrease();
		}
	}

	render(time: TimeState) {
		// Position based on current and predicted position and orientation
		let bodyPosition = Util.lerpOimoVectors(this.body.getPosition(), this.preemptivePosition, time.physicsTickCompletion);
		let bodyOrientation = this.body.getOrientation().slerp(this.preemptiveOrientation, time.physicsTickCompletion);
		this.group.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
		this.sphere.quaternion.set(bodyOrientation.x, bodyOrientation.y, bodyOrientation.z, bodyOrientation.w);

		this.forcefield.render(time);
		if (time.currentAttemptTime - this.helicopterEnableTime < 5000) this.helicopter.render(time);
	}

	enableSuperBounce(time: TimeState) {
		this.superBounceEnableTime = time.currentAttemptTime;
	}

	enableShockAbsorber(time: TimeState) {
		this.shockAbsorberEnableTime = time.currentAttemptTime;
	}

	enableHelicopter(time: TimeState) {
		this.helicopterEnableTime = time.currentAttemptTime;
	}

	reset() {
		this.body.setLinearVelocity(new OIMO.Vec3());
		this.body.setAngularVelocity(new OIMO.Vec3());
		this.superBounceEnableTime = -Infinity;
		this.shockAbsorberEnableTime = -Infinity;
		this.helicopterEnableTime = -Infinity;
		this.lastContactNormal = new OIMO.Vec3(0, 0, 1);
		this.lastVel = new OIMO.Vec3();
	}
}