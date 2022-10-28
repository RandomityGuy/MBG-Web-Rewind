import { AudioManager } from "../audio";
import { ResourceManager } from "../resources";
import { Util } from "../util";
import { BestTimes, StorageManager } from "../storage";
import { Mission } from "../mission";
import { Replay } from "../replay";
import { previousButtonState } from "../input";
import { Leaderboards } from "../leaderboards";
import { Menu } from "./menu";
import { MissionLibrary } from "../mission_library";
import { state } from "../state";
import { VideoRenderer } from "./video_renderer";

export abstract class LevelSelect {
	menu: Menu;
	div: HTMLDivElement;
	homeButton: HTMLImageElement;
	homeButtonSrc: string;
	scrollWindow: HTMLDivElement;
	levelTitle: HTMLParagraphElement;
	levelArtist: HTMLParagraphElement;
	levelDescription: HTMLParagraphElement;
	levelQualifyTime: HTMLParagraphElement;
	localBestTimesContainer: HTMLDivElement;
	leaderboardLoading: HTMLParagraphElement;
	leaderboardScores: HTMLDivElement;
	levelImage: HTMLImageElement;
	prevButton: HTMLImageElement;
	playButton: HTMLImageElement;
	nextButton: HTMLImageElement;
	searchInput: HTMLInputElement;

	setImagesTimeout: number = null;
	clearImageTimeout: number = null;
	currentQuery = '';
	/** The current words in the search query. Used for matching. */
	currentQueryWords: string[] = [];
	lastDisplayBestTimesId: string; // Used to prevent some async issues
	abstract localScoresCount: number;
	abstract scorePlaceholderName: string;
	abstract scoreElementHeight: number;

	currentMissionArray: Mission[];
	currentMissionIndex: number;
	get currentMission() { return this.currentMissionArray?.[this.currentMissionIndex]; }

	downloadingReplay = false;

	constructor(menu: Menu) {
		this.menu = menu;
		this.initProperties();

		menu.setupButton(this.homeButton, this.homeButtonSrc, () => {
			this.hide();
			menu.home.show();
		}, undefined, undefined, state.modification === 'gold');

		menu.setupButton(this.prevButton, 'play/prev', () => this.cycleMission(-1), true, true, state.modification === 'gold', true);
		menu.setupButton(this.playButton, 'play/play', () => this.playCurrentMission(), true, undefined, state.modification === 'gold');
		menu.setupButton(this.nextButton, 'play/next', () => this.cycleMission(1), true, true, state.modification === 'gold', true);
	}

	abstract initProperties(): void;

	async init() {
		// Create the elements for the local best times
		for (let i = 0; i < this.localScoresCount; i++) {
			let element = this.createScoreElement(true);
			this.localBestTimesContainer.appendChild(element);
		}

		// Create the elements for the online leaderboard (will be reused)
		for (let i = 0; i < 100; i++) {
			let element = this.createScoreElement(false);
			this.leaderboardScores.appendChild(element);
		}

		// this.scrollWindow.addEventListener('scroll', async () => await this.updateOnlineLeaderboard());

		window.addEventListener('keydown', (e) => {
			if (this.div.classList.contains('hidden')) return;

			if (e.code === 'ArrowLeft' && (!this.searchInput.value || document.activeElement === document.body)) {
				this.cycleMission(-1);
				if (!this.prevButton.style.pointerEvents) this.prevButton.src = this.menu.uiAssetPath + 'play/prev_d.png';
			} else if (e.code === 'ArrowRight' && (!this.searchInput.value || document.activeElement === document.body)) {
				this.cycleMission(1);
				if (!this.nextButton.style.pointerEvents) this.nextButton.src = this.menu.uiAssetPath + 'play/next_d.png';
			} else if (e.code === 'Escape') {
				this.homeButton.src = this.menu.uiAssetPath + this.homeButtonSrc + '_d.png';
			}
		});

		window.addEventListener('keyup', (e) => {
			if (this.div.classList.contains('hidden')) return;

			if (e.code === 'ArrowLeft') {
				if (!this.prevButton.style.pointerEvents) this.prevButton.src = this.prevButton.hasAttribute('data-hovered')? this.menu.uiAssetPath + 'play/prev_h.png' : this.menu.uiAssetPath + 'play/prev_n.png';
			} else if (e.code === 'ArrowRight') {
				if (!this.nextButton.style.pointerEvents) this.nextButton.src = this.nextButton.hasAttribute('data-hovered')? this.menu.uiAssetPath + 'play/next_h.png' : this.menu.uiAssetPath + 'play/next_n.png';
			} else if (e.code === 'Escape') {
				this.homeButton.click();
			}
		});

		this.searchInput.addEventListener('input', () => {
			this.onSearchInputChange();
		});
		this.searchInput.addEventListener('focus', () => {
			// Clear the search when focused
			this.searchInput.value = '';
			this.onSearchInputChange();
		});
	}

