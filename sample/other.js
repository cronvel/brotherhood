
"use strict" ;

console.log( "Other's side effect pre-start!" ) ;
const logger = require( './htmlLog.js' ) ;
logger( "Other's side effect start!" ) ;

exports.method = function() {
	logger( "Other's method()" ) ;
}

exports.checkStrictMode = function checkStrictMode() {
	try {
		let caller = checkStrictMode.caller ;
		logger( "other.js is NOT in strict mode" ) ;
	}
	catch ( error ) {
		logger( "other.js IS in strict mode" ) ;
	}
}

exports.checkGlobals = function() {
	logger( "__dirname: " + __dirname ) ;
	logger( "__filename: " + __filename ) ;
}

logger( "Other's side effect end!" ) ;

