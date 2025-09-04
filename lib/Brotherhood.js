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
const hash = require( 'hash-kit' ) ;

//const string = require( 'string-kit' ) ;

const utils = require( './utils.js' ) ;
const JsModule = require( './JsModule.js' ) ;
const Package = require( './Package.js' ) ;
const parseLXON = require( './lxonParser.min.js' ) ;

const brotherhoodPackageJson = require( '../package.json' ) ;

const Logfella = require( 'logfella' ) ;
const log = Logfella.global.use( 'brotherhood' ) ;



// Mandatory core modules
const BROTHERHOOD_CORE_MODULES = [
	'Module.js'
] ;

const NODE_CORE_BASE_PATH = path.join( __dirname , '../node_modules' ) ;

// Get the list of package here: https://www.npmjs.com/package/node-stdlib-browser
const NODE_CORE_MODULES = {
	assert: path.join( NODE_CORE_BASE_PATH , '/assert' ) ,
	buffer: path.join( NODE_CORE_BASE_PATH , '/buffer' ) ,
	console: path.join( NODE_CORE_BASE_PATH , '/console-browserify' ) ,
	crypto: path.join( NODE_CORE_BASE_PATH , '/crypto-browserify' ) ,
	events: path.join( NODE_CORE_BASE_PATH , '/events' ) ,
	//os: path.join( NODE_CORE_BASE_PATH , '/os-browserify' ) ,	// Not very useful, end old, either drop it or have my own
	path: path.join( NODE_CORE_BASE_PATH , '/path-browserify' ) ,
	querystring: path.join( NODE_CORE_BASE_PATH , '/querystring' ) ,	// Better than querystring-es3 referenced by node-stdlib-browser
	stream: path.join( NODE_CORE_BASE_PATH , '/stream-browserify' ) ,
	string_decoder: path.join( NODE_CORE_BASE_PATH , '/string_decoder' ) ,
	//timers or timers/promises: timers-browserify or isomorphic-timers-browserify		// Not sure if it's good to include that...
	//tty: tty-browserify
	url: path.join( NODE_CORE_BASE_PATH , '/url' ) ,
	util: path.join( NODE_CORE_BASE_PATH , '/util' )
	//vm: vm-browserify			// Probably not a good idea
	//zlib: browserify-zlib		// Very old, and probably not a good idea, browser now have there own native zlib implementation
} ;

// Global node core modules that depends on an external package
const GLOBAL_NODE_CORE_MODULE_DEPENDENCIES = {
	Buffer: 'buffer'
} ;

const BROWSER_CORE_PREFIX = '/[core]/node_modules/' ;



function Brotherhood( params = {} ) {
	this.inputPaths = params.inputPaths || [] ;	// Filepath of either modules or node packages
	this.outputPath = params.outputPath ;
	this.mainPackageJsonPath = params.mainPackageJsonPath || null ;	// Filepath of a package.json corresponding to the main module/entry-point
	this.mainPackageJson = params.mainPackageJson || null ;	// package.json corresponding to the main module/entry-point

	// List of modules and packages.
	// Data is an object with optional properties: { modulePath , packagePath , packageJsonPath , isCore }
	this.moduleDataList = [] ;
	this.packageDataList = [] ;

	// Set and modified at runtime, keeping track of paths
	this.modulePathSet = new Set() ;
	this.packagePathSet = new Set() ;
	this.globalNodeModuleSet = new Set() ;

	// Actual JsModule instances and Package instances
	this.moduleList = [] ;
	this.packageList = [] ;

	this.discovery = !! params.discovery ;
	this.shrink = !! params.shrink ;

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
	this.isInit = true ;

	/*
	log.hdebug( "rootPath: %s" , this.rootPath ) ;
	log.hdebug( "moduleDataList: %n" , this.moduleDataList ) ;
	log.hdebug( "packageDataList: %n" , this.packageDataList ) ;
	//process.exit() ;
	*/
} ;