	show() {
		this.div.classList.remove('hidden');
		this.displayMission();
	}

	hide() {
		this.div.classList.add('hidden');
	}

	setMissionArray(arr: Mission[], doImageTimeout = true) {
		this.currentMissionArray = arr;
		this.currentMissionIndex = this.getDefaultMissionIndex();

		this.selectBasedOnSearchQuery(false);
		this.displayMission(doImageTimeout);
	}

	getDefaultMissionIndex() {
		if ([MissionLibrary.goldCustom, MissionLibrary.platinumCustom, MissionLibrary.ultraCustom].includes(this.currentMissionArray)) {
			// Always select the last custom level by default
			return this.currentMissionArray.length - 1;
		}

		// Select the first level such that it and no other levels after it have local scores, or the last level if that's not possible
		let last = 0;
		for (let i = 0; i < this.currentMissionArray.length; i++) {
			let mission = this.currentMissionArray[i];
			if (StorageManager.data.bestTimes[mission.path]?.length) last = i+1;
		}

		return Math.min(last, this.currentMissionArray.length - 1);
	}

	displayMission(doImageTimeout = true) {
		let mission = this.currentMission;

		if (!mission) {
			// There is no mission, so hide most information. In reality, this case should never ever happen.
			this.levelImage.style.display = 'none';
			this.playButton.src = this.menu.uiAssetPath + 'play/play_i.png';
			this.playButton.style.pointerEvents = 'none';

			this.displayEmptyMetadata();
			this.displayBestTimes();
		} else {
			// Reenable the play button if it was disabled
			if (this.playButton.style.pointerEvents === 'none') {
				this.playButton.src = this.menu.uiAssetPath + 'play/play_n.png';
				this.playButton.style.pointerEvents = '';
			}

			this.levelImage.style.display = '';
			this.displayMetadata();
			this.displayBestTimes();

			if (!this.clearImageTimeout) this.clearImageTimeout = setTimeout(() => this.levelImage.src = '', 16) as any as number; // Clear the image after a very short time (if no image is loaded 'til then)
		}

		this.setImages(false, doImageTimeout);
		this.updateNextPrevButtons();
		// Leaderboard.loadLocal();
	}

	/** ...for the current level. */
	abstract displayMetadata(): void;
	/** Sets the metadata elements for the case that there is no level to display. */
	abstract displayEmptyMetadata(): void;

	playCurrentMission(replayData?: ArrayBuffer) {
		let currentMission = this.currentMission;
		if (!currentMission) return;

		this.div.classList.add('hidden');
		this.menu.loadingScreen.loadLevel(currentMission, replayData? () => Replay.fromSerialized(replayData) : undefined); // Initiate level loading
	}

