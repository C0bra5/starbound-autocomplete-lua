'use babel'

/*
 * Extracted-out config keys
 */

const config = {}
const disposeables = []

const keys = ['suggestUsedMembers', 'useSnippets', 'luaVersion', 'minCharsPrefix', 'preventDefinitionOverrides']

export function configObserve () {
	keys.forEach(key => {
		disposeables.push(window.atom.config.observe('starbound-autocomplete-lua.' + key, (value) => {
			if (key == 'luaVersion') {
				config[key] = '5.3'
			} else {
				config[key] = value
			}
		}))
	})
}

export function configDispose () {
	disposeables.forEach(d => d.dispose())
	disposeables.length = 0
}

export default config
