const sarcina = require('sarcina');

sarcina.bundle({
	src: './src',
	dist: './dist',
	verbose: true,
	minifyMarkup: false,
	ignore: ['ts','storage','php/*.json','python/__pycache__','assets/data/missions/custom/*'],
	transpileScript: sarcina.ES2017,
	insertPolyfill: true
}).then((e) => console.log(e));