	/** Advance the current mission index by the specified count while respecting the search query. That count can be negative. */
	cycleMission(direction: number) {
		let index = this.getCycleMissionIndex(direction);
		if (index === null || index === this.currentMissionIndex) return;

		this.currentMissionIndex = index;
		this.displayMission();
	}

	/** Gets the mission index you would get by skipping a certain amount forwards/backwards while respecting the search query. Returns null if the index would peek outside of the current mission array. */
	getCycleMissionIndex(direction: number) {
		if (direction === 0) return this.currentMissionIndex;

		for (let i = this.currentMissionIndex + Math.sign(direction); i >= 0 && i < this.currentMissionArray.length; i += Math.sign(direction)) {
			if (this.currentMissionArray[i].matchesSearch(this.currentQueryWords, this.currentQuery))
				direction = Math.sign(direction) * (Math.abs(direction) - 1);
			if (direction === 0) return i;
		}

		return null;
	}

	/** Returns true if there is a next mission to go to. */
	canGoNext() {
		let canGoNext = false;
		for (let i = this.currentMissionIndex + 1; i < this.currentMissionArray.length; i++) {
			if (this.currentMissionArray[i].matchesSearch(this.currentQueryWords, this.currentQuery)) {
				canGoNext = true;
				break;
			}
		}

		return canGoNext;
	}

	/** Returns true if there is a previous mission to go back to. */
	canGoPrev() {
		let canGoPrev = false;
		for (let i = this.currentMissionIndex - 1; i >= 0; i--) {
			if (this.currentMissionArray[i].matchesSearch(this.currentQueryWords, this.currentQuery)) {
				canGoPrev = true;
				break;
			}
		}

		return canGoPrev;
	}

	updateNextPrevButtons() {
		// Enable or disable the next button based on if there are still missions to come
		if (!this.canGoNext()) {
			this.nextButton.src = this.menu.uiAssetPath + 'play/next_i.png';
			this.nextButton.style.pointerEvents = 'none';
		} else {
			if (this.nextButton.src.endsWith('i.png')) this.nextButton.src = this.menu.uiAssetPath + 'play/next_n.png';
			this.nextButton.style.pointerEvents = '';
		}

		// Enable or disable the prev button based on if there are still missions to come
		if (!this.canGoPrev()) {
			this.prevButton.src = this.menu.uiAssetPath + 'play/prev_i.png';
			this.prevButton.style.pointerEvents = 'none';
		} else {
			if (this.prevButton.src.endsWith('i.png')) this.prevButton.src = this.menu.uiAssetPath + 'play/prev_n.png';
			this.prevButton.style.pointerEvents = '';
		}
	}

	/** Sets and preloads images around the current level. */
	setImages(fromTimeout = false, doTimeout = true) {
		if (fromTimeout) {
			// We come from a timeout, so clear it
			clearTimeout(this.setImagesTimeout);
			this.setImagesTimeout = null;
		}

		if (this.setImagesTimeout !== null && doTimeout) {
			// There is currently a timeout ongoing; reset the timer and return.
			clearTimeout(this.setImagesTimeout);
			this.setImagesTimeout = setTimeout(() => this.setImages(true), 75) as any as number;
			return;
		}

		// List of missions whose image should be loaded
		let toLoad = new Set<Mission>();

		// Preload the neighboring-mission images for faster flicking between missions without having to wait for images to load.
		for (let i = 0; i <= 1; i++) {
			let index = this.getCycleMissionIndex(Math.ceil(i / 2) * ((i % 2)? 1 : -1)); // Go in an outward spiral pattern, but only visit the missions that match the current search
			let mission = this.currentMissionArray[index];
			if (!mission) continue;

			toLoad.add(mission);
		}

		// Preload the next shuffled missions
		for (let mission of this.getNextShuffledMissions()) toLoad.add(mission);

		for (let mission of toLoad) {
			let imagePath = mission.getImagePath();
			let start = performance.now();

			ResourceManager.loadResource(imagePath).then(async blob => {
				if (!blob) return;

				if (mission === this.currentMission) {
					// Show the thumbnail if the mission is the same
					let dataUrl = await ResourceManager.readBlobAsDataUrl(blob);
					if (mission === this.currentMission) {
						clearTimeout(this.clearImageTimeout);
						this.clearImageTimeout = null;
						this.levelImage.src = dataUrl;
					}
				}

				let elapsed = performance.now() - start;
				if (elapsed > 75 && !this.setImagesTimeout && doTimeout) {
					// If the image took too long to load, set a timeout to prevent spamming requests.
					this.setImagesTimeout = setTimeout(() => this.setImages(true), 75) as any as number;
				}
			});
		}
	}

