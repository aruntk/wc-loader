import { minify } from 'html-minifier'
import * as _ from 'lodash'

class _renderer {
  constructor(settings) {
    this.settings = settings
  }
  generateJS(html, toHead, config) {
    let _html = html
    if (config.minify) {
      const defaultMinifierOptions = {
        collapseWhitespace: true,
        customAttrAssign: [/\$=/],
        ignoreCustomFragments: [/style\$?="\[\[.*?\]\]"/],
      }
      const minifierOptions = _.extend(defaultMinifierOptions, config.minifierOptions || {})
      _html = minify(_html, minifierOptions)
    }
    if(_html && !_html.match('^[\\n\\r\s]+$')) {
      const htmlStr = JSON.stringify(_html)
      const where = toHead ? 'head' : 'body'
      return `!function(a){var b=${htmlStr};if(a.${where}){var c=a.${where},d=a.createElement("div");for(d.innerHTML=b;d.children.length>0;)c.appendChild(d.children[0])}else a.write(b)}(document);`
    } else {
      return ''
    }
  }
}
module.exports = new _renderer()
