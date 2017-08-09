'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _htmlMinifier = require('html-minifier');

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _renderer = function () {
  function _renderer(settings) {
    _classCallCheck(this, _renderer);

    this.settings = settings;
  }

  _createClass(_renderer, [{
    key: 'generateJS',
    value: function generateJS(html, toHead, config) {
      var _html = html;
      if (config.minify) {
        var defaultMinifierOptions = {
          collapseWhitespace: true,
          customAttrAssign: [/\$=/],
          ignoreCustomFragments: [/style\$?="\[\[.*?\]\]"/]
        };
        var minifierOptions = _.extend(defaultMinifierOptions, config.minifierOptions || {});
        _html = (0, _htmlMinifier.minify)(_html, minifierOptions);
      }
      if (_html && !_html.match('^[\\n\\r\\s]+$')) {
        var htmlStr = JSON.stringify(_html);
        var where = toHead ? 'head' : 'body';
        return '!function(a){var b=' + htmlStr + ';if(a.' + where + '){var c=a.' + where + ',d=a.createElement("div");for(d.innerHTML=b;d.children.length>0;)c.appendChild(d.children[0])}else a.write(b)}(document);';
      } else {
        return '';
      }
    }
  }]);

  return _renderer;
}();

module.exports = new _renderer();