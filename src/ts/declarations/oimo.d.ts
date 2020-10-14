import { oimo } from "oimophysics";

// This file maps the types from the npm package so that they line up with those exported from the oimo.js file.

declare namespace OIMO {
	const RigidBody: typeof oimo.dynamics.rigidbody.RigidBody;
	type RigidBody = oimo.dynamics.rigidbody.RigidBody;

	const RigidBodyConfig: typeof oimo.dynamics.rigidbody.RigidBodyConfig;
	type RigidBodyConfig = oimo.dynamics.rigidbody.RigidBodyConfig;

	const RigidBodyType: typeof oimo.dynamics.rigidbody.RigidBodyType;
	type RigidBodyType = oimo.dynamics.rigidbody.RigidBodyType;

	const ConvexHullGeometry: typeof oimo.collision.geometry.ConvexHullGeometry;
	type ConvexHullGeometry = oimo.collision.geometry.ConvexHullGeometry;

	const ShapeConfig: typeof oimo.dynamics.rigidbody.ShapeConfig;
	type ShapeConfig = oimo.dynamics.rigidbody.ShapeConfig;

	const Shape: typeof oimo.dynamics.rigidbody.Shape;
	type Shape = oimo.dynamics.rigidbody.Shape;

	const World: typeof oimo.dynamics.World;
	type World = oimo.dynamics.World;

	const Vec3: typeof oimo.common.Vec3;
	type Vec3 = oimo.common.Vec3;

	const Quat: typeof oimo.common.Quat;
	type Quat = oimo.common.Quat;

	const BroadPhaseType: typeof oimo.collision.broadphase.BroadPhaseType;
	type BroadPhaseType = oimo.collision.broadphase.BroadPhaseType;

	const Geometry: typeof oimo.collision.geometry.Geometry;
	type Geometry = oimo.collision.geometry.Geometry;

	const SphereGeometry: typeof oimo.collision.geometry.SphereGeometry;
	type SphereGeometry = oimo.collision.geometry.SphereGeometry;

	const BoxGeometry: typeof oimo.collision.geometry.BoxGeometry;
	type BoxGeometry = oimo.collision.geometry.BoxGeometry;

	const CapsuleGeometry: typeof oimo.collision.geometry.CapsuleGeometry;
	type CapsuleGeometry = oimo.collision.geometry.CapsuleGeometry;

	const ConeGeometry: typeof oimo.collision.geometry.ConeGeometry;
	type ConeGeometry = oimo.collision.geometry.ConeGeometry;

	const CylinderGeometry: typeof oimo.collision.geometry.CylinderGeometry;
	type CylinderGeometry = oimo.collision.geometry.CylinderGeometry;

	const Setting: typeof oimo.common.Setting;
	type Setting = oimo.common.Setting;

	const Contact: typeof oimo.dynamics.Contact;
	type Contact = oimo.dynamics.Contact;

	const Transform: typeof oimo.common.Transform;
	type Transform = oimo.common.Transform;

	const RayCastHit: typeof oimo.collision.geometry.RayCastHit;
	type RayCastHit = oimo.collision.geometry.RayCastHit;

	const PositionCorrectionAlgorithm: typeof oimo.dynamics.constraint.PositionCorrectionAlgorithm;
	type PositionCorrectionAlgorithm = oimo.dynamics.constraint.PositionCorrectionAlgorithm;

	const Manifold: typeof oimo.dynamics.constraint.contact.Manifold;
	type Manifold = oimo.dynamics.constraint.contact.Manifold;

	const ContactLink: typeof oimo.dynamics.ContactLink;
	type ContactLink = oimo.dynamics.ContactLink;

	const ContactConstraint: typeof oimo.dynamics.constraint.contact.ContactConstraint;
	type ContactConstraint = oimo.dynamics.constraint.contact.ContactConstraint;
}

export default OIMO;