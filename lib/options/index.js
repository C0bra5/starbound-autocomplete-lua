'use babel'

import includes from 'lodash.includes'
import {
	tableNew, booleanNew, functionNew, numberNew, unknownNew, nilNew,
	tableSet, tableSetMetatable, tableGet, tableGetMetatable, tableRevertAndUnfreeze,
	mergeTypeKnowledge, typeDefDeepClone
} from '../typedefs'

function crawlAndRevive (typeDef, namedTypes, setter) {
	if (!typeDef) { return }
	typeDef.fromOptions = true
	switch (typeDef.type) {
		case 'table':
			crawlAndRevive(typeDef.metatable, namedTypes, v => { typeDef.metatable = v })
			for (let key in typeDef.fields) {
				crawlAndRevive(typeDef.fields[key], namedTypes, (v,n) => { typeDef.fields[key] = v; typeDef.fields[key]["actualType"] = n; })
			}
			break
		case 'function':
			if (typeDef.argTypes) {
				typeDef.argTypes.forEach((argType, index) => {
					typeDef.argTypes[index] = {type: argType};
				})
			}
			if (typeDef.returnTypes) {
				typeDef.returnTypes.forEach((retType, index) => {
					if (namedTypes[retType]) {
						typeDef.returnTypes[index] = namedTypes[retType];
						typeDef.returnTypes[index]["actualType"] = retType;
					} else {
						typeDef.returnTypes[index] = {};
						typeDef.returnTypes[index]["actualType"] = retType;
					}
				})
			}
			if (typeDef.variants){
				typeDef.variants.forEach((variant, index) =>{
					if(variant.returnTypes){
						variant.returnTypes.forEach((retType, index) => {
							if (namedTypes[retType]) {
								variant.returnTypes[index] = namedTypes[retType];
								variant.returnTypes[index]["actualType"] = retType;
							} else {
								variant.returnTypes[index] = {};
								variant.returnTypes[index]["actualType"] = retType;
							}
						})
					}
				});
			}
			break
		case 'ref':
			setter(namedTypes[typeDef.name],typeDef.name )
			break
		default:
			if (namedTypes[typeDef.type]){
				setter(namedTypes[typeDef.type], typeDef.type )
			}
			break
	}
}

function reviveOptions (options) {
	if (!options || !options.namedTypes) { return options }
	let namedTypes = options.namedTypes
	crawlAndRevive(options.global, namedTypes, v => { options.global = v })
	for (let key in namedTypes) {
		crawlAndRevive(namedTypes[key], namedTypes, v => { namedTypes[key] = v })
	}
	//delete options.namedTypes
	return options
}

function mergeOptions (previousOptions, newOptions) {
	const newGlobal = newOptions.global
	const previousGlobal = previousOptions.global
	const mergedOptions = Object.assign({}, previousOptions, newOptions)
	tableRevertAndUnfreeze(newGlobal)
	const mergedGlobal = mergeTypeKnowledge(
		typeDefDeepClone(newGlobal),
		typeDefDeepClone(previousGlobal)
	)
	if (mergedGlobal) { mergedOptions.global = mergedGlobal }
	return mergedOptions
}

function mergeOptionsCached (previousOptions, newOptions, cache, merger) {
	if (cache.newOptions === newOptions && cache.previousOptions === previousOptions) {
		return cache
	}
	const options = utils.mergeOptions(previousOptions, newOptions)
	if (merger) { merger(options, previousOptions, newOptions) }
	return { options, newOptions, previousOptions }
}

const utils = { reviveOptions, mergeOptions, mergeOptionsCached, tableNew, booleanNew, functionNew, numberNew, unknownNew, nilNew, tableSet, tableSetMetatable, tableGet, tableGetMetatable, mergeTypeKnowledge }

let providers = []

export function addOptionProviders (v) {
	v.forEach(provider => {
		providers.push({
			provider,
			cache: {}
		})
	})
}

export function removeOptionProviders (v) {
	providers = providers.filter(p => !includes(v, p.provider))
	v.forEach(provider => provider.dispose && provider.dispose())
}

export default function getOptions (request) {
	providers.sort((a, b) => b.provider.priority - a.provider.priority)
	const chainProviders = (index) => {
		const providerSpec = providers[index]
		if (!providerSpec) { return () => ({}) }
		return async function () {
			const nextGetOptions = chainProviders(index + 1)
			const cacheKey = request.filePath
			const cacheEntry = providerSpec.cache[cacheKey] || {}
			const newCacheEntry = (await providerSpec.provider.getOptions(request, nextGetOptions, utils, cacheEntry))
			providerSpec.cache[cacheKey] = newCacheEntry
			return newCacheEntry.options
		}
	}
	return Promise.resolve(chainProviders(0)())
}
