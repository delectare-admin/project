const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_logger_common = require('./common.js');
let util = require("util");
util = require_rolldown_runtime.__toESM(util);

//#region src/logger/compat.ts
/** @hidden */
function patchedConsole(severity) {
	return function(...args) {
		const message = (0, util.format)(...args);
		require_logger_common.UNPATCHED_CONSOLE[require_logger_common.CONSOLE_SEVERITY[severity]](JSON.stringify({
			severity,
			message
		}));
	};
}
console.debug = patchedConsole("DEBUG");
console.info = patchedConsole("INFO");
console.log = patchedConsole("INFO");
console.warn = patchedConsole("WARNING");
console.error = patchedConsole("ERROR");

//#endregion