	shuffle() {
		if (this.currentMissionArray.length <= 1) return;

		// Find a random mission that isn't the current one
		let nextIndex = this.currentMissionIndex;
		while (nextIndex === this.currentMissionIndex) {
			nextIndex = Math.floor(Util.popRandomNumber() * this.currentMissionArray.length);
		}

		this.currentMissionIndex = nextIndex;
		this.displayMission();
	}

	/** Returns the next few missions that would be selected by repeating pressing of the shuffle button. */
	getNextShuffledMissions() {
		let missions: Mission[] = [];

		if (this.currentMissionArray.length > 1) {
			let lastIndex = this.currentMissionIndex;
			let i = 0;
			let count = 0;
			while (count < 5) {
				let randomNumber = Util.peekRandomNumber(i++);
				let nextIndex = Math.floor(randomNumber * this.currentMissionArray.length);

				if (lastIndex !== nextIndex) {
					let mission = this.currentMissionArray[nextIndex];
					missions.push(mission);
					count++;
				}

				lastIndex = nextIndex;
			}
		}

		return missions;
	}

	/** Creates a score element that can be used to show local and online scores. */
	abstract createScoreElement(includeReplayButton: boolean): HTMLDivElement;
	/** Updates a previously created score element. */
	abstract updateScoreElement(element: HTMLDivElement, score: BestTimes[number], rank: number): void;

	displayBestTimes() {
		let randomId = Util.getRandomId();
		this.lastDisplayBestTimesId = randomId;

		let bestTimes = StorageManager.getBestTimesForMission(this.currentMission?.path, this.localScoresCount, this.scorePlaceholderName);
		for (let i = 0; i < this.localScoresCount; i++) {
			this.updateScoreElement(this.localBestTimesContainer.children[i] as HTMLDivElement, bestTimes[i], i+1);
		}

		if (!this.currentMission) {
			this.leaderboardLoading.style.display = 'none';
			this.leaderboardScores.style.paddingTop = '0px';
			this.leaderboardScores.style.paddingBottom = '0px';
			for (let element of this.leaderboardScores.children) (element as HTMLDivElement).style.display = 'none';
		} else {
			this.leaderboardLoading.style.display = 'block'; // Leaderboard.isLoading(this.currentMission.path)? 'block' : 'none';
			for (let i = 0; i < this.leaderboardScores.children.length; i++) {
				let element = this.leaderboardScores.children[i] as HTMLDivElement;
				element.style.display = 'none';
			}
			this.updateOnlineLeaderboard().then(() =>
			{
				this.leaderboardLoading.style.display = 'none';
			});
			// setTimeout(async () => await this.updateOnlineLeaderboard()); // Sometimes, scrollTop isn't set properly, so do it again after a very short time
		}
	}

