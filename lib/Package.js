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



const path = require( 'path' ) ;
const fsPromise = require( 'fs' ).promises ;

const string = require( 'string-kit' ) ;

const JsModule = require( './JsModule.js' ) ;

const Logfella = require( 'logfella' ) ;
const log = Logfella.global.use( 'brotherhood' ) ;



/*
	This describes one JS module.
*/

function Package( params = {} ) {
	this.id = params.id ;	// The module ID in the target (browser) system
	this.path = params.path ;	// The path in the original (node) system

	this.mainModuleId = params.mainModuleId ;	// The main file ID in the target (browser) system
	this.mainModulePath = params.mainModulePath ;	// The main file path in the original (node) system

	this.modules = [] ;

	var json = require( path.join( this.path , 'package.json' ) ) ;
	this.name = json.name ;
	this.version = json.version ;
}

module.exports = Package ;



Package.prototype.addModule = function( module_ ) {
	this.modules.push( module_ ) ;
	module_.package = this ;
} ;



Package.prototype.pack = async function() {
	var str = await JsModule.applyWrapperId( 'package' , {
		packageId: this.id ,
		packageMainModuleId: this.mainModuleId ,
		packageName: this.name ,
		packageVersion: this.version
	} ) ;

	return str ;
} ;

