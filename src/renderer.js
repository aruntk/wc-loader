class _renderer {
  constructor(settings) {
    this.settings = settings
  }
  generateJS(html, toHead) {
    const htmlStr = JSON.stringify(html)
    const where = toHead ? 'head' : 'body'
    return `!function(a){var b=${htmlStr};if(a.${where}){var c=a.${where},d=a.createElement("div");for(d.innerHTML=b;d.children.length>0;)c.appendChild(d.children[0])}else a.write(b)}(document);`
  }

}
module.exports = new _renderer()
