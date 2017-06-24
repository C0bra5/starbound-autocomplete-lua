'use babel'

/*
 * Autocomplete+ provider
 */

import Analysis from './analysis'
import getOptions from './options'
import config, { configObserve, configDispose } from './config'
import path from 'path'
import {
	tableNew, unknownNew,
	tableSet, tableGet, tableSetMetatable, tableGetMetatable,
	tableSearch,
	tableInvalidateDiffs, tableFreeze, tableDiffShallow, tableDiff, tableApplyDiff
} from './typedefs'

function getFilePath (request) {
	let p
	const buffer = request.editor.getBuffer()
	p = buffer.getPath()
	if (p) { return p }
	const madeUpName = buffer.madeUpName = buffer.madeUpName || `untitled-${Math.round(10000 * Math.random())}.lua`
	p = window.atom.project.rootDirectories[0]
	if (p) { return path.join(p.getPath(), madeUpName) }
	return path.join(process.cwd(), madeUpName)
}

export default class LuaProvider {
	selector = '.source.lua';
	disableForSelector = '.source.lua .comment';
	inclusionPriority = 1;
	excludeLowerPriority = false;
	disposeables = [];

	constructor () {
		__LOG__ && console.log('new LuaProvider()')
		this.disposeables.push(window.atom.config.observe('starbound-autocomplete-lua.excludeLowerPriority', (value) => {
			this.excludeLowerPriority = value
		}))
		this.disposeables.push(window.atom.config.observe('starbound-lua.inclusionPriority', (value) => {
			this.inclusionPriority = value
		}))
		configObserve()
	}

	dispose () {
		this.disposeables.forEach(d => d.dispose())
		this.disposeables.length = 0
		configDispose()
	}

	getSuggestions = async function (request) {
		//get current atom text editor text buffer
		const buffer = request.editor.getBuffer();
		//get current buffer
		let prefix = request.prefix;
		//get current cursor index
		const cursorIndex = buffer.characterIndexForPosition(request.bufferPosition);
		//get number of characters to start of prefix
		let charsToPrefix = cursorIndex - prefix.length;



		//trim the front
		prefix = prefix.replace(/\s*$/, '');
		//get prefix length
		const prefLen = prefix.length;
		//if it's empty return we don't handle that
		if (prefix.length === 0) { return []; }
		//trim the back
		prefix = prefix.replace(/^\s*/, '')
		//set new starting point
		charsToPrefix += prefLen - prefix.length



		//empty prefix if the prefix is a self accesor
		if (prefix === '.' || prefix === ':') {
			prefix = ''
			charsToPrefix++
		}



		__LOG__ && console.log('suggestions', request, prefix)



		//if there was a dot before the prefix find what it was.
		const textInIndexRange = (a, b) => buffer.getTextInRange([
			buffer.positionForCharacterIndex(a),
			buffer.positionForCharacterIndex(b)
		])
		//get position of begenning of prefix, used to get the text
		const dotEndPos = buffer.positionForCharacterIndex(charsToPrefix)
		//get text in cursor line up to prefix
		const dotLine = buffer.getTextInRange([[dotEndPos.row, 0], dotEndPos])
		//get last . or : at the end, if there was one
		const dot = dotLine.match(/([^\s])?\s*$/)[1]
		//dot can be whitespace, ":", "." or undefined

		//if the doty type is not . or : and the length off the prefix is under the length in the config, don't make suggestion
		if (dot !== '.' && dot !== ':' && prefix.length < Math.max(1, config.minCharsPrefix)) {
			return []
		}


		request.filePath = getFilePath(request)
		const options = await getOptions(request)
		options.cwd = options.cwd || path.dirname(request.filePath)

		const analysis = new Analysis(options, { prefix, charsToPrefix, dot: dot })

		try {
			analysis.write(textInIndexRange(0, charsToPrefix))

			if (dot === '.' || dot === ':') {
				analysis.write('__prefix_placeholder__()')
			} else {
				analysis.write('__prefix_placeholder__.__prefix_placeholder__()')
			}


			let continuePos = cursorIndex
			if (request.activatedManually) {
				let nextChar = textInIndexRange(cursorIndex, cursorIndex + 1)
				if (nextChar.replace(/\s/g, '').length !== 0) { // ...and the next char is non-whitespace
					continuePos = charsToPrefix // parse the prefix as well
				}
			}

			analysis.end(textInIndexRange(continuePos, Infinity))
		} catch (ex) {
			if (__LOG__) { console.error(ex) }
		}

				//console.log(analysis);
				//1 < 2;

		let ret = await analysis.solveQuery()


		return ret;
	}
};
