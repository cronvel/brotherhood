
function Package( id , mainModuleId ) {
	this.id = id ;
	this.mainModuleId = mainModuleId ;
	this.name = null ;
	this.version = null ;

	this.modules = [] ;
	this.mainModule = null ;
}

Package.packages = Object.create( null ) ;

Package.prepare = ( id , mainModuleId , aliasId ) => {
	var package_ = new Package( id , mainModuleId ) ;
	Package.packages[ id ] = package_ ;
	if ( aliasId ) { Package.packages[ aliasId ] = package_ ; }
	for ( let metadata of BROTHERHOOD_BUNDLE.packages ) {
		if ( metadata.id === id ) {
			package_.name = metadata.name ;
			package_.version = metadata.version ;
			break ;
		}
	}
} ;

Package.get = ( id ) => {
	if ( Package.packages[ id ] ) { return Package.packages[ id ] ; }
	throw new Error( "Package '" + id + "' not found." ) ;
} ;

Package.prototype.addModule = function( module ) {
	this.modules.push( module ) ;
	if ( module.id === this.mainModuleId ) {
		this.mainModule = module ;
	}
} ;

function Module( id , package_ , fn ) {
	this.id = id ;
	this.package = package_ || null ;
	this.directory = Module.dirname( this.id ) ;
	this.fn = fn ;
	this.loading = false ;
	this.loaded = false ;
	this.exports = {} ;

	if ( this.package ) { this.package.addModule( this ) ; }
}

Module.modules = Object.create( null ) ;
Module.main = null ;

Module.prepare = ( id , packageId , aliasId , fn ) => {
	var package_ = packageId ? Package.get( packageId ) : null ;

	var module = new Module( id , package_ , fn ) ;
	Module.modules[ id ] = module ;
	if ( aliasId ) { Module.modules[ aliasId ] = module ; }
	if ( ! Module.main ) { Module.main = module ; }

	module.require = id_ => Module.require( id_ , module.directory ) ;
	module.require.resolve = id_ => Module.require.resolve( id_ , module.directory ) ;
	module.require.cache = Module.modules ;
	module.require.main = Module.main ;
} ;

Module.get = ( id ) => {
	if ( Module.modules[ id ] ) { return Module.modules[ id ] ; }
	throw new Error( "Module '" + id + "' not found." ) ;
} ;

Module.prototype.load = function() {
	if ( this.loading || this.loaded ) { return ; }
	this.loading = true ;
	this.fn( this , this.exports , this.require , this.directory , this.id ) ;
	this.loading = false ;
	this.loaded = true ;
} ;