Brotherhood.prototype.analyse = async function() {
	if ( ! this.isInit ) { await this.init() ; }

	var analyseData = {
		packages: [] ,
		modules: []
	} ;

	//log.hdebug( "instance: %Y" , this ) ;

	// Get all modules and all packages
	await this.getModules() ;
	await this.addMainPackage( this.moduleList[ 0 ] ) ;
	this.getPackages() ;
	this.linkModulesToPackages() ;

	for ( let package_ of this.packageList ) {
		analyseData.packages.push( {
			id: package_.id ,
			name: package_.name ,
			version: package_.version
		} ) ;
	}

	for ( let module_ of this.moduleList ) {
		analyseData.modules.push( {
			id: module_.id ,
			path: module_.path
		} ) ;
	}

	return analyseData ;
} ;



Brotherhood.prototype.pack = async function() {
	if ( ! this.isInit ) { await this.init() ; }

	var boundary = hash.randomBase62String( 32 ) ;
	var bundleContent = '' ;

	var signatureData = {
		bundler: brotherhoodPackageJson.name ,
		bundlerVersion: brotherhoodPackageJson.version ,
		name: undefined ,	// reserve those keys, so they will appear first in the JSON if set
		version: undefined ,
		type: 'silent' ,
		exposeRequire: undefined ,
		mainGlobal: undefined ,
		globals: [] ,
		boundary ,
		packages: []
	} ;


	// Add Brotherhood core modules

	for ( let coreModuleName of BROTHERHOOD_CORE_MODULES ) {
		let coreModule = new JsModule( {
			body: await fs.promises.readFile( path.join( __dirname , 'browser' , coreModuleName ) , 'utf8' )
		} ) ;
		if ( this.shrink ) { coreModule.shrink() ; }
		bundleContent += await coreModule.pack( boundary ) ;
	}


	// Get all modules and all packages, then link them

	await this.getModules() ;
	await this.addMainPackage( this.moduleList[ 0 ] ) ;
	this.getPackages() ;
	this.linkModulesToPackages() ;
	this.buildCoreAliases() ;


	// Pack all packages and all modules

	for ( let package_ of this.packageList ) {
		// Pack modules that belong to this package
		let packageContent = '' ;
		for ( let module_ of package_.modules ) {
			if ( this.shrink ) { module_.shrink() ; }
			packageContent += await module_.pack( boundary ) ;
		}

		// Pack the whole package
		bundleContent += await package_.pack( boundary , packageContent ) ;

		// Add to bundle metadata
		signatureData.packages.push( {
			name: package_.name ,
			version: package_.version ,
			id: package_.id		// For instance it is used by the class the Package of browser/Module.js
		} ) ;
	}

	// Pack modules not belonging to any package
	for ( let module_ of this.moduleList ) {
		if ( ! module_.package ) {
			if ( this.shrink ) { module_.shrink() ; }
			bundleContent += await module_.pack( boundary ) ;
		}
	}


	// Add Global Node Module (should come after module pack, since some of them depends on external module, e.g.: Buffer)

	for ( let coreModuleName of this.globalNodeModuleSet ) {
		let coreModule = new JsModule( {
			body: await fs.promises.readFile( path.join( __dirname , 'browser' , coreModuleName + '.js' ) , 'utf8' )
		} ) ;
		if ( this.shrink ) { coreModule.shrink() ; }
		bundleContent += await coreModule.pack( boundary ) ;
	}


	// Finish the Brotherhood signature/meta

	let mainPackage = this.moduleList[ 0 ].package ;
	if ( mainPackage ) {
		signatureData.name = mainPackage.name ;
		signatureData.version = mainPackage.version ;
	}


	// Apply the appropriate wrapper (esm, require, and so on...)

	if ( this.exportAsEsm ) {
		signatureData.type = 'esm' ;
		bundleContent = await JsModule.applyWrapperId( 'esm-bundle' , { body: bundleContent , signature: signatureData } ) ;
	}
	else {
		if ( this.exposeMainAs ) {
			signatureData.type = 'expose-main' ;
			signatureData.mainGlobal = this.exposeMainAs ;
			signatureData.globals.push( this.exposeMainAs ) ;
			bundleContent = await JsModule.applyWrapperId( 'expose-main' , { body: bundleContent , exposeName: this.exposeMainAs } ) ;
		}
		else if ( this.execute ) {
			signatureData.type = 'execute' ;
			bundleContent = await JsModule.applyWrapperId( 'execute' , { body: bundleContent } ) ;
		}

		if ( this.exposeRequire ) {
			signatureData.exposeRequire = true ;
			signatureData.globals.push( 'require' ) ;
			bundleContent = await JsModule.applyWrapperId( 'expose-require' , { body: bundleContent } ) ;
		}

		bundleContent = await JsModule.applyWrapperId( 'bundle' , { body: bundleContent , signature: signatureData } ) ;
	}


	// Finally, write the output file

	if ( this.outputPath ) {
		await fs.promises.writeFile( this.outputPath , bundleContent ) ;
	}

	return bundleContent ;
} ;



