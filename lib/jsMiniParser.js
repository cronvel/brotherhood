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



function parse( str ) {
	var runtime = {
		i: 0 ,
		parts: []
	} ;

	if ( typeof str !== 'string' ) {
		throw new TypeError( "Argument is not a string" ) ;
	}

	parseIdle( str , runtime ) ;
	
	/*
	if ( str === runtime.parts.map( p => p.outer ).join( '' ) ) {
        console.log( "Ok: the parsed data matches the original" ) ;
    }
    else {
        console.log( "BAD: the parsed data MISmatches the original" ) ;
    }
    //*/

	return runtime.parts ;
}

module.exports = parse ;



function parseIdle( str , runtime ) {
	var c ;

	parseFormat( str , runtime ) ;

	while ( runtime.i < str.length ) {
		c = str.charCodeAt( runtime.i ) ;

		switch ( c ) {
			case 0x2f :	// /   slash: this could be a divide, a single-line comment, a block comment or a regexp
				runtime.i ++ ;
				parseSlash( str , runtime ) ;
				break ;
			case 0x27 :	// '   single-quote: this is a string
				runtime.i ++ ;
				parseSingleQuoteString( str , runtime ) ;
				parseFormat( str , runtime ) ;
				break ;
			case 0x22 :	// "   double-quote: this is a string
				runtime.i ++ ;
				parseDoubleQuoteString( str , runtime ) ;
				parseFormat( str , runtime ) ;
				break ;
			case 0x60 :	// `   back-quote: this is a string
				runtime.i ++ ;
				parseBackQuoteString( str , runtime ) ;
				parseFormat( str , runtime ) ;
				break ;
			default :
				parseAny( str , runtime ) ;
				parseFormat( str , runtime ) ;
				break ;
		}
	}
}



function parseAny( str , runtime ) {
	var c , j = runtime.i , l = str.length , v ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x2f || c === 0x27 || c === 0x22 || c === 0x60 ) {
			v = str.slice( runtime.i , j ) ;
			runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
			runtime.i = j ;
			return ;
		}
	}

	v = str.slice( runtime.i , j ) ;
	runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
	runtime.i = j ;
}



function parseDoubleQuoteString( str , runtime ) {
	var c , j = runtime.i , l = str.length ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x22 || c === 0x0a ) {	// double-quote/newline = end of the string
			runtime.parts.push( { type: 'string' , outer: str.slice( runtime.i - 1 , j + 1 ) , inner: str.slice( runtime.i , j ) } ) ;
			runtime.i = j + 1 ;
			return ;
		}
		if ( c === 0x0d ) {	// carriage-return = end of the string
			if ( str.charCodeAt( j + 1 ) === 0x0a ) {	// CR + LF
				runtime.parts.push( { type: 'string' , outer: str.slice( runtime.i - 1 , j + 2 ) , inner: str.slice( runtime.i , j ) } ) ;
				runtime.i = j + 2 ;
			}
			else {
				runtime.parts.push( { type: 'string' , outer: str.slice( runtime.i - 1 , j + 1 ) , inner: str.slice( runtime.i , j ) } ) ;
				runtime.i = j + 1 ;
			}
			return ;
		}
		else if ( c === 0x5c ) {	// backslash
			j ++ ;
		}
	}

	console.error( "Runtime:" , runtime , j ) ;
	throw new SyntaxError( "Unexpected end, expecting a double-quote." ) ;
}



function parseSingleQuoteString( str , runtime ) {
	var c , j = runtime.i , l = str.length ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x27 || c === 0x0a ) {	// single-quote/newline = end of the string
			runtime.parts.push( { type: 'string' , outer: str.slice( runtime.i - 1 , j + 1 ) , inner: str.slice( runtime.i , j ) } ) ;
			runtime.i = j + 1 ;
			return ;
		}
		if ( c === 0x0d ) {	// carriage-return = end of the string
			if ( str.charCodeAt( j + 1 ) === 0x0a ) {	// CR + LF
				runtime.parts.push( { type: 'string' , outer: str.slice( runtime.i - 1 , j + 2 ) , inner: str.slice( runtime.i , j ) } ) ;
				runtime.i = j + 2 ;
			}
			else {
				runtime.parts.push( { type: 'string' , outer: str.slice( runtime.i - 1 , j + 1 ) , inner: str.slice( runtime.i , j ) } ) ;
				runtime.i = j + 1 ;
			}
			return ;
		}
		else if ( c === 0x5c ) {	// backslash
			j ++ ;
		}
	}

	throw new SyntaxError( "Unexpected end, expecting a single-quote." ) ;
}