Module.dirname = path => path === '/' ? null : path.replace( /\/[^/]+\/*$/ , '' ) || '/' ;
Module.extname = path => path.match( /[^./](\.[a-zA-Z0-9]+)$/ )?.[ 1 ] ?? '' ;
Module.packageName = path => path.match( /^(?:[^@./][^@/]*|@[^@./][^@/]*\/[^@./][^@/]*)/ )?.[ 0 ] ?? null ;

Module.join = ( ... parts ) => {
	var str = '' ;

	for ( let part of parts ) {
		if ( ! str ) {
			if ( part !== '/' && part[ part.length - 1 ] === '/' ) { part = part.slice( 0 , -1 ) ; }

			str += part ;
		}
		else {
			if ( str[ str.length - 1 ] !== '/' ) { str += '/' ; }

			if ( part[ 0 ] === '/' ) { part = part.slice( 1 ) ; }
			else if ( part === '.' ) { part = '' ; }
			else if ( part.startsWith( './' ) ) { part = part.slice( 2 ) ; }

			if ( part[ part.length - 1 ] === '/' ) { part = part.slice( 0 , -1 ) ; }

			str += part ;
		}
	}

	return str ;
} ;

Module.acceptedExtensions = new Set( [ '.js' , '.json' ] ) ;

Module.collapseDots = path => {
	var parts = path.split( '/' ).filter( ( part , index ) => ! index || part !== '.' ) ;

	for ( let i = 0 ; i < parts.length ; i ++ ) {
		if ( parts[ i ] === '..' ) {
			if ( i && parts[ i - 1 ] !== '..' ) {
				if ( parts[ i - 1 ] === '.' ) {
					parts.splice( i - 1 , 1 ) ;
					i -- ;
				}
				else {
					parts.splice( i - 1 , 2 ) ;
					i -= 2 ;
				}
			}
		}
	}

	return parts.join( '/' ) ;
} ;

Module.require = ( path , base = '/' ) => {
	var id = Module.require.resolveCache[ base ]?.[ path ] ;

	//if ( id ) { console.warn( "requiring (cached):" , path , base , "-->" , id ) ; }
	if ( ! id ) {
		id = Module.require.resolve( path , base ) ;
		if ( ! Module.require.resolveCache[ base ] ) { Module.require.resolveCache[ base ] = Object.create( null ) ; }
		Module.require.resolveCache[ base ][ path ] = id ;
		//console.warn( "requiring:" , path , base , "-->" , id ) ;
	}

	var module_ = Module.get( id ) ;
	if ( ! module_.loading && ! module_.loaded ) { module_.load() ; }
	return module_.exports ;
} ;

Module.require.resolveCache = Object.create( null ) ;

Module.require.resolve = ( initialPath , initialBase = '/' ) => {
	var path = initialPath ,
		base = initialBase ;

	//console.warn( "resolve #0:" , path , base ) ;
	path = Module.collapseDots( path ) ;

	var packageName = Module.packageName( path ) ;
	//console.warn( "resolve #1:" , path , base , packageName ) ;

	if ( packageName ) {
		let found ;

		if ( packageName.startsWith( 'core:' ) ) {
			packageName = packageName.slice( 5 ) ;
			found = Module.recursivePackageSearch( packageName , path , '/[core]' , '/[core]' ) ;
		}
		else {
			found = Module.recursivePackageSearch( packageName , path , base ) ;
			if ( ! found && ! base.startsWith( '/[core]/' ) ) {
				found = Module.recursivePackageSearch( packageName , path , '/[core]' , '/[core]' ) ;
			}
		}

		if ( ! found ) {
			let error = new Error( "Cannot find module '" + initialPath + "' (no more parent directory for node_modules)" ) ;
			error.code = 'MODULE_NOT_FOUND' ;
			throw error ;
		}

		[ path , base ] = found ;
	}

	if ( path === '..' || path.startsWith( '../' ) ) {
		do {
			path = path.slice( 3 ) ;
			base = Module.dirname( base ) ;
			//console.warn( "resolve #3:" , path , base ) ;
			if ( ! base ) {
				let error = new Error( "Cannot find module '" + initialPath + "' (no more parent directory for ../)" ) ;
				error.code = 'MODULE_NOT_FOUND' ;
				throw error ;
			}
		} while ( path === '..' || path.startsWith( '../' ) ) ;

		path = Module.join( base , path ) ;
	}

	if ( path.startsWith( './' ) ) {
		//console.warn( "resolve #4:" , path , base ) ;
		path = Module.join( base , path ) ;
	}

	if ( path.startsWith( '/' ) ) {
		//console.warn( "resolve #5:" , path , base ) ;

		let extension = Module.extname( path ) ;
		if ( ! extension ) {
			let package_ = Package.packages[ path ] ;
			if ( package_ ) {
				path = package_.mainModuleId ;
			}
			else {
				path += '.js' ;
			}
		}

		let module_ = Module.modules[ path ] ;
		if ( ! module_ ) {
			let error = new Error( "Cannot find module '" + initialPath + "'" ) ;
			error.code = 'MODULE_NOT_FOUND' ;
			throw error ;
		}

		return path ;
	}

	//console.warn( "resolve #6:" , path , base ) ;

	let error = new Error( "Cannot find module '" + initialPath + "' (can't resolve)" ) ;
	error.code = 'MODULE_NOT_FOUND' ;
	throw error ;
} ;

Module.recursivePackageSearch = ( packageName , path , base , prefix = null ) => {
	let subPath = path.slice( packageName.length ) ;

	for ( ;; ) {
		let packageId = Module.join( base , 'node_modules' , packageName ) ;
		//console.warn( "resolve #2a:" , path , base , packageId ) ;
		let package_ = Package.packages[ packageId ] ;

		if ( package_ ) {
			if ( subPath ) {
				path = Module.join( package_.id , subPath ) ;
			}
			else {
				path = package_.mainModuleId ;
			}
			//console.warn( "resolve #2b:" , path , base ) ;

			return [ path , base ] ;
		}

		base = Module.dirname( base ) ;
		if ( ! base || base === prefix ) { return null ; }
	}
} ;