Brotherhood.prototype.getModules = async function() {
	for ( let moduleData of this.moduleDataList ) {
		let id ;
		let type = path.extname( moduleData.modulePath ) === '.json' ? 'json' : 'cjs' ;

		if ( moduleData.isCore ) {
			// Relocate core package
			id = path.relative( NODE_CORE_BASE_PATH , moduleData.modulePath ) ;

			if ( id === '..' || id.startsWith( '../' ) ) {
				throw utils.userError( "Can't include module '" + moduleData.modulePath + "' which is outside of the core modules path '" + NODE_CORE_BASE_PATH + "' (id: '" + id + "')" ) ;
			}

			id = BROWSER_CORE_PREFIX + id ;
		}
		else {
			// Make the path relative to the root path
			id = path.relative( this.rootPath , moduleData.modulePath ) ;

			if ( id === '..' || id.startsWith( '../' ) ) {
				throw utils.userError( "Can't include module '" + moduleData.modulePath + "' which is outside of the root path '" + this.rootPath + "' (id: '" + id + "')" ) ;
			}

			id = '/' + id ;
		}

		let module_ = new JsModule( {
			id ,
			path: moduleData.modulePath ,
			type ,
			body: await fs.promises.readFile( moduleData.modulePath , 'utf8' ) ,
			wrappers: type === 'json' ? [ 'json' ] : [ 'module' ]
		} ) ;

		module_.analyse( true ) ;

		if ( this.discovery ) {
			for ( let globalNodeModule of module_.globalNodeModuleList ) {
				this.globalNodeModuleSet.add( globalNodeModule ) ;
				if ( Object.hasOwn( GLOBAL_NODE_CORE_MODULE_DEPENDENCIES , globalNodeModule ) ) {
					module_.staticRequireList.push( GLOBAL_NODE_CORE_MODULE_DEPENDENCIES[ globalNodeModule ] ) ;
				}
			}

			for ( let newRequirePath of module_.staticRequireList ) {
				let requireDetails ;

				try {
					requireDetails = await this.resolveRequirePath( newRequirePath , module_.dir , moduleData.isCore ) ;
					//log.hdebug( "requireDetails for '%s' (dir: %s): %Y" , newRequirePath , module_.dir , requireDetails ) ;
				}
				catch ( error ) {
					throw utils.userError( "Can't find module: '" + newRequirePath + "' required by '" + moduleData.modulePath + "'" , error ) ;
				}

				//log.hdebug( "Static require: %s --> %I" , newRequirePath , requireDetails ) ;
				if ( requireDetails.modulePath && ! this.modulePathSet.has( requireDetails.modulePath ) ) {
					this.moduleDataList.push( requireDetails ) ;
					this.modulePathSet.add( requireDetails.modulePath ) ;
					log.verbose( "Discovered a new source file: %s (from: %s)" , requireDetails.modulePath , module_.id ) ;
				}

				if ( requireDetails.packagePath && ! this.packagePathSet.has( requireDetails.packagePath ) ) {
					this.packageDataList.push( requireDetails ) ;
					this.packagePathSet.add( requireDetails.packagePath ) ;
					log.verbose( "Discovered a new package: %s (from: %s)" , requireDetails.packagePath , module_.id ) ;
				}
			}
		}

		this.moduleList.push( module_ ) ;
	}

	//console.log( 'JsModules:' , this.moduleList ) ;

	return this.moduleList ;
} ;



