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



const fs = require( 'fs' ) ;

const string = require( 'string-kit' ) ;
const cliManager = require( 'utterminal' ).cli ;
const term = require( 'terminal-kit' ).terminal ;

const brotherhoodPackage = require( '../package.json' ) ;
const Brotherhood = require( './Brotherhood.js' ) ;

const Logfella = require( 'logfella' ) ;
const log = Logfella.global.use( 'brotherhood' ) ;



async function cli() {
	/* eslint-disable indent */
	cliManager.package( brotherhoodPackage )
		.app( 'Brotherhood' )
		.description( "Turn Node.js CommonJs into browser packages." )
		.usage( "[--option1] [--option2] [...]" )
		.introIfTTY
		//.helpOption
		.commonOptions
		.camel
		.commonCommands
		.commandRequired

		//.opt( 'script-debug' , false ).flag
		//	.description( "Activate debug-level logs for scripts ([debug] tag)" )

		.command( 'pack' )
			.usage( "<input1.js> [<input2.js>] [...] [-o <output-package.js>] [--option1] [--option2] [...]" )
			.description( "Create a browser package." )
			.restArgs( 'inputs' ).string
				.typeLabel( 'inputs' )
				.description( "The input files to package" )
			.opt( [ 'output' , 'o' ] ).string
				.typeLabel( 'output-package' )
				.description( "The output file" )
			.opt( [ 'discovery' , 'discover' , 'd' ] ).flag
				.description( "Discover new input files by finding static require() statement inside JS files" )
			.opt( [ 'execute' , 'x' ] ).flag
				.description( "Execute the first module (stand-alone mode)" )
			.opt( [ 'global' , 'g' ] ).string
				.typeLabel( 'identifier' )
				.description( "Execute the first module and globally expose it using this identifier (global mode)" )
			.opt( [ 'require' , 'r' ] ).flag
				.description( "Globally expose the require function (require mode)" )
			.opt( [ 'esm' , 'e' ] ).flag
				.description( "Export one ESM module (ESM mode)" )
			.opt( [ 'root' ] ).string
				.description( "The root path used when requiring with an absolute path" )
			.opt( [ 'package-json' , 'pjson' ] ).string
				.description( "Specify a package.json for the main module (used when the browser has its own entry point, else use the main directory as input instead)" )
			.opt( [ 'shrink' , 's' ] ).flag
				.description( "Shrink the bundle: remove comments and repeated white-spaces (experimental)" )
		.command( 'meta' )
			.usage( "<brotherhood-bundle> [--option1] [--option2] [...]" )
			.description( "Extract metadata from an existing Brotherhood bundle." )
			.arg( 'input' ).string
				.typeLabel( 'input' )
				.description( "The input package to extract metadata from" )
		.command( 'analyse' )
			.usage( "<input.js> [--option1] [--option2] [...]" )
			.description( "Analyse an input files, mostly for debugging purpose." )
			.arg( 'input' ).string
				.typeLabel( 'input' )
				.description( "The input files to analyse" )
			.opt( [ 'package-json' , 'pjson' ] ).string
				.description( "Specify a package.json for the main module (used when the browser has its own entry point, else use the main directory as input instead)" ) ;
	/* eslint-enable indent */

	var args = cliManager.run() ;
	//console.log( args ) ;


	// Init Logfella main logger
	Logfella.global.configure( {
		minLevel: args.log ,
		overrideConsole: true ,
		transports: [
			{
				type: 'console' , timeFormatter: 'time' , color: true , output: 'stderr'
			}
		]
	} ) ;

	switch ( args.command ) {
		case 'pack' :
			return cli.pack( args ) ;
		case 'meta' :
			return cli.meta( args ) ;
		case 'analyse' :
			return cli.analyse( args ) ;
	}
}

module.exports = cli ;



cli.pack = async function( args ) {
	var bundleContent ;

	try {
		var brotherhood = new Brotherhood( {
			inputPaths: args.inputs ,
			outputPath: args.output ,
			mainPackageJsonPath: args.packageJson ,
			discovery: args.discovery ,
			execute: args.execute ,
			exposeMainAs: args.global ,
			exposeRequire: args.require ,
			exportAsEsm: args.esm ,
			rootPath: args.root ,
			shrink: args.shrink
		} ) ;

		bundleContent = await brotherhood.pack() ;
	}
	catch ( error ) {
		if ( error.userError ) {
			log.error( "%s" , error ) ;
		}
		else {
			log.fatal( "%E" , error ) ;
			throw error ;
		}
	}

	if ( ! args.output ) {
		process.stdout.write( bundleContent ) ;
	}
} ;



const format = string.createFormatter( { color: true } ) ;

cli.meta = async function( args ) {
	try {
		var metadata = Brotherhood.extractMetadataFromBundle( await fs.promises.readFile( args.input , 'utf8' ) ) ;
		process.stdout.write( format( "%O\n" , metadata ) ) ;
	}
	catch ( error ) {
		if ( error.userError ) {
			log.error( "%s" , error ) ;
		}
		else {
			log.fatal( "%E" , error ) ;
			throw error ;
		}
	}
} ;



// Mostly for debug
cli.analyse = async function( args ) {
	var analyseData = '' ;

	try {
		var brotherhood = new Brotherhood( {
			inputPaths: [ args.input ] ,
			mainPackageJsonPath: args.packageJson ,
			discovery: true
		} ) ;

		analyseData = await brotherhood.analyse() ;
	}
	catch ( error ) {
		if ( error.userError ) {
			log.error( "%s" , error ) ;
		}
		else {
			log.fatal( "%E" , error ) ;
			throw error ;
		}
	}

	term( "Packages: %i\n" , analyseData.packages.length ) ;
	for ( let package_ of analyseData.packages ) {
		term( "    %s\n" , package_.id ) ;
	}

	term( "Modules: %i\n" , analyseData.modules.length ) ;
	for ( let module_ of analyseData.modules ) {
		term( "    %s\n" , module_.id ) ;
	}
} ;

