class _synthesizer {
  constructor(settings) {
    this.settings = settings;
  }
  generateJS(html, toHead) {
    const htmlStr = JSON.stringify(html);
    const where = toHead ? 'head' : 'body';
    return `
    (function(document) {
      var _htmlStr = ${htmlStr};
      if (document.${where}) {
        var el = document.${where};
        var div = document.createElement('div');
        div.innerHTML = _htmlStr;
        while (div.children.length > 0) {
          el.appendChild(div.children[0]);
        }
      } else {
        document.write(_htmlStr);
      }
    })(document);
    `;
  }

}
module.exports = new _synthesizer();