	/** Creates a replay button for use in score elements. */
	createReplayButton() {
		let icon = document.createElement('img');
		icon.src = "./assets/img/round_videocam_black_18dp.png";
		icon.title = "Alt-Click to download, Shift-Click to render to video";

		const handler = async (action: 'watch' | 'download' | 'render') => {
			let mission = this.currentMission;
			if (!mission) return;

			let attr = icon.getAttribute('data-score-id');
			if (!attr) return;

			let replayData = await StorageManager.databaseGet('replays', attr);
			if (!replayData) return;

			if (action === 'watch') {
				this.playCurrentMission(replayData);
			} else if (action === 'download') {
				Replay.download(replayData, mission);
				if (Util.isTouchDevice && Util.isInFullscreen()) this.menu.showAlertPopup('Downloaded', 'The .wrec has been downloaded.');
			} else {
				let replay = Replay.fromSerialized(replayData);
				VideoRenderer.show(this.currentMission, replay);
			}
		};

		icon.addEventListener('click', async (e) => {
			if (e.button !== 0) return;

			if (e.shiftKey) handler('render');
			else if (e.altKey) handler('download');
			else handler('watch');
		});
		Util.onLongTouch(icon, () => {
			handler('download');
		});

		icon.addEventListener('mouseenter', () => {
			AudioManager.play('buttonover.wav');
		});
		icon.addEventListener('mousedown', (e) => {
			if (e.button === 0) AudioManager.play('buttonpress.wav');
		});

		return icon;
	}

	async updateReplayButton(element: HTMLImageElement, score: BestTimes[number]) {
		element.style.display = 'none';
		element.removeAttribute('data-score-id');
		if (!score[2]) return;

		let randomId = this.lastDisplayBestTimesId;
		let count = await StorageManager.databaseCount('replays', score[2]);

		if (randomId === this.lastDisplayBestTimesId && count > 0) {
			element.style.display = 'block';
			element.setAttribute('data-score-id', score[2]);
		}
	}

	/** Creates a replay button for use in score elements. */
	createLBReplayButton() {
		let icon = document.createElement('img');
		icon.src = "./assets/img/round_videocam_black_18dp.png";
		icon.style.display = 'block';

		icon.addEventListener('click', async (e) => {
			if (e.button !== 0) return;
			let mission = this.currentMission;
			if (!mission) return;
			if (this.downloadingReplay) return;
			this.downloadingReplay = true;
			let replayData = await Leaderboards.get_top_replay(mission?.path);
			if (!replayData) return;
			this.downloadingReplay = false;
			this.playCurrentMission(replayData);
		});

		icon.addEventListener('mouseenter', () => {
			AudioManager.play('buttonover.wav');
		});
		icon.addEventListener('mousedown', (e) => {
			if (e.button === 0) AudioManager.play('buttonpress.wav');
		});

		return icon;
	}

	/** Updates the elements in the online leaderboard. Updates only the visible elements and adds padding to increase performance. */
	async updateOnlineLeaderboard() {
		let mission = this.currentMission;
		if (!mission) return;

		let onlineScores = await Leaderboards.get_scores(mission.path);
		let elements = this.leaderboardScores.children;
		let index = 0;

		// // Reset styling
		// this.leaderboardScores.style.paddingTop = '0px';
		// this.leaderboardScores.style.paddingBottom = '0px';
		// (elements[index] as HTMLDivElement).style.display = 'block';

		// // Get the y of the top element
		// let currentY = (elements[0] as HTMLDivElement).offsetTop - this.scrollWindow.scrollTop;

		// this.leaderboardScores.style.height = onlineScores.length * this.scoreElementHeight + 'px';

		// // As long as the top element is out of view, move to the next one. By doing this, we find the first element that's in view (from the top)
		// while (currentY < -this.scoreElementHeight && index < onlineScores.length) {
		// 	index++;
		// 	currentY += this.scoreElementHeight;
		// }

		// // Add padding to the top according to how many elements we've already passed at the top
		// this.leaderboardScores.style.paddingTop = index * this.scoreElementHeight + 'px';

		for (let i = 0; i < elements.length; i++) {
			let element = elements[i] as HTMLDivElement;

			if (index < onlineScores.length) {
				// If there's a score, apply it to the current element
				let score = onlineScores[index];
				element.style.display = 'block';
				this.updateScoreElement(element, score as any, index + 1);
				while (state.modification == "platinum" && element.children.length > 2)
					element.removeChild(element.children[2]);

				while (state.modification == "gold" && element.children.length > 3)
					element.removeChild(element.children[3]);

				if (index == 0) {
					let hasTopReplay = await Leaderboards.has_top_replay(mission.path);
					if (hasTopReplay) {
						while (state.modification == "platinum" && element.children.length > 2)
							element.removeChild(element.children[2]);

						while (state.modification == "gold" && element.children.length > 3)
							element.removeChild(element.children[3]);
						let button = this.createLBReplayButton();
						element.appendChild(button);
					}
				}
			} else {
				// Hide the element otherwise
				element.style.display = 'none';
			}

			index++;
		}

		// // Add padding to the bottom according to how many scores there are still left
		// this.leaderboardScores.style.paddingBottom = Math.max(onlineScores.length - index, 0) * this.scoreElementHeight + 'px';
	}

