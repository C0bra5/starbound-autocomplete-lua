'use babel'

/*
 * The type analysis sweep
 */

import {
	tableNew, unknownNew,
	tableSet, tableGet, tableSetMetatable, tableGetMetatable,
	tableSearch,
	tableInvalidateDiffs, tableFreeze, tableDiffShallow, tableDiff, tableApplyDiff, typeDefDeepClone
} from './typedefs'
import { nodeGetType, nodeGetReturnTypes } from './resolve'
import extractTypes from './extraction'
import formatResults from './format'
import luaparse from './luaparse'
import ModuleCache from './module-cache'
import config from './config'

export default class Analysis {
	constructor (options, query) {
		this.query = query
		this.queryBase = null
		this.queryType = null
		this.chunk = null
		if (query && query.dot !== ':' && query.dot !== '.') {
			query.dot = null
		}

		let globalScope = typeDefDeepClone(options.global)
	
		tableInvalidateDiffs()
		if (tableGet(globalScope, '_G') !== globalScope) {
			tableSet(globalScope, '_G', globalScope)
		}
		//tableFreeze(globalScope)

		this.currentScope = globalScope
		this.globalScope = globalScope
		this.options = options
		options.moduleCache = options.moduleCache || new ModuleCache(options)

		this.iteration = []
		this.requires = new Set()
		this.requireCache = {}



		const luaVersion = '5.3'
		luaparse.parse({
			wait: true,
			comments: false,
			ranges: true,
			scope: true,
			luaVersion: '5.3',
			onCreateNode: this._onCreateNode,
			onCreateScope: this._onCreateScope,
			onDestroyScope: this._onDestroyScope,
			onScopeIdentifierName: this._onScopeIdentifierName
		})
	}

	_onCreateNode = (node) => {
		this.iteration.push(node)
		node.scope = this.currentScope
		node.globalScope = this.globalScope
		node.options = this.options

		if (node.type === 'Chunk') {
			this.chunk = node
		}

		if (
			(node.type === 'CallExpression' || node.type === 'StringCallExpression') &&
			node.base.type === 'Identifier' &&
			node.base.name === 'require'
		) {
			const argument = node.argument || (node.arguments && node.arguments[0])
			if (argument && argument.type === 'StringLiteral') {
				this.requires.add(argument.value)
				node.requireValue = argument.value
				node.requireCache = this.requireCache
			}
		}

		if (
			this.query &&
			node.type === 'MemberExpression' &&
			node.identifier.name.indexOf('__prefix_placeholder__') !== -1
		) {
			if (this.query.dot) {
				this.queryBase = node.base
			} else {
				this.queryType = node.scope
			}
			node.isPlaceholder = true
			node.identifier.isPlaceholder = true
			if (
				node.base &&
				node.base.type === 'Identifier' &&
				node.base.name.indexOf('__prefix_placeholder__') !== -1
			) {
				node.base.isPlaceholder = true
			}
		}

		__LOG__ && console.log('onCreateNode', node)
	};

	_onCreateScope = () => {
		__LOG__ && console.log('onCreateScope')
		const oldScope = this.currentScope
		const metatable = tableNew()
		tableSet(metatable, '__index', oldScope)
		this.currentScope = tableNew()
		tableSetMetatable(this.currentScope, metatable)
	};

	_onDestroyScope = () => {
		__LOG__ && console.log('onDestroyScope')
		const parentScope = tableGet(tableGetMetatable(this.currentScope), '__index')
		this.currentScope = parentScope
	};

	_onScopeIdentifierName = (newName, data) => {
		__LOG__ && console.log('onScopeIdentifierName', newName, data)
		//if check if __prefix_placeholder__ is present, if yes don't go further
		if (newName.indexOf('__prefix_placeholder__') !== -1) { return }

		if (data && data.parameterOf) {
			const func = nodeGetType(data.parameterOf)
			if (func && func.type === 'function' && func.argTypes) {
				const argType = func.argTypes[data.parameterIndex]
				if (argType) {
					tableSet(this.currentScope, newName, argType)
					return
				}
			}
			else if (config.suggestUsedMembers && newName === "self") {
				if (this.globalScope.fields[data.parameterOf.base.name] == null) {
					tableSet(this.globalScope, data.parameterOf.base.name, tableNew())
				}
				tableSet(this.currentScope, newName, this.globalScope.fields[data.parameterOf.base.name])
			}
		}
		else {
			tableSet(this.currentScope, newName, unknownNew())
		}
		
	};

	write (string) {
		luaparse.write(string)
	}

	end (string) {
		luaparse.end(string)
	}

	_evaluate = async (syncAction) => {
		if (this.requires.size) {
			const mainDiff = tableDiffShallow(this.globalScope)
			await Promise.all([...this.requires].map(async moduleName => {
				const module = await this.options.moduleCache.get(moduleName, this._analyseModule)
				this.requireCache[moduleName] = module
			}))
			tableInvalidateDiffs()
			tableApplyDiff(mainDiff)
		}
		if (config.suggestUsedMembers) {
			this.iteration.forEach(extractTypes)
		}

		// Due to the stateful nature of tableDiffCount, we need to sample data
		// quickly before we return to the run loop and let another Analysis take
		// place, so .then()-ing promises is out of the question
		return syncAction()
	}

	_analyseModule = async (moduleData) => {
		const analysis = new Analysis(this.options)
		try {
			analysis.end(moduleData)
		} catch (ex) {
			__LOG__ && console.error(ex)
		}
		return await analysis.returnModule()
	};

	returnModule = async () => {
		return await this._evaluate(() => {
			const returnTypes = this.chunk ? nodeGetReturnTypes(this.chunk.body) : []
			const globalDiff = tableDiff(this.globalScope)
			return { returnTypes, globalDiff }
		})
	}

	solveQuery = async () => {
		return await this._evaluate(() => {
			let queryType = this.queryType;
			if (this.queryBase) {
				if (config.preventDefinitionOverrides) {
					if (this.queryBase.globalScope.fields[this.queryBase.name]) {
						for (let i in this.queryBase.globalScope.fields[this.queryBase.name].fields) {
							this.queryBase.scope.fields[this.queryBase.name].fields[i] = this.queryBase.globalScope.fields[this.queryBase.name].fields[i];
						}
					}
				}
				for (let i in this.queryBase.scope.fields) {
					
					if (this.options.namedTypes[this.queryBase.scope.fields[i].type]) {
						this.queryBase.scope.fields[i] = this.options.namedTypes[this.queryBase.scope.fields[i].type];
					}
				}
				queryType = nodeGetType(this.queryBase)
			}
			

			if (!queryType) { return [] }
			let prefix = this.query.prefix;
			let results = tableSearch(queryType, this.query.prefix)
			const trimSelf = this.query.dot === ':'
			if (trimSelf) {
				results = results.filter(x => x.typeDef && x.typeDef.type === 'function')
			}
			results.sort((a, b) => a.key.localeCompare(b.key))
			return formatResults(results, trimSelf, prefix)
		})
	}
}
