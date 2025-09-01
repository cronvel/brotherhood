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
const jsMiniParser = require( './jsMiniParser.js' ) ;

const path = require( 'path' ) ;
const fsPromise = require( 'fs' ).promises ;

const string = require( 'string-kit' ) ;

const Logfella = require( 'logfella' ) ;
const log = Logfella.global.use( 'brotherhood' ) ;



/*
	This describes one JS module.
*/

function JsModule( params = {} ) {
	this.id = params.id ;	// The module ID in the target (browser) system
	this.aliasId = params.aliasId || null ;     // The package ID alias, when a core node module and its actual browser counterpart have different names
	this.path = params.path ?? null ;	// The path in the original (node) system
	this.dir = this.path ? path.dirname( this.path ) : null ;
	this.type = params.type || 'cjs' ;	// Only 'cjs' and 'json' are supported for instance
	this.body = params.body ;	// The original JS content body
	this.wrappers = params.wrappers || [] ;
	this.wrapperContents = [] ;

	this.package = null ;

	this.patched = false ;
	this.parsed = null ;
	this.strictMode = false ;
	this.staticRequireList = [] ;
	this.nodeGlobalModuleList = [] ;
}

module.exports = JsModule ;



JsModule.prototype.analyse = function( patch = false ) {
	if ( this.type === 'json' ) {
		try {
			JSON.parse( this.body ) ;
		}
		catch ( error ) {
			throw utils.userError( "Parse error, parsing source: " + this.path , error ) ;
		}
		return ;
	}

	try {
		this.parsed = jsMiniParser( this.body ) ;
	}
	catch ( error ) {
		log.error( "Parse error, parsing source: " + this.path , error ) ;
		return ;
	}

	//console.log( "BF Parsed:" , this.parsed ) ;

	this.checkStrictMode( patch ) ;
	//console.log( "Strict mode:" , this.strictMode ) ;

	this.detectStaticRequires( patch ) ;
	//console.log( "Static requires:" , this.staticRequireList ) ;

	this.detectNodeGlobalModules( patch ) ;
	//console.log( "Node global modules:" , this.nodeGlobalModuleList ) ;

	//console.log( "AFT Parsed:" , this.parsed ) ;
	if ( this.patched ) {
		this.body = this.parsed.map( p => p.outer ).join( '' ) ;
	}

	if ( patch ) {
		this.body = this.body.trim() ;
	}
} ;



JsModule.prototype.checkStrictMode = function( strip = false ) {
	this.strictMode = false ;

	for ( let index = 0 ; index < this.parsed.length ; index ++ ) {
		let part = this.parsed[ index ] ;

		switch ( part.type ) {
			case 'string' :
				if ( part.outer === '"use strict"' ||  part.outer === "'use strict'" ) {
					this.strictMode = true ;
					if ( strip ) {
						// Skip white-spaces
						let j ;
						for ( j = index + 1 ; j < this.parsed.length && this.parsed[ j ].type === 'format' && ! this.parsed[ j ].hasNewLine ; j ++ ) ;

						let nextPart = this.parsed[ j ] ;
						let count = j - index ;

						if ( nextPart && nextPart.type === 'any' ) {
							nextPart.outer = nextPart.inner = nextPart.outer.replace( /^ *; */ , '' ) ;
							if ( ! nextPart.outer ) { count ++ ; }
						}

						this.parsed.splice( index , count ) ;
						this.patched = true ;
					}
				}
				return ;
			case 'any' :
				return ;
		}
	}
} ;



JsModule.prototype.detectStaticRequires = function() {
	this.staticRequireList.length = 0 ;

	for ( let index = 0 ; index < this.parsed.length ; index ++ ) {
		if ( this.parsed[ index ]?.type !== 'any' || ! this.parsed[ index ].outer.match( /(^|[^\p{L}_$])require *\( *$/u ) ) {
			continue ;
		}

		// Skip white-spaces
		let j ;
		for ( j = index + 1 ; j < this.parsed.length && this.parsed[ j ].type === 'format' ; j ++ ) ;

		if ( this.parsed[ j ]?.type !== 'string' ) { continue ; }

		// Skip white-spaces
		let k ;
		for ( k = j + 1 ; k < this.parsed.length && this.parsed[ k ].type === 'format' ; k ++ ) ;

		if ( this.parsed[ k ]?.type !== 'any' || !  this.parsed[ k ].outer.match( /^ *\)/ ) ) {
			continue ;
		}

		this.staticRequireList.push( this.parsed[ j ].inner ) ;
		index = k - 1 ;
	}
} ;



const NODE_GLOBAL_MODULES = [
	//'console' ,
	'process' ,
	'Buffer'
] ;

JsModule.prototype.detectNodeGlobalModules = function() {
	this.nodeGlobalModuleList.length = 0 ;

	for ( let nodeGlobalModule of NODE_GLOBAL_MODULES ) {
		let regex = new RegExp( "(^|[^\\p{L}_$.])" + nodeGlobalModule + "($|[^\\p{L}_$])" , 'u' ) ;

		for ( let index = 0 ; index < this.parsed.length ; index ++ ) {
			if ( this.parsed[ index ]?.type === 'any' && this.parsed[ index ].outer.match( regex ) ) {
				this.nodeGlobalModuleList.push( nodeGlobalModule ) ;
				break ;
			}
		}
	}
} ;



JsModule.prototype.pack = async function() {
	var str = this.body ;

	for ( let wrapperId of this.wrappers ) {
		str = await JsModule.applyWrapperId( wrapperId , {
			id: this.id ,
			aliasId: this.aliasId ,
			packageId: this.package?.id ?? null ,
			body: str ,
			useStrict: this.strictMode
		} ) ;
	}

	return str ;
} ;



JsModule.wrappers = {} ;

JsModule.getWrapper = async function( id ) {
	if ( JsModule.wrappers[ id ] ) { return JsModule.wrappers[ id ] ; }

	let wrapper = await fsPromise.readFile( path.join( __dirname , 'wrappers/' , id + '.js' ) , 'utf8' ) ;
	JsModule.wrappers[ id ] = wrapper ;
	return wrapper ;
} ;



JsModule.applyWrapper = function( wrapper , data ) {
	return wrapper.replace( /\/\*=\[([a-zA-Z-]+)]=\*\//g , ( match , name ) => {
		//console.log( "match:" , match ) ;
		var value = data[ name ] ;

		switch ( name ) {
			case 'id' :
			case 'aliasId' :
			case 'exposeName' :
			case 'packageId' :
			case 'packageAliasId' :
			case 'packageMainModuleId' :
			case 'packageName' :
			case 'packageVersion' :
				return value ? "'" + string.escape.jsSingleQuote( value ) + "'" : 'null' ;
			case 'useStrict' :
				return value ? '"use strict" ;' : '' ;
			case 'body' :
				return value ? value.trim() : '' ;
			default :
				return '' ;
		}
	} ) ;
} ;



JsModule.applyWrapperId = async function( id , data ) {
	return JsModule.applyWrapper( await JsModule.getWrapper( id ) , data ) ;
} ;