Brotherhood.prototype.addMainPackage = async function( mainModule ) {
	if ( ! this.mainPackageJson ) {
		if ( ! this.mainPackageJsonPath ) { return ; }

		try {
			let content = await fs.promises.readFile( this.mainPackageJsonPath ) ;
			this.mainPackageJson = JSON.parse( content ) ;
		}
		catch ( error ) {
			throw utils.userError( "Can't open main package.json: " + this.mainPackageJsonPath , error ) ;
		}
	}

	let package_ = new Package( {
		id: '/' ,
		path: this.rootPath ,
		mainModuleId: mainModule.id ,
		mainModulePath: mainModule.path
	} ) ;

	this.packageList.push( package_ ) ;
	log.verbose( "Add package: %Y" , package_ ) ;
} ;



Brotherhood.prototype.getPackages = function() {
	for ( let packageData of this.packageDataList ) {
		let id ;
		let mainModulePath = require.resolve( packageData.packagePath ) ;
		let mainModuleId = mainModulePath ;

		if ( packageData.isCore ) {
			// Relocate core package
			id = path.relative( NODE_CORE_BASE_PATH , packageData.packagePath ) ;

			if ( id === '..' || id.startsWith( '../' ) ) {
				throw utils.userError( "Can't include package '" + packageData.packagePath + "' which is outside of the core modules path '" + NODE_CORE_BASE_PATH + "' (id: '" + id + "')" ) ;
			}

			id = BROWSER_CORE_PREFIX + id ;

			mainModuleId = path.relative( NODE_CORE_BASE_PATH , mainModuleId ) ;

			if ( mainModuleId === '..' || mainModuleId.startsWith( '../' ) ) {
				throw utils.userError( "Can't include main module '" + mainModulePath + "' from package '" + packageData.packagePath + "' which is outside of the core modules path '" + NODE_CORE_BASE_PATH + "' (id: '" + mainModuleId + "')" ) ;
			}

			mainModuleId = BROWSER_CORE_PREFIX + mainModuleId ;
		}
		else {
			// Make the path relative to the root path
			id = path.relative( this.rootPath , packageData.packagePath ) ;

			if ( id === '..' || id.startsWith( '../' ) ) {
				throw utils.userError( "Can't include package '" + packageData.packagePath + "' which is outside of the root path '" + this.rootPath + "' (id: '" + id + "')" ) ;
			}

			id = '/' + id ;

			mainModuleId = path.relative( this.rootPath , mainModuleId ) ;

			if ( mainModuleId === '..' || mainModuleId.startsWith( '../' ) ) {
				throw utils.userError( "Can't include main module '" + mainModulePath + "' from package '" + packageData.packagePath + "' which is outside of the root path '" + this.rootPath + "' (id: '" + mainModuleId + "')" ) ;
			}

			mainModuleId = '/' + mainModuleId ;
		}

		let package_ = new Package( {
			id ,
			path: packageData.packagePath ,
			mainModuleId ,
			mainModulePath
		} ) ;

		this.packageList.push( package_ ) ;
		log.verbose( "Add package: %Y" , package_ ) ;
	}

	return this.packageList ;
} ;



