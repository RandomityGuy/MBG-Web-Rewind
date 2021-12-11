precision highp float;

#include <definitions>

attribute vec3 position;
attribute vec3 normal;
attribute vec4 tangent;
attribute vec2 uv;
attribute float meshInfoIndex;

uniform sampler2D meshInfos;
uniform int meshInfoTextureWidth;
uniform int meshInfoTextureHeight;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 inverseProjectionMatrix;
uniform float logDepthBufFC; // Some coefficient
uniform bool skipTransparent;
uniform mat4 directionalLightTransform;
uniform vec3 eyePosition;

varying vec4 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vOpacity;
varying vec4 vShadowPosition;
varying vec3 vReflect;
varying mat3 vTbn;
varying vec4 vTangent;
varying float vFragDepth;
varying vec3 eyeDirection;

#ifdef IS_WEBGL1
	mat3 transpose(mat3 inMatrix) {
		vec3 i0 = inMatrix[0];
		vec3 i1 = inMatrix[1];
		vec3 i2 = inMatrix[2];

		mat3 outMatrix = mat3(
			vec3(i0.x, i1.x, i2.x),
			vec3(i0.y, i1.y, i2.y),
			vec3(i0.z, i1.z, i2.z)
		);

		return outMatrix;
	}

	// http://www.thetenthplanet.de/archives/1180
	mat3 inverse(mat3 M) {
		mat3 M_t = transpose(M);
		float det = dot(cross(M_t[0], M_t[1]), M_t[2]);
		mat3 adjugate = mat3(cross(M_t[1], M_t[2]), cross(M_t[2], M_t[0]), cross(M_t[0], M_t[1]));
		return adjugate / det;
	}
#endif

mat4 getMeshInfo(int index) {
	ivec2 coords = ivec2(
		(4 * index) % meshInfoTextureWidth,
		(4 * index) / meshInfoTextureWidth
	);

	#ifdef IS_WEBGL1
		return mat4(
			texture2D(meshInfos, vec2(coords + ivec2(0, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(1, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(2, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight)),
			texture2D(meshInfos, vec2(coords + ivec2(3, 0)) / vec2(meshInfoTextureWidth, meshInfoTextureHeight))
		);
	#else
		return mat4(
			texelFetch(meshInfos, coords + ivec2(0, 0), 0),
			texelFetch(meshInfos, coords + ivec2(1, 0), 0),
			texelFetch(meshInfos, coords + ivec2(2, 0), 0),
			texelFetch(meshInfos, coords + ivec2(3, 0), 0)
		);
	#endif
}

void main() {
	#ifdef IS_SKY
		mat4 inverseProjection = inverseProjectionMatrix;
		mat3 inverseModelview = transpose(mat3(viewMatrix));
		vec3 unprojected = (inverseProjection * vec4(position, 1.0)).xyz;
		eyeDirection = inverseModelview * unprojected;
		
		gl_Position = vec4(position, 1.0);
	#else
		mat4 meshInfo = getMeshInfo(int(meshInfoIndex)); // + 0.1 to make sure it casts correctly, lol
		mat4 transform = meshInfo;
		transform[0][3] = 0.0;
		transform[1][3] = 0.0;
		transform[2][3] = 0.0;
		transform[3][3] = 1.0;
		float opacity = meshInfo[0][3];
		vOpacity = opacity;
		int meshFlags = int(meshInfo[1][3]);

		if (skipTransparent && opacity < 1.0) {
			gl_Position = vec4(0.0);
			return;
		}

		vec4 worldPosition = transform * vec4(position, 1.0);
		vPosition = worldPosition;
		vec4 transformed = viewMatrix * worldPosition;
		transformed = projectionMatrix * transformed;

		vUv = uv;
		#ifdef FLIP_Y
			vUv.y = 1.0 - vUv.y;
		#endif

		mat3 normalTransform = transpose(inverse(mat3(transform)));

		vec3 transformedNormal = normalTransform * normal;
		#ifdef NORMALIZE_NORMALS
			transformedNormal = normalize(transformedNormal);
		#endif
		vNormal = transformedNormal;

		vTangent = tangent;
		#ifdef USE_NORMAL_MAP
			vec3 N = transformedNormal;
			vec3 T = normalize((transform * vec4(tangent.xyz, 0.0)).xyz);
			// re-orthogonalize T with respect to N
			T = normalize(T - dot(T, N) * N);
			// then retrieve perpendicular vector B with the cross product of T and N
			vec3 B = cross(N, T) * tangent.w;
			mat3 tbn = mat3(T, B, N);
			vTbn = tbn;
		#endif

		#if defined(RECEIVE_SHADOWS) || defined(IS_SHADOW)
			vShadowPosition = directionalLightTransform * worldPosition;
		#endif

		#if defined(USE_ENV_MAP) && !defined(USE_ACCURATE_REFLECTION_RAY)
			vec3 incidentRay = normalize(worldPosition.xyz - eyePosition);
			vec3 reflected = reflect(incidentRay, normalize(transformedNormal));
			vReflect = reflected;
		#endif

		gl_Position = transformed;

		#ifdef LOG_DEPTH_BUF
			vFragDepth = 1.0 + gl_Position.w;
		#endif
	#endif
}