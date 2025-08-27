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
const fs = require( 'fs' ) ;
const fsKit = require( 'fs-kit' ) ;

//const string = require( 'string-kit' ) ;

const utils = require( './utils.js' ) ;
const JsModule = require( './JsModule.js' ) ;
const Package = require( './Package.js' ) ;

const brotherhoodPackageJson = require( '../package.json' ) ;

const Logfella = require( 'logfella' ) ;
const log = Logfella.global.use( 'brotherhood' ) ;



const SIGNATURE = 'const BROTHERHOOD_BUNDLE=' ;



function Brotherhood( params = {} ) {
	this.inputPaths = params.inputPaths || [] ;	// Filepath of either modules or node packages
	this.modulePaths = params.modulePaths || [] ;	// Filepaths of modules
	this.packagePaths = params.packagePaths || [] ;	// Filepath of packages (packagePath + /package.json to get info on it)
	this.modulePathsSet = null ;	// Set and modified at runtime
	this.packagePathsSet = null ;	// idem
	this.outputPath = params.outputPath ;

	this.discovery = !! params.discovery ;

	this.rootPath = params.rootPath ?? null ;

	this.execute = !! params.execute ;
	this.exposeMainAs = params.exposeMainAs ?? null ;
	this.exposeRequire = !! params.exposeRequire ;
	this.exportAsEsm = !! params.exportAsEsm ;

	this.isInit = false ;
}

module.exports = Brotherhood ;



Brotherhood.prototype.init = async function() {
	if ( this.isInit ) { return ; }

	await this.fixPath() ;

	this.modulePathsSet = new Set( this.modulePaths ) ,
	this.packagePathsSet = new Set( this.packagePaths ) ;

	this.isInit = true ;

	/*
	log.hdebug( "rootPath: %s" , this.rootPath ) ;
	log.hdebug( "modulePaths: %n" , this.modulePaths ) ;
	log.hdebug( "packagePaths: %n" , this.packagePaths ) ;
	//process.exit() ;
	*/
} ;



Brotherhood.prototype.fixPath = async function() {

	// First, convert all inputPaths to either modulePaths or packagePaths

	var dirPaths = new Set() ,
		srcInputPaths = Array.from( this.inputPaths ) ;

	for ( let i = 0 ; i < srcInputPaths.length ; i ++ ) {
		let inputPath = srcInputPaths[ i ] ;

		if ( inputPath.includes( '*' ) ) {
			// Just add more source files
			srcInputPaths.push( ... await fsKit.glob( inputPath ) ) ;
			continue ;
		}

		if ( await fsKit.isFile( inputPath ) ) {
			this.modulePaths.push( inputPath ) ;
		}
		else if ( await fsKit.isDirectory( inputPath ) ) {
			let packageJsonPath = path.join( inputPath , 'package.json' ) ;

			if ( await fsKit.isFile( packageJsonPath ) ) {
				let mainModulePath = require.resolve( inputPath ) ;
				if ( mainModulePath ) {
					this.packagePaths.push( inputPath ) ;
					this.modulePaths.push( mainModulePath ) ;
				}
			}
			else {
				//log.error( "Can't find input file: %s" , inputPath ) ;
				throw utils.userError( "Can't find input file: " + inputPath ) ;
			}
		}
	}


	// Then, turn all paths to real path

	for ( let i = 0 ; i < this.modulePaths.length ; i ++ ) {
		let path_ = await fs.promises.realpath( this.modulePaths[ i ] ) ;
		this.modulePaths[ i ] = path_ ;
		dirPaths.add( path.dirname( path_ ) ) ;
	}

	for ( let i = 0 ; i < this.packagePaths.length ; i ++ ) {
		let path_ = await fs.promises.realpath( this.packagePaths[ i ] ) ;
		this.packagePaths[ i ] = path_ ;
		dirPaths.add( path_ ) ;
	}


	// Now fix root path

	if ( this.rootPath ) {
		this.rootPath = await fs.promises.realpath( this.rootPath ) ;
		return ;
	}


	// Here, no rootPath was given, try to guess one from all paths...

	dirPaths = [ ... dirPaths ] ;

	if ( dirPaths.length === 1 ) {
		// If there is only one input, it's the directory of those file
		this.rootPath = dirPaths[ 0 ] ;
		return ;
	}


	// Try to find a common directory for all input files

	var maxLength = Infinity ;
	var dirsParts = this.inputPaths.map( path_ => {
		var parts = path_.split( '/' ) ;
		if ( parts.length < maxLength ) { maxLength = parts.length ; }
		return parts ;
	} ) ;

	var common = [] ;
	var refDirParts = dirsParts.pop() ;
	for ( let i = 0 ; i < maxLength ; i ++ ) {
		if ( dirsParts.every( dirParts => dirParts[ i ] === refDirParts[ i ] ) ) {
			common.push( refDirParts[ i ] ) ;
		}
		else {
			break ;
		}
	}

	if ( common.length ) {
		this.rootPath = common.join( '/' ) ;
	}
	else {
		throw utils.userError( "Can't find a common root path" ) ;
	}
} ;



