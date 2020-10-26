import { textChangeRangeIsUnchanged } from "typescript";
import { getRandomId } from "./state";
import { Util } from "./util";
import { executeOnWorker } from "./worker";

/** name, time, scoreId, timestamp */
export type BestTimes = [string, number, string, number][];

const MAX_SCORE_TIME = (99 * 60 + 59) * 1000 + 999.99; // The 99:59.99 thing

interface StorageData {
	settings: {
		resolution: number,
		videoDriver: number,
		screenStyle: number,
		colorDepth: number,
		shadows: boolean,
		musicVolume: number,
		soundVolume: number,
		gameButtonMapping: {
			"up": string,
			"down": string,
			"left": string,
			"right": string,
			"jump": string,
			"use": string,
			"cameraUp": string,
			"cameraDown": string,
			"cameraLeft": string,
			"cameraRight": string,
			"freeLook": string,
			"rewind": string,
			"restart": string
		},
		rewindTimescale: number,
		rewindQuality: number,
		rewindMatchFPS: boolean,
		rewindGhosts: boolean,
		mouseSensitivity: number,
		invertYAxis: boolean,
		alwaysFreeLook: boolean,
		reflectiveMarble: boolean
	},
	bestTimes: Record<string, BestTimes>,
	/** Stores the amount of unlocked levels per category of level (beginner, intermediate, advanced) */
	unlockedLevels: [number, number, number],
	/** Used for the name entry in the post-game screen. */
	lastUsedName: string,
	randomId: string
}

const DEFAULT_STORAGE_DATA: StorageData = {
	settings: {
		resolution: 2,
		videoDriver: 0,
		screenStyle: 0,
		colorDepth: 1,
		shadows: false,
		musicVolume: 0.5,
		soundVolume: 0.7,
		gameButtonMapping: {
			"up": "KeyW", // kekw
			"down": "KeyS",
			"left": "KeyA",
			"right": "KeyD",
			"jump": "Space",
			"use": "LMB",
			"cameraUp": "ArrowUp",
			"cameraDown": "ArrowDown",
			"cameraLeft": "ArrowLeft",
			"cameraRight": "ArrowRight",
			"freeLook": "RMB",
			"rewind": "KeyR",
			"restart": "KeyT"
		},
		rewindTimescale: 1,
		rewindQuality: 0,
		rewindMatchFPS: true,
		rewindGhosts: false,
		mouseSensitivity: 0.2,
		invertYAxis: false,
		alwaysFreeLook: false,
		reflectiveMarble: false
	},
	bestTimes: {},
	unlockedLevels: [24, 24, 52],
	lastUsedName: '',
	randomId: getRandomId()
};

/** Manages storage and persistence. */
export abstract class StorageManager {
	static data: StorageData;
	static idbDatabase: Promise<IDBDatabase>;

	static async init() {
		// Setup the IndexedDB
		this.idbDatabase = new Promise((resolve) => {
			let request = indexedDB.open("mb-database", 3);
			request.onsuccess = (e) => {
				resolve((e.target as any).result);
			};

			request.onupgradeneeded = (e) => {
				let db = (e.target as any).result as IDBDatabase;
				let transaction = (e.target as any).transaction as IDBTransaction;

				let objectStore: IDBObjectStore;

				// For storing replays
				try {
					objectStore = db.createObjectStore('replays', {});
				} catch (error) {
					objectStore = transaction.objectStore('replays');
				}

				// A simple key-value store
				try {
					objectStore = db.createObjectStore('keyvalue', {});
				} catch (error) {
					objectStore = transaction.objectStore('keyvalue');
				}
			};
		});

		// Old storage format detected, let's migrate it
		if (localStorage.getItem('mb-storage')) await this.migrate();

		// Get the storage data
		let storageData = await this.databaseGet('keyvalue', 'storageData');
		if (storageData) this.data = storageData;
		else this.data = DEFAULT_STORAGE_DATA;

		// Get the best times and uncompress them
		this.data.bestTimes = {};
		let compressedBestTimes = await this.databaseGet('keyvalue', 'bestTimes');
		if (compressedBestTimes) {
			try {
				let uncompressed = pako.inflate(compressedBestTimes, { to: 'string' });
				let json = JSON.parse(uncompressed);
				this.data.bestTimes = json;
			} catch (e) {
				console.error("Error decoding best times!", e);
			}
		}

		// Set some default values if they're missing
		if (!this.data.settings.gameButtonMapping.restart) this.data.settings.gameButtonMapping.restart = 'KeyR';
		if (!this.data.randomId) this.data.randomId = getRandomId();
		if (this.data.settings.reflectiveMarble === undefined) this.data.settings.reflectiveMarble = false;
	}

