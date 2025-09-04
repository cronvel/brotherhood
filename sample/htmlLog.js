
"use strict" ;

console.log( "htmlLog's side effect pre-start!" ) ;

function logger( text ) {
	var $log = document.getElementById( 'log' ) ;

	var $p = document.createElement( 'p' ) ;
	$p.textContent = text ;
	$log.appendChild( $p ) ;

	console.log( "logger: " + text ) ;
} ;

module.exports = logger ;

logger( "htmlLog loaded!" ) ;