const NODE_CORE_MODULES = {
	path: path.join( __dirname , '../node_modules/path-browserify/' )
} ;



Brotherhood.prototype.resolveRequirePath = async function( requirePath , relativeTo ) {
	if ( path.isAbsolute( requirePath ) || requirePath.startsWith( '~/' ) ) {
		throw utils.userError( ".resolveRequirePath(): can't add an absolute path to the package: " + requirePath ) ;
	}

	var packagePath , packageJsonPath , packageId ,
		modulePath = requirePath ;

	//log.hdebug( ".resolveRequirePath() IN: %s (%s) (%s)" , requirePath , relativeTo , path.isAbsolute( requirePath ) ) ;

	if ( requirePath === '.' || requirePath === '..' || requirePath.startsWith( './' ) || requirePath.startsWith( '../' ) ) {
		modulePath = require.resolve( requirePath , { paths: [ relativeTo ] } ) ;

		let expectedInputPath = path.join( relativeTo , requirePath ) ;
		//log.hdebug( ".resolveRequirePath() REL: %s (%s)" , modulePath , expectedInputPath ) ;

		if ( expectedInputPath !== modulePath ) {
			packagePath = expectedInputPath ;
			packageJsonPath = path.join( packagePath , 'package.json' ) ;
		}
	}
	else {
		// This is a package!!!
		modulePath = require.resolve( requirePath , { paths: [ relativeTo ] } ) ;

		//log.hdebug( ".resolveRequirePath() REQUIRE.RESOLVE: %s" , modulePath ) ;

		let parts = modulePath.split( path.sep ) ;
		let indexOf = parts.lastIndexOf( 'node_modules' ) ;

		if ( indexOf === -1 ) {
			// Maybe it's a node.js core package
			let nodeCoreModule = null ;

			if ( parts.length === 1 ) {
				if ( modulePath.startsWith( 'core:' ) ) {
					let maybeNodeCoreModule = modulePath.slice( 5 ) ;
					if ( Object.hasOwn( NODE_CORE_MODULES , maybeNodeCoreModule ) ) {
						nodeCoreModule = maybeNodeCoreModule ;
					}
				}
				else if ( Object.hasOwn( NODE_CORE_MODULES , modulePath ) ) {
					nodeCoreModule = modulePath ;
				}
			}

			if ( ! nodeCoreModule ) {
				throw utils.userError( "Non-core package not resolving inside the node_modules directory (probably not found): " + requirePath + " --> " + modulePath ) ;
			}

			packageId = nodeCoreModule ;
			packagePath = NODE_CORE_MODULES[ nodeCoreModule ] ;
		}
		else {
			// /!\ Is packageId useful?
			// Better get it from package.json later...

			if ( parts[ indexOf + 1 ][ 0 ] === '@' ) {
				packageId = path.join( parts[ indexOf + 1 ] , parts[ indexOf + 2 ] ) ;
				packagePath = parts.slice( 0 , indexOf + 3 ).join( path.sep ) ;
			}
			else {
				packageId = parts[ indexOf + 1 ] ;
				packagePath = parts.slice( 0 , indexOf + 2 ).join( path.sep ) ;
			}
		}
	}

	if ( packagePath ) {
		packageJsonPath = path.join( packagePath , 'package.json' ) ;
		if ( ! await fsKit.isFile( packageJsonPath ) ) {
			throw utils.userError( "Can't find package.json: " + packageJsonPath ) ;
		}
	}

	//if ( packageJsonPath ) { log.warning( "\t==> packageJsonPath: %s" , packageJsonPath ) ; }

	return {
		modulePath , packageId , packagePath , packageJsonPath
	} ;
} ;



const BROTHERHOOD_CORE_MODULES = [
	'Module.js' ,
	'process.js'
] ;



