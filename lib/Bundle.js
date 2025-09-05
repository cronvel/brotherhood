/*
	Brotherhood

	Copyright (c) 2022 - 2023 Cédric Ronvel

	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/

"use strict" ;



const utils = require( './utils.js' ) ;
const parseLXON = require( './lxonParser.min.js' ) ;

const Logfella = require( 'logfella' ) ;
const log = Logfella.global.use( 'brotherhood' ) ;



/*
	Operations and manipulations on an existing Bundle.
*/

function Bundle( content ) {
	this.content = content ;
	this.metadata = null ;
}

module.exports = Bundle ;



// Extract metadata from a Brotherhood bundle.
// Should survive minifiers.
Bundle.prototype.extractMetadata = function() {
	if ( this.metadata ) { return this.metadata ; }
	var match , start , end , rawMetadata ;

	// This is the Brotherhood bundle signature!
	match = this.content.match( /^(\(function\(\)\s?\{\s?)?let BROTHERHOOD_BUNDLE\s?=/ ) ;

	if ( ! match ) {
		throw utils.userError( "This is not a Brotherhood bundle (no signature)..." ) ;
	}

	start = match[ 0 ].length ;
	end = this.metadataBoundary( start ) ;
	rawMetadata = this.content.slice( start , end ) ;

	try {
		// Be careful! Minifier remove double-quote around object's keys whenever possible...
		// So we use the LXON parser instead of JSON.parse().
		this.metadata = parseLXON( rawMetadata ) ;
	}
	catch ( error ) {
		throw utils.userError( "This is not a Brotherhood bundle (can't parse metadata)..." ) ;
	}

	return this.metadata ;
} ;



Bundle.prototype.metadataBoundary = function( start ) {
	var isInQuote = false ;

	// We just want to find out the boundary: we search for a semi-colon not in double-quotes.
	for ( let end = start ; end < this.content.length ; end ++ ) {
		let char = this.content.charCodeAt( end ) ;

		if ( isInQuote ) {
			if ( char === 0x5c ) {	// \
				end ++ ;
			}
			else if ( char === 0x22 ) {	// "
				isInQuote = false ;
			}
		}
		else {
			if ( char === 0x22 ) {	// "
				isInQuote = true ;
			}
			else if ( char === 0x3b ) {	// ;
				return end ;
			}
		}
	}

	throw utils.userError( "This is not a Brotherhood bundle (can't find metadata boundary)..." ) ;
} ;



Bundle.prototype.extractModules = function() {
	if ( ! this.metadata ) { this.extractMetadata() ; }

	var moduleList = [] ,
		position = 0 ,
		startBoundary = "BROTHERHOOD_START_MODULE('" + this.metadata.boundary + "');" ,
		endBoundary = "BROTHERHOOD_END_MODULE('" + this.metadata.boundary + "');" ;

	while ( position < this.content.length ) {
		let startIndex = this.content.indexOf( startBoundary , position ) ;
		if ( startIndex === -1 ) { break ; }
		startIndex += startBoundary.length ;
		let endIndex = this.content.indexOf( endBoundary , startIndex ) ;
		if ( endIndex === -1 ) { break ; }
		let area = this.content.slice( startIndex , endIndex ) ;

		let startMatch = area.match( /^\s*Module.prepare\( ?'([^']*)' ?, ?'([^']*)' ?, ?(?:null|'([^']*)') ?, ?\( ?module ?, ?exports ?, ?require ?, ?__dirname ?, ?__filename ?\) ?=> ?\{/ ) ;
		if ( ! startMatch ) {
			throw utils.userError( "Bundle parse error (may have been modified, can't find start match)..." ) ;
		}

		let [ , id , packageId , aliasId ] = startMatch ;

		let endMatch = area.match( /} ?\) ?;\s*$/ ) ;
		if ( ! endMatch ) {
			throw utils.userError( "Bundle parse error (may have been modified, can't find end match)..." ) ;
		}

		let content = area.slice( startMatch[ 0 ].length , area.length - endMatch[ 0 ].length ) ;
		moduleList.push( {
			id , packageId , aliasId , content
		} ) ;

		position = endIndex + endBoundary.length ;
	}

	return moduleList ;
} ;



Bundle.prototype.extractPackages = function() {
	if ( ! this.metadata ) { this.extractMetadata() ; }

	var moduleList = [] ,
		position = 0 ,
		startBoundary = "BROTHERHOOD_START_PACKAGE('" + this.metadata.boundary + "');" ,
		endBoundary = "BROTHERHOOD_END_PACKAGE('" + this.metadata.boundary + "');" ;

	while ( position < this.content.length ) {
		let startIndex = this.content.indexOf( startBoundary , position ) ;
		if ( startIndex === -1 ) { break ; }
		startIndex += startBoundary.length ;
		let endIndex = this.content.indexOf( endBoundary , startIndex ) ;
		if ( endIndex === -1 ) { break ; }
		let area = this.content.slice( startIndex , endIndex ) ;

		let startMatch = area.match( /^\s*Package.prepare\( ?'([^']*)' ?, ?'([^']*)' ?, ?(?:null|'([^']*)') ?\) ?;/ ) ;
		if ( ! startMatch ) {
			throw utils.userError( "Bundle parse error (may have been modified, can't find start match)..." ) ;
		}

		let [ , id , packageId , aliasId ] = startMatch ;

		let content = area.slice( startMatch[ 0 ].length , area.length ) ;
		moduleList.push( {
			id , packageId , aliasId , content
		} ) ;

		position = endIndex + endBoundary.length ;
	}

	return moduleList ;
} ;

