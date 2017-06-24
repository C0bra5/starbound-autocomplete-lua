'use babel'

import config from '../config'

function getOptions (luaVersion) {
    return require('../stdlib/starbound5.3.json')
}

const optionsCache = {}
function getCachedOptions (luaVersion, reviveOptions) {
  const cachedValue = optionsCache[luaVersion]
  if (cachedValue) { return cachedValue }
  const options = reviveOptions(getOptions(luaVersion))
  if (!options) { return }
  optionsCache[luaVersion] = options
  return options
}

export default class StdLibProvider {
  priority = 100;

  getOptions = async function (request, getPreviousOptions, utils, cache) {
    const previousOptions = await getPreviousOptions()
    const stdOptions = getCachedOptions('5.3', utils.reviveOptions)
    if (!stdOptions) { return { options: previousOptions } }
    return utils.mergeOptionsCached(previousOptions, stdOptions, cache)
  }
}
