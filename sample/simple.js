
"use strict" ;

console.log( "Simple's side effect pre-start!" ) ;
const logger = require( './htmlLog.js' ) ;
logger( "Simple's side effect start!" ) ;

function method() {
	logger( "Simple's method()" ) ;
}

function run() {
	logger( "Simple's run()" ) ;
	var other = require( './other.js' ) ;
	var json = require( './package.json' ) ;
	logger( "Name: " + json.name ) ;
	logger( "Version: " + json.version ) ;
	other.method() ;
	other.checkStrictMode() ;
	other.checkGlobals() ;
	logger( "3/5=" + 3/5 ) ;
}

run() ;

module.exports = method ;

logger( "Simple's side effect end!" ) ;

