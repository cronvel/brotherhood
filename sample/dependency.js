
"use strict" ;

const htmlLog = require( './htmlLog.js' ) ;
const string = require( 'string-kit' ) ;

function logger( format , ... args ) {
	htmlLog( string.format( format , ... args ) ) ;
	//htmlLog( format ) ;
}

logger.path = require( 'path' ) ;
//logger.Buffer = Buffer ;
//logger.Buffer = "bob" ;

module.exports = logger ;

