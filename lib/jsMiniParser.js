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



/*
	A mini-parser, fast, whose purpose is to isolate strings and comment from the rest of the code.
	A part is of type:
		* any: anything that is not a comment or a string
		* format: white-space (space, tabs, new line or carriage return), NEVER created in the middle of an 'any' block
		* string: a string (double-quote, single-quote or backquote)
		* comment: a comment (single-line or block-comment)
*/
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
	while ( runtime.i < str.length ) {
		let c = str.charCodeAt( runtime.i ) ;

		switch ( c ) {
			case 0x2f :	// /   slash: this could be a divide, a single-line comment, a block comment or a regexp
				runtime.i ++ ;
				parseSlash( str , runtime ) ;
				break ;
			case 0x27 :	// '   single-quote: this is a string
				runtime.i ++ ;
				parseSingleQuoteString( str , runtime ) ;
				break ;
			case 0x22 :	// "   double-quote: this is a string
				runtime.i ++ ;
				parseDoubleQuoteString( str , runtime ) ;
				break ;
			case 0x60 :	// `   back-quote: this is a string
				runtime.i ++ ;
				parseBackQuoteString( str , runtime ) ;
				break ;
			default :
				parseAny( str , runtime ) ;
				break ;
		}
	}
}



// Parse any code that is not a string or a comment, and generate an 'any' part.
// If there are only white-spaces (spaces, tabs, newline, carriage return), generate a 'format' instead.
function parseAny( str , runtime ) {
	var c , v ,
		lastPart = runtime.parts[ runtime.parts.length - 1 ] ,
		j = runtime.i ,
		l = str.length ,
		hasWhiteSpace = false ,
		hasNewLine = false ,
		hasNonWhiteSpace = false ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x20 || c === 0x09 ) {	// space and tab
			hasWhiteSpace = true ;
		}
		else if ( c === 0x0a || c === 0x0d ) {	// \n \r
			hasNewLine = true ;
		}
		else if ( c === 0x2f || c === 0x27 || c === 0x22 || c === 0x60 ) {	// / ' " `
			v = str.slice( runtime.i , j ) ;

			if ( v.length ) {
				if ( hasNonWhiteSpace ) {
					if ( lastPart.type === 'any' ) {
						lastPart.outer += v ;
						lastPart.inner = lastPart.outer ;
					}
					else {
						runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
					}
				}
				else {
					runtime.parts.push( {
						type: 'format' , outer: v , inner: v , hasWhiteSpace , hasNewLine
					} ) ;
				}
			}

			runtime.i = j ;
			return ;
		}
		else {
			hasNonWhiteSpace = true ;
		}
	}

	// End of file...

	v = str.slice( runtime.i , j ) ;

	if ( lastPart.type === 'any' ) {
		lastPart.outer += v ;
		lastPart.inner = lastPart.outer ;
	}
	else {
		runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
	}

	runtime.i = j ;
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
		if ( c === 0x0a ) {	// \n
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



function parseDoubleQuoteString( str , runtime ) {
	var c , j = runtime.i , l = str.length ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x22 || c === 0x0a ) {	// double-quote/newline = end of the string
			runtime.parts.push( { type: 'string' , outer: str.slice( runtime.i - 1 , j + 1 ) , inner: str.slice( runtime.i , j ) } ) ;
			runtime.i = j + 1 ;
			return ;
		}
		if ( c === 0x0a ) {	// \n
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
	var v , lastToken , lastTokenChar ,
		lastPart = runtime.parts[ runtime.parts.length - 1 ] ,
		c = str.charCodeAt( runtime.i ) ;

	if ( runtime.i >= str.length ) { throw new SyntaxError( "Unexpected end" ) ; }

	if ( c === 0x2f ) {	// /
		runtime.i ++ ;
		parseLineComment( str , runtime ) ;
		return ;
	}
	else if ( c === 0x2a ) {	// *
		runtime.i ++ ;
		parseBlockComment( str , runtime ) ;
		return ;
	}

	// Check for those nasty regex...
	lastToken = getLastToken( runtime ) ;
	lastTokenChar = lastToken[ lastToken.length - 1 ] ;
	if ( ! lastToken || KEYWORDS_ALLOWING_REGEX.has( lastToken ) || PUNCTUATIONS_END_ALLOWING_REGEX.has( lastTokenChar ) ) {
		parseRegex( str , runtime ) ;
		return ;
	}

	// This was just a divide operator
	v = str.slice( runtime.i - 1 , runtime.i ) ;

	if ( lastPart.type === 'any' ) {
		lastPart.outer += v ;
		lastPart.inner = lastPart.outer ;
	}
	else {
		runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
	}

	parseAny( str , runtime ) ;
	return ;
}



// Parse a line comment.
// The final \n has to be EXCLUDED (if not, stripping comment would ruin it, especially code that omit semi-colons intentionnally).
function parseLineComment( str , runtime ) {
	var c , j = runtime.i , l = str.length ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x0a ) {	// newline = end of the comment
			runtime.parts.push( { type: 'comment' , outer: str.slice( runtime.i - 2 , j ) , inner: str.slice( runtime.i , j ) } ) ;
			runtime.i = j ;
			return ;
		}
		else if ( c === 0x0d ) {	// carriage-return = end of the comment
			runtime.parts.push( { type: 'comment' , outer: str.slice( runtime.i - 2 , j ) , inner: str.slice( runtime.i , j ) } ) ;
			runtime.i = j ;
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



function parseRegex( str , runtime ) {
	var c , j = runtime.i , l = str.length ;

	for ( ; j < l ; j ++ ) {
		c = str.charCodeAt( j ) ;

		if ( c === 0x2f ) {	// slash = end of the regex, but there could be flags
			let k = j + 1 ;
			for ( ; k < l ; k ++ ) {
				c = str.charCodeAt( k ) ;
				if ( c < 0x61 || c > 0x7a ) { break ; }
			}
			runtime.parts.push( { type: 'regex' , outer: str.slice( runtime.i - 1 , k ) , inner: str.slice( runtime.i , j ) , flags: str.slice( j + 1 , k ) } ) ;
			runtime.i = k ;
			return ;
		}
		if ( c === 0x0a ) {	// \n should not be allowed.. Fallback to 'any' type?
			console.error( "Expecting a RegExp end, but got a new line, fallback to 'any' type" ) ;
			let v = str.slice( runtime.i - 1 , j + 1 ) ;
			runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
			runtime.i = j + 1 ;
			return ;
		}
		if ( c === 0x0d ) {	// carriage-return should not be allowed.. Fallback to 'any' type?
			console.error( "Expecting a RegExp end, but got a carriage-return, fallback to 'any' type" ) ;
			if ( str.charCodeAt( j + 1 ) === 0x0a ) {	// CR + LF
				let v = str.slice( runtime.i - 1 , j + 2 ) ;
				runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
				runtime.i = j + 2 ;
			}
			else {
				let v = str.slice( runtime.i - 1 , j + 1 ) ;
				runtime.parts.push( { type: 'any' , outer: v , inner: v } ) ;
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



// Many of those require an open-parenthesis, or are invalid, but we want to exclude divisions after those anyway...
const KEYWORDS_ALLOWING_REGEX = new Set( [
	'return' ,
	'throw' , 'catch' ,
	'if' , 'else' ,
	'do' , 'while' , 'for' , 'of' , 'in' ,
	'switch' , 'case' ,
	'new' , 'delete' ,
	'typeof' , 'instanceof' ,
	'void' , 'with'
] ) ;
const PUNCTUATIONS_END_ALLOWING_REGEX = new Set( [ ... '&|=!?:,;([{<>' ] ) ;
//const PUNCTUATIONS_END_ALLOWING_DIVISION = new Set( [ ... ')]}+-' ] ) ;

const WHITE_SPACES = new Set( [ ... " \t\n\r" ] ) ;
const PUNCTUATIONS = new Set( [ ... "&~#{}()[]<>-|\\/'\"`^+=%,.;:!?" ] ) ;	// non-identifier characters

function getLastToken( runtime ) {
	var p = runtime.parts.length ;

	while ( p -- ) {
		let part = runtime.parts[ p ] ;
		if ( part.type === 'string' ) { return part.outer[ 0 ] ; }
		if ( part.type === 'any' ) {
			let j = part.outer.length ;
			while ( j -- ) {
				let c = part.outer[ j ] ;

				if ( PUNCTUATIONS.has( c ) ) {
					let k = j ;
					while ( k -- ) {
						c = part.outer[ k ] ;
						if ( ! PUNCTUATIONS.has( c ) ) {
							return part.outer.slice( k + 1 , j + 1 ) ;
						}
					}
					
					return part.outer.slice( 0 , j + 1 ) ;
				}

				if ( ! WHITE_SPACES.has( c ) ) {
					// Non-punctuation and non-whitespace, this is an identifier-like or a number
					let k = j ;
					while ( k -- ) {
						c = part.outer[ k ] ;
						if ( PUNCTUATIONS.has( c ) || WHITE_SPACES.has( c ) ) {
							return part.outer.slice( k + 1 , j + 1 ) ;
						}
					}
					
					return part.outer.slice( 0 , j + 1 ) ;
				}
			}
		}
	}

	return null ;
}