Brotherhood.prototype.pack = async function() {
	if ( ! this.isInit ) { await this.init() ; }

	var bundleContent = '' ;

	var signatureData = {
		name: undefined ,	// reserve those keys, so they will appear first in the JSON if set
		version: undefined ,
		type: 'silent' ,
		exposeRequire: undefined ,
		bundler: brotherhoodPackageJson.name ,
		bundlerVersion: brotherhoodPackageJson.version ,
		packages: []
	} ;


	// Add core modules

	for ( let coreModuleName of BROTHERHOOD_CORE_MODULES ) {
		let coreModule = new JsModule( {
			body: await fs.promises.readFile( path.join( __dirname , 'browser' , coreModuleName ) , 'utf8' )
		} ) ;
		bundleContent += await coreModule.pack() ;
	}


	// Get all modules and all packages, then link them

	var modules = await this.getModules() ;
	var packages = this.getPackages() ;
	this.linkModulesToPackages( modules , packages ) ;


	// Pack all packages and all modules

	for ( let package_ of packages ) {
		bundleContent += await package_.pack() ;
		signatureData.packages.push( {
			name: package_.name ,
			version: package_.version ,
			id: package_.id
			//offset: bundleContent.length	// The offset is the position in the file AFTER the signature
		} ) ;
	}

	for ( let module_ of modules ) {
		bundleContent += await module_.pack() ;
	}


	// Apply the appropriate wrapper (esm, require, and so on...)

	if ( this.exportAsEsm ) {
		bundleContent = await JsModule.applyWrapperId( 'esm' , { body: bundleContent } ) ;
		signatureData.type = 'esm' ;
	}
	else {
		if ( this.exposeMainAs ) {
			bundleContent = await JsModule.applyWrapperId( 'expose-main' , { body: bundleContent , exposeName: this.exposeMainAs } ) ;
			signatureData.type = 'expose-main' ;
		}
		else if ( this.execute ) {
			bundleContent = await JsModule.applyWrapperId( 'execute' , { body: bundleContent } ) ;
			signatureData.type = 'execute' ;
		}

		if ( this.exposeRequire ) {
			bundleContent = await JsModule.applyWrapperId( 'expose-require' , { body: bundleContent } ) ;
			signatureData.exposeRequire = true ;
		}

		bundleContent = await JsModule.applyWrapperId( 'pack' , { body: bundleContent } ) ;
	}


	// Add the Brotherhood's bundle signature

	var mainPackage = modules[ 0 ].package ;
	if ( mainPackage ) {
		signatureData.name = mainPackage.name ;
		signatureData.version = mainPackage.version ;
	}

	/*
		The whole signature consists in starting the file with: const BROTHERHOOD_BUNDLE=
		... and the first line ends with: ;\n
		The part between braces is a one-line JSON, allowing to extract bundle metadata easily without parsing the whole file.
		The metadata could even be used to help parsing the file, containing offsets, so it could be possible
		to merge multiple Brotherhood bundles easily
	*/
	bundleContent = SIGNATURE + JSON.stringify( signatureData ) + ';\n' + bundleContent ;


	// Finally, write the output file

	if ( this.outputPath ) {
		await fs.promises.writeFile( this.outputPath , bundleContent ) ;
	}

	return bundleContent ;
} ;



Brotherhood.prototype.getModules = async function() {
	var modules = [] ;

	for ( let modulePath of this.modulePaths ) {
		let id = modulePath ;
		let type = path.extname( modulePath ) === '.json' ? 'json' : 'cjs' ;
		id = path.relative( this.rootPath , id ) ;

		if ( id === '..' || id.startsWith( '../' ) ) {
			throw utils.userError( "Can't include module '" + modulePath + "' which is outside of the root path '" + this.rootPath + "' (id: '" + id + "')" ) ;
		}

		id = '/' + id ;

		let module_ = new JsModule( {
			id ,
			path: modulePath ,
			type ,
			body: await fs.promises.readFile( modulePath , 'utf8' ) ,
			wrappers: type === 'json' ? [ 'json' ] : [ 'module' ]
		} ) ;
		module_.analyse( true ) ;

		//console.log( "staticRequireList:" , module_.staticRequireList ) ;
		//*
		if ( this.discovery ) {
			for ( let newRequirePath of module_.staticRequireList ) {
				let requireDetails ;

				try {
					requireDetails = await this.resolveRequirePath( newRequirePath , module_.dir ) ;
				}
				catch ( error ) {
					throw utils.userError( "Can't find module: " + newRequirePath + " required by " + modulePath , error ) ;
				}

				//log.hdebug( "Static require: %s --> %I" , newRequirePath , requireDetails ) ;
				if ( requireDetails.modulePath && ! this.modulePathsSet.has( requireDetails.modulePath ) ) {
					this.modulePaths.push( requireDetails.modulePath ) ;
					this.modulePathsSet.add( requireDetails.modulePath ) ;
					log.verbose( "Discovered a new source file: %s" , requireDetails.modulePath ) ;
				}

				if ( requireDetails.packagePath && ! this.packagePathsSet.has( requireDetails.packagePath ) ) {
					this.packagePaths.push( requireDetails.packagePath ) ;
					this.packagePathsSet.add( requireDetails.packagePath ) ;
					log.verbose( "Discovered a new package: %s" , requireDetails.packagePath ) ;
				}
			}
		}
		//*/

		modules.push( module_ ) ;
	}

	//console.log( 'JsModules:' , modules ) ;

	return modules ;
} ;



