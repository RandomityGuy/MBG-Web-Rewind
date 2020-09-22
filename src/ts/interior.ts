import { DifFile } from "./parsing/dif_parser";
import * as THREE from "three";
import { Point3F } from "./parsing/binary_file_parser";
import OIMO from "./declarations/oimo";
import { ResourceManager } from "./resources";

let interiorRigidBodyConfig =  new OIMO.RigidBodyConfig();
interiorRigidBodyConfig.type = OIMO.RigidBodyType.STATIC;

export class Interior {
	dif: DifFile;
	group: THREE.Group;
	body: OIMO.RigidBody;
	detailLevel: DifFile["detailLevels"][number];

	constructor(file: DifFile) {
		this.group = new THREE.Group();
		this.detailLevel = file.detailLevels[0];
		this.body = new OIMO.RigidBody(interiorRigidBodyConfig);

		for (let surface of this.detailLevel.surfaces) {
			this.addSurface(surface);
		}
	}

	addSurface(surface: DifFile["detailLevels"][number]["surfaces"][number]) {
		let detailLevel = this.detailLevel;

		let points = this.getPointsForSurface(surface);
		let material = detailLevel.materialList.materials[surface.textureIndex];
		let texGenEqs = detailLevel.texGenEqs[surface.texGenIndex];
		let planeX = new THREE.Plane(new THREE.Vector3(texGenEqs.planeX.x, texGenEqs.planeX.y, texGenEqs.planeX.z), texGenEqs.planeX.d);
		let planeY = new THREE.Plane(new THREE.Vector3(texGenEqs.planeY.x, texGenEqs.planeY.y, texGenEqs.planeY.z), texGenEqs.planeY.d);

		let geom = new THREE.Geometry();
		geom.vertices.push(...points.map((a) => new THREE.Vector3(a.x, a.y, a.z)));

		for (let i = 0; i < points.length-2; i++) {
			let indices = (i%2===1)? [i, i+1, i+2] : [i+2, i+1, i];
			let face = new THREE.Face3(indices[0], indices[1], indices[2]);
			let uvs = [];

			for (let j = 0; j < indices.length; j++) {
				let index = indices[j];

				let point = points[index];
				let u = planeX.distanceToPoint(new THREE.Vector3(point.x, point.y, point.z));
				let v = planeY.distanceToPoint(new THREE.Vector3(point.x, point.y, point.z));

				uvs.push(new THREE.Vector2(u, v));
			}

			geom.faceVertexUvs[0].push(uvs);
			geom.faces.push(face);
		}

		geom.computeFaceNormals();
		geom.computeVertexNormals();

		let texture = ResourceManager.getTexture("interiors/" + material + '.jpg');
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;

		let mat = new THREE.MeshLambertMaterial({ map: texture });
		let mesh = new THREE.Mesh(geom, mat);
		this.group.add(mesh);

		mesh.castShadow = true;
		mesh.receiveShadow = true;
		
		let collisionGeom = new OIMO.ConvexHullGeometry(points.map(a => new OIMO.Vec3(a.x, a.y, a.z)));
		let shapeConfig = new OIMO.ShapeConfig();
		shapeConfig.geometry = collisionGeom;
		shapeConfig.restitution = 0.4;
		shapeConfig.friction = 1;
		let shape = new OIMO.Shape(shapeConfig);
		this.body.addShape(shape);
	}

	getPointsForSurface(surface: DifFile["detailLevels"][number]["surfaces"][number]) {
		let arr: Point3F[] = [];

		for (let i = 0; i < surface.windingCount; i++) {
			let wound = surface.windingStart + i;
			let val = this.detailLevel.windings[wound];
			let point = this.detailLevel.points[val];

			arr.push(point);
		}

		return arr;
	}

	setTransform(position: THREE.Vector3, orientation: THREE.Quaternion) {
		this.group.position.copy(position);
		this.group.quaternion.copy(orientation);

		this.body.setPosition(new OIMO.Vec3(position.x, position.y, position.z));
		this.body.setOrientation(new OIMO.Quat(orientation.x, orientation.y, orientation.z, orientation.w));
	}
}