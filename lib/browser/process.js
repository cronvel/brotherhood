const process = {
	browser: true ,
	title: 'browser' ,
	env: {} ,
	argv: [] ,
	version: '' ,
	versions: {} ,
	listeners: () => [] ,
	cwd: () => '/' ,
	chdir: () => { throw new Error( 'process.chdir is not supported' ) ; } ,
	umask: () => 0 ,
	binding: () => { throw new Error( 'process.binding is not supported' ) ; } ,
	nextTick: fn => setTimeout( fn , 0 )
} ;
[
	'on' ,
	'once' ,
	'off' ,
	'addListener' ,
	'removeListener' ,
	'removeAllListeners' ,
	'emit' ,
	'prependListener' ,
	'prependOnceListener'
].forEach( p => process[ p ] = () => undefined ) ;
