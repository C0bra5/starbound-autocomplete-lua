'use babel'

/*
 * Code to format the type definitions into ready-for-display suggestions
 */

import config from './config'

function getDefault () {
	for (let i = 0, n = arguments.length; i < n; i++) {
		const arg = arguments[i]
		if (arg !== null && arg !== undefined) { return arg }
	}
}

const emptyVariant = {}
const emptyArray = []
function formatVariant (key, typeDef, variant, trimSelf, replacementPrefix) {
	const descriptionMarkdown = variant.description || typeDef.description
	const description = variant.descriptionPlain || typeDef.descriptionPlain
	const type = typeDef.actualType || typeDef.type
	const link = variant.link || typeDef.link
	const args = variant.args || typeDef.args || emptyArray
	const argsDisplay = trimSelf ?
		getDefault(variant.argsDisplayOmitSelf, variant.argsDisplay, typeDef.argsDisplayOmitSelf, typeDef.argsDisplay)
		:
		getDefault(variant.argsDisplay, typeDef.argsDisplay)
	const isFunction = type === 'function'
	const returnTypes = variant.returnTypes || typeDef.returnTypes;
	//hi i am new2
	const suggestion = {
		type: isFunction ? 'function' : 'value',
		rightLabel: type === 'unknown' ? '' : type,
		description,
		descriptionMarkdown,
		descriptionMoreURL: link,
		replacementPrefix: replacementPrefix
	}

	let argList = args
	if (isFunction) {
		argList = (trimSelf ? args.slice(1) : args)
		let optional = 0;
		let optionalUp = () => {optional++;return '';};
		let writeBrackets = x =>  (x > 1 ? ']' + writeBrackets( x - 1 ) : (x <= 0 ? '' :']'));
		const signature = argsDisplay || argList.map((a,i,arr) =>
			(a.optional ? '[' : "") +
			( i == 0 ? '' : ', ') +
			(a.type ? a.type + ': ' : '?: ') +
			a.name +
			(a.optional ? optionalUp() : '') +
			( i == arr.length - 1 ? writeBrackets(optional) : '')
		).join('');
		suggestion.displayText = key + '(' + signature + ')';
		if (returnTypes) {
			let retTypes = "";
			returnTypes.forEach((type,index) => {
				if(type){
					retTypes += type.actualType + (index == returnTypes.length - 1 ? '' : ', ');

				}else{
					retTypes += 'unknown' + (index == returnTypes.length - 1 ? '' : ', ');
				}
			});
			suggestion.leftLabel = retTypes;
		}
	}

	if (config.useSnippets && isFunction) {
		let signature = '$1';
		try {
			signature = argList.map((a,i) => a );
			signature = signature.filter(i => !i.optional);
			signature.forEach((a, i,arr) => signature[i] = `\${${i + 1}:${a.name}}`);
			if(signature.join)
				signature = signature.join(', ');
		} catch (e) {
			signature = '$1';
		}
		signature = signature || '$1';
		suggestion.snippet = `${key}(${signature})\$${(argList.length || 1) + 1}`;
	} else {
		suggestion.text = key
	}

	return suggestion
}

export default function formatResults (results, trimSelf, replacementPrefix) {
	const suggestions = []
	results.forEach(({ key, typeDef }) => {
		if (typeDef.type === 'function') {
			if (typeDef.variants) {
				typeDef.variants.forEach(variant =>
					suggestions.push(formatVariant(key, typeDef, variant, trimSelf, replacementPrefix))
				)
			} else {
				suggestions.push(formatVariant(key, typeDef, emptyVariant, trimSelf, replacementPrefix))
			}
		} else {
			if (typeDef.variants) {
				typeDef.variants.forEach(variant =>
					suggestions.push(formatVariant(key, typeDef, variant, trimSelf, replacementPrefix))
				)
			} else {
				suggestions.push(formatVariant(key, typeDef, emptyVariant, trimSelf, replacementPrefix))
			}
		}
	})
	return suggestions
}
