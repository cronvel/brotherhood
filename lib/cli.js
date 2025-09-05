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
const Bundle = require( './Bundle.js' ) ;

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
		.command( 'analyse' )
			.usage( "<input.js> [--option1] [--option2] [...]" )
			.description( "Analyse an input files, mostly for debugging purpose." )
			.arg( 'input' ).string
				.typeLabel( 'input' )
				.description( "The input files to analyse" )
			.opt( [ 'root' ] ).string
				.description( "The root path used when requiring with an absolute path" )
			.opt( [ 'package-json' , 'pjson' ] ).string
				.description( "Specify a package.json for the main module (used when the browser has its own entry point, else use the main directory as input instead)" )
		.command( 'info' )
			.usage( "<brotherhood-bundle> [--option1] [--option2] [...]" )
			.description( "Extract metadata from an existing Brotherhood bundle." )
			.arg( 'input' ).string
				.typeLabel( 'input' )
				.description( "The input bundle to extract metadata from" )
			.opt( [ 'modules' ] ).flag
				.description( "Extract module names" )
		.command( 'extract' )
			.usage( "<brotherhood-bundle> [--option1] [--option2] [...]" )
			.description( "Extract a module or a package from an existing Brotherhood bundle." )
			.arg( 'input' ).string
				.typeLabel( 'input' )
				.description( "The input bundle to extract metadata from" )
			.opt( [ 'package' , 'p' ] ).string
				.description( "Extract this package by ID or by name" )
			.opt( [ 'module' , 'm' ] ).string
				.description( "Extract this module by ID" ) ;
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
		case 'analyse' :
			return cli.analyse( args ) ;
		case 'info' :
			return cli.info( args ) ;
		case 'extract' :
			return cli.extract( args ) ;
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



// Mostly for debug
cli.analyse = async function( args ) {
	var analyseData ;

	try {
		var brotherhood = new Brotherhood( {
			inputPaths: [ args.input ] ,
			mainPackageJsonPath: args.packageJson ,
			discovery: true ,
			rootPath: args.root
		} ) ;

		analyseData = await brotherhood.analyse() ;
	}
	catch ( error ) {
		if ( error.userError ) {
			log.error( "%s" , error ) ;
			process.exit( 1 ) ;
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



const format = string.createFormatter( { color: true } ) ;

cli.info = async function( args ) {
	try {
		let bundle = new Bundle( await fs.promises.readFile( args.input , 'utf8' ) ) ;
		let metadata = bundle.extractMetadata() ;
		process.stdout.write( format( "%O\n" , metadata ) ) ;

		if ( args.modules ) {
			let moduleList = bundle.extractModules() ;
			process.stdout.write( format( "Found %i modules:\n\n" , moduleList.length ) ) ;
			for ( let moduleData of moduleList ) {
				process.stdout.write( moduleData.id + "\n" ) ;
			}
		}
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



cli.extract = async function( args ) {
	if ( ! args.package && ! args.module ) {
		console.error( "Expecting option --module or --package" ) ;
		process.exit( 1 ) ;
	}

	var bundle , metadata ;

	try {
		bundle = new Bundle( await fs.promises.readFile( args.input , 'utf8' ) ) ;
		metadata = bundle.extractMetadata() ;
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

	if ( ! Array.isArray( metadata.packages ) ) {
		log.error( "Bundle metadata should have a 'packages' key of Array type." ) ;
		process.exit( 1 ) ;
	}

	if ( args.package ) {
		let packageList = bundle.extractPackages() ;
		let packageData = packageList.filter( p => p.id === args.package )[ 0 ] ;
		if ( ! packageData ) {
			// Try using the package name instead
			let packageMetadata = metadata.packages.filter( p => p.name === args.package )[ 0 ] ;
			if ( ! packageMetadata ) {
				log.error( "Package '%s' not found in the bundle" , args.package ) ;
				process.exit( 1 ) ;
			}
			packageData = packageList.filter( p => p.id === packageMetadata.id )[ 0 ] ;
			if ( ! packageData ) {
				log.error( "Package '%s' not found in the bundle" , args.package ) ;
				process.exit( 1 ) ;
			}
		}

		process.stdout.write( packageData.content + "\n" ) ;
	}
	else if ( args.module ) {
		let moduleList = bundle.extractModules() ;
		let moduleData = moduleList.filter( m => m.id === args.module )[ 0 ] ;
		if ( ! moduleData ) {
			log.error( "Module '%s' not found in the bundle" , args.module ) ;
			process.exit( 1 ) ;
		}

		process.stdout.write( moduleData.content + "\n" ) ;
	}
} ;