Brotherhood.prototype.getPackages = function() {
	var packages = [] ;

	for ( let packagePath of this.packagePaths ) {
		let id = packagePath ;
		let mainModulePath = require.resolve( packagePath ) ;
		let mainModuleId = mainModulePath ;

		id = path.relative( this.rootPath , id ) ;

		if ( id === '..' || id.startsWith( '../' ) ) {
			throw utils.userError( "Can't include package '" + packagePath + "' which is outside of the root path '" + this.rootPath + "' (id: '" + id + "')" ) ;
		}

		id = '/' + id ;

		mainModuleId = path.relative( this.rootPath , mainModuleId ) ;

		if ( mainModuleId === '..' || mainModuleId.startsWith( '../' ) ) {
			throw utils.userError( "Can't include main module '" + mainModulePath + "' from package '" + packagePath + "' which is outside of the root path '" + this.rootPath + "' (id: '" + mainModuleId + "')" ) ;
		}

		mainModuleId = '/' + mainModuleId ;

		let package_ = new Package( {
			id ,
			path: packagePath ,
			mainModuleId ,
			mainModulePath
		} ) ;

		packages.push( package_ ) ;
		log.verbose( "Add package: %Y" , package_ ) ;
	}

	return packages ;
} ;



// Make packages and their modules know each others
Brotherhood.prototype.linkModulesToPackages = function( modules , packages ) {
	var sortedPackages = Array.from( packages ).sort( ( a , b ) => b.id.length - a.id.length ) ;
	//log.hdebug( "sortedPackages: %I" , sortedPackages ) ;

	for ( let module_ of modules ) {
		for ( let package_ of sortedPackages ) {
			let dir = package_.id ;
			if ( dir[ dir.length - 1 ] !== '/' ) { dir += '/' ; }
			if ( module_.id.startsWith( dir ) ) {
				// Found a matching module!
				package_.addModule( module_ ) ;
				break ;
			}
		}
	}

	//log.hdebug( "modules: %[l50000]I" , modules ) ;
	//log.hdebug( "packages: %I" , packages ) ;
} ;



Brotherhood.prototype.analyse = async function() {
	if ( ! this.isInit ) { await this.init() ; }

	var analyseData = {
		packages: [] ,
		modules: []
	} ;

	// Get all modules and all packages
	var modules = await this.getModules() ;
	var packages = this.getPackages() ;

	for ( let package_ of packages ) {
		analyseData.packages.push( {
			id: package_.id ,
			name: package_.name ,
			version: package_.version
		} ) ;
	}

	for ( let module_ of modules ) {
		analyseData.modules.push( {
			id: module_.id ,
			path: module_.path
		} ) ;
	}

	return analyseData ;
} ;



Brotherhood.extractMetadataFromPackage = function( content ) {
	var eof , metadata ;

	if ( ! content.startsWith( SIGNATURE + '{' ) || ( eof = content.indexOf( '};\n' ) ) === -1 ) {
		throw utils.userError( "This is not a Brotherhood bundle..." ) ;
	}

	try {
		metadata = JSON.parse( content.slice( SIGNATURE.length , eof + 1 ) ) ;
	}
	catch ( error ) {
		throw utils.userError( "This is not a Brotherhood bundle (can't parse metadata)..." ) ;
	}

	return metadata ;
} ;