Brotherhood.prototype.resolveRequirePath = async function( requirePath , relativeTo , fromCore = false ) {
	if ( path.isAbsolute( requirePath ) || requirePath.startsWith( '~/' ) ) {
		throw utils.userError( ".resolveRequirePath(): can't add an absolute path to the package: " + requirePath ) ;
	}

	var packagePath , packageJsonPath ,
		isCore = fromCore ,
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
			// It's a node.js core package if there is no node_modules in the resolved path
			let maybeNodeCoreModule = parts[ 0 ] ;
			let nodeCoreModule = null ;

			if ( maybeNodeCoreModule.startsWith( 'core:' ) ) {
				maybeNodeCoreModule = maybeNodeCoreModule.slice( 5 ) ;
				if ( Object.hasOwn( NODE_CORE_MODULES , maybeNodeCoreModule ) ) {
					nodeCoreModule = maybeNodeCoreModule ;
				}
			}
			else if ( Object.hasOwn( NODE_CORE_MODULES , maybeNodeCoreModule ) ) {
				nodeCoreModule = maybeNodeCoreModule ;
			}

			if ( ! nodeCoreModule ) {
				throw utils.userError( "Non-core package not resolving inside the node_modules directory (probably not found): " + requirePath + " --> " + modulePath ) ;
			}

			packagePath = NODE_CORE_MODULES[ nodeCoreModule ] ;

			if ( parts.length === 1 ) {
				modulePath = require.resolve( packagePath , { paths: [ relativeTo ] } ) ;
			}
			else {
				// It's in a core package subpath (not sure it's well supported ATM)
				modulePath = path.join( packagePath , ... parts.slice( 1 ) ) ;
			}

			isCore = true ;
		}
		else {
			if ( parts[ indexOf + 1 ][ 0 ] === '@' ) {
				packagePath = parts.slice( 0 , indexOf + 3 ).join( path.sep ) ;
			}
			else {
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
		modulePath , packagePath , packageJsonPath , isCore
	} ;
} ;