	onSearchInputChange() {
		// Normalize the search string and split it into words
		let str = Util.removeSpecialCharacters(Util.normalizeString(this.searchInput.value.trim())).toLowerCase();
		this.currentQuery = str;
		this.currentQueryWords = str.split(' ');
		if (!str) this.currentQueryWords.length = 0;

		this.selectBasedOnSearchQuery();
		this.updateNextPrevButtons();
	}

	/** Selects a valid mission based on the current search query. */
	selectBasedOnSearchQuery(display = true) {
		// Check if the current mission already matches the search. In that case, don't do anything.
		if (this.currentMission?.matchesSearch(this.currentQueryWords, this.currentQuery)) return;

		// Find the first matching mission
		for (let i = 0; i < this.currentMissionArray.length; i++) {
			let mis = this.currentMissionArray[i];
			if (mis.matchesSearch(this.currentQueryWords, this.currentQuery)) {
				this.currentMissionIndex = i;
				if (display) this.displayMission();
				break;
			}
		}
	}

	showLoadReplayPrompt(event: MouseEvent) {
		// Show a file picker
		let fileInput = document.createElement('input');
		fileInput.setAttribute('type', 'file');
		fileInput.setAttribute('accept', ".wrec");

		fileInput.onchange = async () => {
			try {
				let file = fileInput.files[0];
				let arrayBuffer = await ResourceManager.readBlobAsArrayBuffer(file);
				let replay = Replay.fromSerialized(arrayBuffer);

				let mission = MissionLibrary.allMissions.find(x => x.path === replay.missionPath);
				if (!mission) throw new Error("Mission not found.");

				if (state.modification === 'gold' && mission.path.startsWith('mbp')) {
					// We don't allow this
					state.menu.showAlertPopup('Warning', "You can't load replays of Platinum levels inside Marble Blast Gold.");
					return;
				}

				if (event.shiftKey) {
					VideoRenderer.show(mission, replay);
				} else {
					this.div.classList.add('hidden');
					this.menu.loadingScreen.loadLevel(mission, () => replay);
				}
			} catch (e) {
				state.menu.showAlertPopup('Error', "There was an error loading the replay.");
				console.error(e);
			}
		};
		fileInput.click();
	}