function parseBackQuoteString( str , runtime ) {
	var c , j = runtime.i , l = str.length ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x60 ) {	// back-quote = end of the string
			runtime.parts.push( { type: 'string' , outer: str.slice( runtime.i - 1 , j + 1 ) , inner: str.slice( runtime.i , j ) } ) ;
			runtime.i = j + 1 ;
			return ;
		}
		else if ( c === 0x5c ) {	// backslash
			j ++ ;
		}
	}

	throw new SyntaxError( "Unexpected end, expecting a back-quote." ) ;
}



function parseSlash( str , runtime ) {
	var c = str.charCodeAt( runtime.i ) ;

	if ( runtime.i >= str.length ) { throw new SyntaxError( "Unexpected end" ) ; }

	if ( c === 0x2f ) {	// /
		runtime.i ++ ;
		parseLineComment( str , runtime ) ;
		parseFormat( str , runtime ) ;
		return ;
	}
	else if ( c === 0x2a ) {	// *
		runtime.i ++ ;
		parseBlockComment( str , runtime ) ;
		parseFormat( str , runtime ) ;
		return ;
	}

	// /!\ Should check for Regexp

	// this was just a divide
	var v = str.slice( runtime.i - 1 , runtime.i ) ;
	runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
	//runtime.i ++ ;
	parseFormat( str , runtime ) ;
	return ;
}



function parseLineComment( str , runtime ) {
	var c , j = runtime.i , l = str.length ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x0a ) {	// newline = end of the comment
			runtime.parts.push( { type: 'comment' , outer: str.slice( runtime.i - 2 , j + 1 ) , inner: str.slice( runtime.i , j ) } ) ;
			runtime.i = j + 1 ;
			return ;
		}
		else if ( c === 0x0d ) {	// carriage-return = end of the comment
			if ( str.charCodeAt( j + 1 ) === 0x0a ) {	// CR + LF
				runtime.parts.push( { type: 'comment' , outer: str.slice( runtime.i - 2 , j + 2 ) , inner: str.slice( runtime.i , j ) } ) ;
				runtime.i = j + 2 ;
			}
			else {
				runtime.parts.push( { type: 'comment' , outer: str.slice( runtime.i - 2 , j + 1 ) , inner: str.slice( runtime.i , j ) } ) ;
				runtime.i = j + 1 ;
			}
			return ;
		}
	}

	runtime.parts.push( { type: 'comment' , outer: str.slice( runtime.i - 2 ) , inner: str.slice( runtime.i ) } ) ;
}



function parseBlockComment( str , runtime ) {
	var c , j = runtime.i , l = str.length ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x2a && str.charCodeAt( j + 1 ) === 0x2f ) {	// * followed by a / = end of block comment
			runtime.parts.push( { type: 'comment' , outer: str.slice( runtime.i - 2 , j + 2 ) , inner: str.slice( runtime.i , j ) } ) ;
			runtime.i = j + 2 ;
			return ;
		}
	}

	throw new SyntaxError( "Unexpected end, expecting a block comment end." ) ;
}



// Parse format chars like spaces, tabs, newline, etc...
function parseFormat( str , runtime ) {
	var c , v ,
		j = runtime.i ,
		l = str.length ,
		hasWhiteSpace = false ,
		hasNewLine = false ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x20 || c === 0x09 ) {
			hasWhiteSpace = true ;
		}
		else if ( c === 0x0a || c === 0x0d ) {
			hasNewLine = true ;
		}
		else {
			v = str.slice( runtime.i , j ) ;
			if ( v.length ) {
				runtime.parts.push( { type: 'format' , outer: v , inner: v , hasWhiteSpace , hasNewLine } ) ;
			}
			runtime.i = j ;
			return ;
		}
	}

	v = str.slice( runtime.i ) ;
	runtime.parts.push( { type: 'format' , outer: v , inner: v , hasWhiteSpace , hasNewLine } ) ;
}