// Make packages and their modules know each others
Brotherhood.prototype.linkModulesToPackages = function() {
	// Sort package from the longest id to the shortest
	var sortedPackages = Array.from( this.packageList ).sort( ( a , b ) => b.id.length - a.id.length ) ;
	//log.hdebug( "sortedPackages: %I" , sortedPackages ) ;

	for ( let module_ of this.moduleList ) {
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

	//log.hdebug( "modules: %[l50000]I" , this.moduleList ) ;
	//log.hdebug( "packages: %I" , this.packageList ) ;
} ;



// Find aliases (when a core node module and its actual browser counterpart have different names)
Brotherhood.prototype.buildCoreAliases = function() {
	var packageAliases = {} ;

	for ( let coreModule of Object.keys( NODE_CORE_MODULES ) ) {
		let browserCoreModule = path.basename( NODE_CORE_MODULES[ coreModule ] ) ;
		if ( coreModule !== browserCoreModule ) {
			packageAliases[ BROWSER_CORE_PREFIX + browserCoreModule ] = BROWSER_CORE_PREFIX + coreModule ;
			//packageAliases[ BROWSER_CORE_PREFIX + coreModule ] = BROWSER_CORE_PREFIX + browserCoreModule ;
		}
	}

	for ( let package_ of this.packageList ) {
		if ( package_.id.startsWith( BROWSER_CORE_PREFIX ) ) {
			if ( Object.hasOwn( packageAliases , package_.id ) ) {
				package_.aliasId = packageAliases[ package_.id ] ;
				log.verbose( "Adding package alias '%s' of '%s'" , package_.aliasId , package_.id ) ;
			}
		}
	}

	for ( let module_ of this.moduleList ) {
		if ( module_.package && module_.package.id.startsWith( BROWSER_CORE_PREFIX ) ) {
			if ( Object.hasOwn( packageAliases , module_.package.id ) && module_.id.startsWith( module_.package.id ) ) {
				module_.aliasId = packageAliases[ module_.package.id ] + module_.id.slice( module_.package.id.length ) ;
				log.verbose( "Adding module alias '%s' of '%s'" , module_.aliasId , module_.id ) ;
			}
		}
	}
} ;



Brotherhood.prototype.fixPath = async function() {

	// First, convert all inputPaths to either moduleDataList or packageDataList

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
			this.moduleDataList.push( { modulePath: inputPath } ) ;
			this.modulePathSet.add( inputPath ) ;
		}
		else if ( await fsKit.isDirectory( inputPath ) ) {
			let packageJsonPath = path.join( inputPath , 'package.json' ) ;

			if ( await fsKit.isFile( packageJsonPath ) ) {
				let mainModulePath = require.resolve( inputPath ) ;
				if ( mainModulePath ) {
					// Same reference
					let data = { modulePath: mainModulePath , packagePath: inputPath , packageJsonPath } ;
					this.packageDataList.push( data ) ;
					this.moduleDataList.push( data ) ;
					this.packagePathSet.add( inputPath ) ;
					this.modulePathSet.add( mainModulePath ) ;
				}
				else {
					//log.error( "Can't find input file: %s" , inputPath ) ;
					throw utils.userError( "Can't resolve main module path for: " + inputPath ) ;
				}
			}
			else {
				//log.error( "Can't find input file: %s" , inputPath ) ;
				throw utils.userError( "Can't find input file: " + inputPath ) ;
			}
		}
	}


	// Then, turn all paths to real path

	for ( let i = 0 ; i < this.moduleDataList.length ; i ++ ) {
		let path_ = await fs.promises.realpath( this.moduleDataList[ i ].modulePath ) ;
		this.moduleDataList[ i ].modulePath = path_ ;
		dirPaths.add( path.dirname( path_ ) ) ;
	}

	for ( let i = 0 ; i < this.packageDataList.length ; i ++ ) {
		let path_ = await fs.promises.realpath( this.packageDataList[ i ].packagePath ) ;
		this.packageDataList[ i ].packagePath = path_ ;
		dirPaths.add( path_ ) ;

		// Also fix packageJsonPath (modulePath is already patched by the module loop, data are referenced)
		this.packageDataList[ i ].packageJsonPath = await fs.promises.realpath( this.packageDataList[ i ].packageJsonPath ) ;
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
		var parts = path_.split( path.sep ) ;
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
		this.rootPath = common.join( path.sep ) ;
	}
	else {
		throw utils.userError( "Can't find a common root path" ) ;
	}
} ;



// Extract metadata from a Brotherhood bundle.
// Should survive minifiers.
Brotherhood.extractMetadataFromBundle = function( content ) {
	var match , start , end , rawMetadata , metadata ;

	// This is the Brotherhood bundle signature!
	match = content.match( /^(\(function\(\)\s?\{\s?)?let BROTHERHOOD_BUNDLE\s?=/ ) ;

	if ( ! match ) {
		throw utils.userError( "This is not a Brotherhood bundle (no signature)..." ) ;
	}

	start = match[ 0 ].length ;
	end = Brotherhood.metadataBoundary( content , start ) ;
	rawMetadata = content.slice( start , end ) ;

	try {
		// Be careful! Minifier remove double-quote around object's keys whenever possible...
		// So we use the LXON parser instead of JSON.parse().
		metadata = parseLXON( rawMetadata ) ;
	}
	catch ( error ) {
		throw utils.userError( "This is not a Brotherhood bundle (can't parse metadata)..." ) ;
	}

	return metadata ;
} ;



Brotherhood.metadataBoundary = function( content , start ) {
	var isInQuote = false ;

	// We just want to find out the boundary: we search for a semi-colon not in double-quotes.
	for ( let end = start ; end < content.length ; end ++ ) {
		let char = content.charCodeAt( end ) ;

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