	handleControllerInput(gamepad: Gamepad) {
		// A button to play
		if (gamepad.buttons[0].value > 0.5 && !previousButtonState[0]) {
			this.playCurrentMission();
			AudioManager.play('buttonpress.wav');
		}
		// LT, RT to change category
		if (gamepad.buttons[6].value > 0.5 && !previousButtonState[6]) {
			// Should probably have a function for this tbh
			if (this.currentMissionArray === MissionLibrary.goldIntermediate)
				this.setMissionArray(MissionLibrary.goldBeginner);
			else if (this.currentMissionArray === MissionLibrary.goldAdvanced)
				this.setMissionArray(MissionLibrary.goldIntermediate);
			else if (this.currentMissionArray === MissionLibrary.goldCustom)
				this.setMissionArray(MissionLibrary.goldAdvanced);
			else if (this.currentMissionArray === MissionLibrary.platinumBeginner)
				this.setMissionArray(MissionLibrary.goldCustom);
			else if (this.currentMissionArray === MissionLibrary.platinumIntermediate)
				this.setMissionArray(MissionLibrary.platinumBeginner);
			else if (this.currentMissionArray === MissionLibrary.platinumAdvanced)
				this.setMissionArray(MissionLibrary.platinumIntermediate);
			else if (this.currentMissionArray === MissionLibrary.platinumExpert)
				this.setMissionArray(MissionLibrary.platinumAdvanced);
			else if (this.currentMissionArray === MissionLibrary.platinumCustom)
				this.setMissionArray(MissionLibrary.platinumExpert);
			else if (this.currentMissionArray === MissionLibrary.ultraBeginner)
				this.setMissionArray(MissionLibrary.platinumCustom);
			else if (this.currentMissionArray === MissionLibrary.ultraIntermediate)
				this.setMissionArray(MissionLibrary.ultraBeginner);
			else if (this.currentMissionArray === MissionLibrary.ultraAdvanced)
				this.setMissionArray(MissionLibrary.ultraIntermediate);
			else if (this.currentMissionArray === MissionLibrary.ultraCustom)
				this.setMissionArray(MissionLibrary.ultraAdvanced);
			AudioManager.play('buttonpress.wav');
		}
		if (gamepad.buttons[7].value > 0.5 && !previousButtonState[7]) {
			// Should probably have a function for this tbh
			if (this.currentMissionArray === MissionLibrary.goldBeginner)
				this.setMissionArray(MissionLibrary.goldIntermediate);
			else if (this.currentMissionArray === MissionLibrary.goldIntermediate)
				this.setMissionArray(MissionLibrary.goldAdvanced);
			else if (this.currentMissionArray === MissionLibrary.goldAdvanced)
				this.setMissionArray(MissionLibrary.goldCustom);
			else if (this.currentMissionArray === MissionLibrary.goldCustom)
				this.setMissionArray(MissionLibrary.platinumBeginner);
			else if (this.currentMissionArray === MissionLibrary.platinumBeginner)
				this.setMissionArray(MissionLibrary.platinumIntermediate);
			else if (this.currentMissionArray === MissionLibrary.platinumIntermediate)
				this.setMissionArray(MissionLibrary.platinumAdvanced);
			else if (this.currentMissionArray === MissionLibrary.platinumAdvanced)
				this.setMissionArray(MissionLibrary.platinumExpert);
			else if (this.currentMissionArray === MissionLibrary.platinumExpert)
				this.setMissionArray(MissionLibrary.platinumCustom);
			else if (this.currentMissionArray === MissionLibrary.platinumCustom)
				this.setMissionArray(MissionLibrary.ultraBeginner);
			else if (this.currentMissionArray === MissionLibrary.ultraBeginner)
				this.setMissionArray(MissionLibrary.ultraIntermediate);
			else if (this.currentMissionArray === MissionLibrary.ultraIntermediate)
				this.setMissionArray(MissionLibrary.ultraAdvanced);
			else if (this.currentMissionArray === MissionLibrary.ultraAdvanced)
				this.setMissionArray(MissionLibrary.ultraCustom);
			AudioManager.play('buttonpress.wav');
		}
		// D-pad left+right to change missions
		if (gamepad.buttons[14].value > 0.5 && !previousButtonState[14]) {
			this.cycleMission(-1);
			AudioManager.play('buttonpress.wav');
		}
		if (gamepad.buttons[15].value > 0.5 && !previousButtonState[15]) {
			this.cycleMission(1);
			AudioManager.play('buttonpress.wav');
		}
	}
}