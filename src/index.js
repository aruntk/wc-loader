/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Arun Kumar T K @aruntk
  */
import fs from 'fs'
import url from 'url'
import path from 'path'
import vm from 'vm'
import parse5 from 'parse5'
import loaderUtils from 'loader-utils'
import polyclean from 'polyclean'
import * as _ from 'lodash'
import assign from 'object-assign'
import wcRenderer from './renderer'

function randomIdent() {
  return 'xxxWCLINKxxx' + Math.random() + Math.random() + 'xxx'
}

class DissectHtml {
  constructor(config, options) {
    this.dissected = {
      html: '/*__wc__loader*/\n',
      js: '',
      requires: '', // appended first
    }
    this.config = config
    this.links = {}
    this.otherDeps = []
    this.options = options
  }
  dissect(contents, sourcePath) {
    this.path = sourcePath
    const children = contents.childNodes || []
    this.processChildNodes(children)
    // this.dissected.js += `\n${this.dissected.js}\n`
  }
  processChildNodes(childNodes) {
    const self = this
    let pushNodes = []
    const processedNodes = _.compact(_.map(childNodes, child => {
      switch (child.nodeName) {
        case 'head':
        case 'body': {
          const _child = child
          _child.childNodes = self.processChildNodes(_child.childNodes)
          const _childContents = parse5.serialize(_child)
          this.dissected[_child.nodeName] = _childContents
          const where = _child.nodeName === 'head'
          self.dissected.html += `\n${wcRenderer.generateJS(_childContents, where)}\n`
        }
          break

        case 'template': {
          const template = child
          const tmContent = template.content
          const isWalkable = tmContent && tmContent.nodeName === '#document-fragment' && tmContent.childNodes
          if (isWalkable) {
            tmContent.childNodes = self.processChildNodes(tmContent.childNodes)
          }
          template.content = tmContent
          return template
        }
        case 'link': {
          const processedLinkChild = self.processLinks(child)
          if (processedLinkChild) {
            return processedLinkChild
          }
        }
          break
        case 'script': {
          const result = self.processScripts(child)
          if (result) {
            return result
          }
        }
          break
        case 'style': {
          if (child.childNodes && child.childNodes.length) {
            const childNode = child.childNodes[0]
            const css = childNode.value
            const result = self.processStyle(css)
            if (result) {
              childNode.value = result
            }
          }
          return child
        }
        case 'dom-module': {
          const domModule = child
          if (domModule.childNodes) {
            domModule.childNodes = self.processChildNodes(domModule.childNodes)
          }
          return domModule
        }
        case 'div': {
          const divChild = child
          const attrs = _.filter(divChild.attrs, o => (o.name === 'hidden' || o.name === 'by-vulcanize'))
          if (attrs.length >= 2) {
            const _childNodes = self.processChildNodes(divChild.childNodes)
            pushNodes = pushNodes.concat(_childNodes)
          } else {
            if (divChild.childNodes) {
              divChild.childNodes = self.processChildNodes(divChild.childNodes)
            }
            return divChild
          }
        }
          break
        case '#comment':
        case '#documentType':
          break
        default: {
          const defChild = child
          const attrs = _.map(defChild.attrs, o => {
            // all src values without [[*]] and {{*}}
            if (o.name === 'src' || o.name === 'src$') {
              o.value = self._changeRelUrl(o.value)
            }
            return o
          })
          defChild.attrs = attrs
          if (defChild.childNodes) {
            defChild.childNodes = self.processChildNodes(defChild.childNodes)
          }
          return defChild
        }
      }
      return null
    }))
    return processedNodes.concat(pushNodes)
  }
  processStyle(css, cssBasePath = '') {
    return this._changeCssUrls(polyclean.stripCss(css), cssBasePath)
  }
  _changeCssUrls(text, cssBasePath) {
    const self = this
    // to get -> property: url(filepath)

    const processed = text.replace(/url\(['|']?([^)]+?)['|']?\)/ig, function (_u, url) {
      // to get -> filepath from url(filepath), url('filepath') and url('filepath')
      return `url(${self._changeRelUrl(url, path.dirname(cssBasePath))})`
    })
    return processed
  }

  processScripts(child) {
    const self = this
    const importSource = _.find(child.attrs, v => (v.name === 'src'))
    if (importSource && importSource.value) {
      const importableUrl = self.importableUrl(importSource.value)
      if (!importableUrl) {
        return child
      }
      self.dissected.requires += `\nrequire('${importableUrl}');\n`
    } else {
      self.dissected.js += `\n${parse5.serialize(child)}\n`
    }
    return null
  }
  _changeRelUrl(inpUrl, basePath) {
    // avoids var(--url-variable) and bound properties [[prop]] and {{prop}}
    if (inpUrl && !inpUrl.match(/var\(.*?\)|({{|\[\[)\s*[\w\.]+\s*(}}|\]\])/ig)) {

      const p = basePath ? path.join('', basePath, inpUrl) : inpUrl
      // avoids absolute & remote urls
      const link = this.importableUrl(p)
      if (link) {
        do {
          var ident = randomIdent()
        } while (this.links[ident])
        this.links[ident] = link
        return ident
      }
    }
    return inpUrl
  }
  importableUrl(link) {
    const root = this.config.root
    if (!loaderUtils.isUrlRequest(link, root)) {
      return
    }
    const uri = url.parse(link)
    if (uri.hash !== null && uri.hash !== undefined) {
      uri.hash = null
      link = uri.format()
    }

    return loaderUtils.urlToRequest(link, root)
  }
  processLinks(child) {
    const self = this
    // <link rel='import'...> and <link rel='stylesheet'...>
    const supportedRels = ['import', 'stylesheet']
    const ifImport = _.find(child.attrs, v => (v.name === 'rel' && supportedRels.indexOf(v.value) > -1))
    if (ifImport) {
      const hrefAttr = _.find(child.attrs, v => v.name === 'href')
      if (hrefAttr && hrefAttr.value) {
        const link = self.importableUrl(hrefAttr.value) || hrefAttr.value
        switch (ifImport.value) {
          case 'import': {
            // file is imported using require
            if (!link) {
              return child
            }
            const typeAttr = _.find(child.attrs, v => (v.name === 'type'))
            if (typeAttr) {
              switch (typeAttr.value) {
                case 'css':
                  return self.processCssImport(link, child)
                default:
                  break
              }
            }
            const importable = `require('${link}');`
            self.dissected.requires += `\n${importable}\n`
          }
            break
            // Processing <link rel='stylesheet' href='filename.css'>
          case 'stylesheet':
            // absolute file path
            return self.processCssImport(link, child)
          default:
            break
        }
      } else {
        return child
      }
    } else {
      return child
    }
    return null
  }
  processCssImport(link, child) {
    const absPath = path.resolve(path.dirname(this.path), link)
    this.otherDeps.push(absPath)
    // checks if file exists
    if (fs.existsSync(absPath)) {
      const contents = fs.readFileSync(absPath, 'utf8')
      // css is inlined
      const minified = this.processStyle(contents, link)
      if (minified) {
        // link tag is replaced with style tag
        return _.extend(child, {
          nodeName: 'style',
          tagName: 'style',
          attrs: [],
          childNodes: [
            {
              nodeName: '#text',
              value: minified
            }
          ]
        })
      }
    }
    return child
  }
}
function getLoaderConfig(context) {
  const query = loaderUtils.parseQuery(context.query)
  const configKey = query.config || 'wcLoader'
  const config = context.options && context.options.hasOwnProperty(configKey) ? context.options[configKey] : {}

  delete query.config

  return assign(query, config)
}
function convertPlaceholder(html, links, config) {
  const callback = this.async()
  const publicPath = typeof config.publicPath !== 'undefined' ? config.publicPath : this.options.output.publicPath
  const phs = Object.keys(links) // placeholders
  Promise.all(phs.map(function loadModule(ph) {
    const resourcePath = links[ph]
    const absPath = path.resolve(path.dirname(this.resourcePath), resourcePath)
    this.addDependency(absPath)
    return new Promise((resolve, reject) => {
      this.loadModule(resourcePath, (err, src) => err ? reject(err) : resolve(src))
    })
  }, this))
    .then(sources => sources.map(
      // runModule may throw an error, so it's important that our promise is rejected in this case
      (src, i) => runModule(src, links[phs[i]], publicPath)
    ))
    .then(results => {
      return html.replace(/xxxWCLINKxxx[0-9\.]+xxx/g, function (match) {
        const i = phs.indexOf(match)
        if (i === -1) {
          return match
        }
        return results[i]
      })
    })
    .then(content => callback(null, content))
    .catch(callback)
}

function runModule(src, filename, publicPath = '') {
  const script = new vm.Script(src, {
    filename,
    displayErrors: true
  })
  const sandbox = {
    module: {},
    __webpack_public_path__: publicPath // eslint-disable-line camelcase
  }

  script.runInNewContext(sandbox)
  return sandbox.module.exports.toString()
}
module.exports = function (source) {
  if (this.cacheable) {
    this.cacheable()
  }
  const config = getLoaderConfig(this)
  const srcFilepath = this.resourcePath
  const parsed = parse5.parse(source)
  const dissectFn = new DissectHtml(config, this.options)
  dissectFn.dissect(parsed, srcFilepath)
  const links = dissectFn.links
  const inject = dissectFn.dissected.html + dissectFn.dissected.requires + dissectFn.dissected.js
  // otherDeps -> css dependencies for hot code reload.
  dissectFn.otherDeps.forEach(dep => {
    this.addDependency(dep)
  }, this)
  convertPlaceholder.call(this, inject, links, config)
}