	/** Migrates from localStorage to IndexedDB. */
	static async migrate() {
		let stored = JSON.parse(localStorage.getItem('mb-storage')) as StorageData;
		this.data = stored;

		for (let key in stored.bestTimes) {
			for (let bestTime of stored.bestTimes[key]) {
				bestTime[3] = 0; // Set timestamp to 0, indicating that this score shouldn't be uploaded to the leaderboards.
			}
	}

	await this.store();
	await this.storeBestTimes();

	localStorage.removeItem('mb-storage');
}

static async store() {
	let obj = Util.shallowClone(this.data);
	delete obj.bestTimes;

	await this.databasePut('keyvalue', obj, 'storageData');
}

static async storeBestTimes() {
	let string = JSON.stringify(this.data.bestTimes);
	let compressed = await executeOnWorker('compress', string) as string; // Compress the best times to make them take up less space and harder to modify from the outside.

	await this.databasePut('keyvalue', compressed, 'bestTimes');
	}

	/** Get the three best times for a mission path. */
	static getBestTimesForMission(path: string) {
		let result: BestTimes = [];
		if (this.data.bestTimes === undefined) 
		{
			for (let i = 0; i < 3; i++) {
				// Fill the remaining slots with Nardo Polo scores
				result.push(["Nardo Polo", MAX_SCORE_TIME, "", 0]);
			}
			return result;
		}
		let stored = this.data.bestTimes[path];
		if (stored) {
			result.push(...stored);
		}
		result.sort((a, b) => a[1] - b[1]); // Make sure they're in ascending order

		let remaining = 3 - result.length;
		for (let i = 0; i < remaining; i++) {
			// Fill the remaining slots with Nardo Polo scores
			result.push(["Nardo Polo", MAX_SCORE_TIME, "", 0]);
		}

		return result;
	}

	/** Register a new time for a mission. */
	static insertNewTime(path: string, name: string, time: number) {
		if (this.data.bestTimes == undefined) this.data.bestTimes = {};
		let stored = this.data.bestTimes[path] ?? [];
		let scoreId = getRandomId();

		// Determine the correct index to insert the time at
		let index: number;
		for (index = 0; index < stored.length; index++) {
			if (stored[index][1] > time) break;
		}
		stored.splice(index, 0, [name, time, scoreId, Date.now()]);

		// Shorten the array if needed
		if (stored.length > 3) {
			let lost = stored[3];
			stored = stored.slice(0, 3);

			if (lost[2]) {
				this.databaseGet('replays', lost[2]).then(replayData => {
					if (!replayData) return;
					this.databaseDelete('replays', lost[2]); // Delete the replay
				});
			}
		}
		this.data.bestTimes[path] = stored;

		this.storeBestTimes();

		return scoreId;
	}

	static async createTransaction(storeName: string) {
		let db = await this.idbDatabase;
		let transaction = db.transaction(storeName, 'readwrite');
		return transaction;
	}

	/** Gets an entry from an IndexedDB store by key. */
	static async databaseGet(storeName: string, key: string) {
		let transaction = await this.createTransaction(storeName);
		let store = transaction.objectStore(storeName);
		let request = store.get(key);

		await new Promise(resolve => request.onsuccess = resolve);
		return request.result ?? null;
	}

	/** Puts an entry into an IndexedDB store by key. */
	static async databasePut(storeName: string, value: any, key?: string) {
		let transaction = await this.createTransaction(storeName);
		let store = transaction.objectStore(storeName);
		store.put(value, key);

		await new Promise(resolve => transaction.addEventListener('complete', resolve));
	}

	/** Deletes an entry from an IndexedDB store by key. */
	static async databaseDelete(storeName: string, key: string) {
		let transaction = await this.createTransaction(storeName);
		let store = transaction.objectStore(storeName);
		store.delete(key);

		await new Promise(resolve => transaction.addEventListener('complete', resolve));
	}

	/** Counts all entries in an IndexedDB store with a specific key. */
	static async databaseCount(storeName: string, key: string): Promise<number> {
		let transaction = await this.createTransaction(storeName);
		let store = transaction.objectStore(storeName);
		let request = store.count(key);

		await new Promise(resolve => request.onsuccess = resolve);
		return request.result ?? null;
	}
}