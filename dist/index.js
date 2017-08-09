'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); /*
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       MIT License http://www.opensource.org/licenses/mit-license.php
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       Author Arun Kumar T K @aruntk
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       */


var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _vm = require('vm');

var _vm2 = _interopRequireDefault(_vm);

var _parse = require('parse5');

var _parse2 = _interopRequireDefault(_parse);

var _loaderUtils = require('loader-utils');

var _loaderUtils2 = _interopRequireDefault(_loaderUtils);

var _schemaUtils = require('schema-utils');

var _schemaUtils2 = _interopRequireDefault(_schemaUtils);

var _polyclean = require('polyclean');

var _polyclean2 = _interopRequireDefault(_polyclean);

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

var _renderer = require('./renderer');

var _renderer2 = _interopRequireDefault(_renderer);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var schema = require('./options');

function randomIdent() {
  return 'xxxWCLINKxxx' + Math.random() + Math.random() + 'xxx';
}

var DissectHtml = function () {
  function DissectHtml(config, options) {
    _classCallCheck(this, DissectHtml);

    this.dissected = {
      html: '/*__wc__loader*/',
      js: '',
      requires: '' // appended first
    };
    this.config = config;
    this.links = {};
    this.otherDeps = [];
    this.options = options;
  }

  _createClass(DissectHtml, [{
    key: 'dissect',
    value: function dissect(contents, sourcePath) {
      this.path = sourcePath;
      var children = contents.childNodes || [];
      this.processChildNodes(children);
      // this.dissected.js += `\n${this.dissected.js}\n`
    }
  }, {
    key: 'processChildNodes',
    value: function processChildNodes(childNodes) {
      var _this = this;

      var self = this;
      var pushNodes = [];
      var processedNodes = _.compact(_.map(childNodes, function (child) {
        switch (child.nodeName) {
          case 'head':
          case 'body':
            {
              var _child = child;
              _child.childNodes = self.processChildNodes(_child.childNodes);
              var _childContents = _parse2.default.serialize(_child);
              _this.dissected[_child.nodeName] = _childContents;
              // boolean where determines the section of html the content goes in
              var where = _child.nodeName === 'head';
              self.dissected.html += '' + _renderer2.default.generateJS(_childContents, where, self.config);
            }
            break;

          case 'template':
            {
              var template = child;
              // template does not have a direct childNodes property.
              // instead it has a content peoperty which contains a document fragment node.
              // the document fragment node has childNodes prop
              var tmContent = template.content;
              var isWalkable = tmContent && tmContent.nodeName === '#document-fragment' && tmContent.childNodes;
              if (isWalkable) {
                tmContent.childNodes = self.processChildNodes(tmContent.childNodes);
              }
              template.content = tmContent;
              return template;
            }
          case 'link':
            {
              var processedLinkChild = self.processLinks(child);
              if (processedLinkChild) {
                return processedLinkChild;
              }
            }
            break;
          case 'script':
            {
              var result = self.processScripts(child);
              if (result) {
                return result;
              }
            }
            break;
          case 'style':
            {
              if (child.childNodes && child.childNodes.length) {
                var childNode = child.childNodes[0];
                var css = childNode.value;
                var _result = self.processStyle(css);
                if (_result) {
                  childNode.value = _result;
                }
              }
              return child;
            }
          case 'dom-module':
            {
              var domModule = child;
              if (domModule.childNodes) {
                domModule.childNodes = self.processChildNodes(domModule.childNodes);
              }
              return domModule;
            }
          case 'div':
            {
              // this is required to avoid div added by vulcanization
              var divChild = child;
              var attrs = _.filter(divChild.attrs, function (o) {
                return o.name === 'hidden' || o.name === 'by-vulcanize';
              });
              if (attrs.length >= 2) {
                var _childNodes = self.processChildNodes(divChild.childNodes);
                pushNodes = pushNodes.concat(_childNodes);
              } else {
                if (divChild.childNodes) {
                  divChild.childNodes = self.processChildNodes(divChild.childNodes);
                }
                return divChild;
              }
            }
            break;
          // remove comment and documentType nodes
          case '#comment':
          case '#documentType':
            break;
          // every other node
          default:
            {
              var defChild = child;
              var _attrs = _.map(defChild.attrs, function (o) {
                // all src values without [[*]] and {{*}}
                if (o.name === 'src' || o.name === 'src$') {
                  o.value = self._changeRelUrl(o.value);
                }
                return o;
              });
              defChild.attrs = _attrs;
              if (defChild.childNodes) {
                defChild.childNodes = self.processChildNodes(defChild.childNodes);
              }
              return defChild;
            }
        }
        return null;
      }));
      return processedNodes.concat(pushNodes);
    }
  }, {
    key: 'processStyle',
    value: function processStyle(css) {
      var cssBasePath = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

      return this._changeCssUrls(_polyclean2.default.stripCss(css), cssBasePath);
    }
  }, {
    key: '_changeCssUrls',
    value: function _changeCssUrls(text, cssBasePath) {
      var self = this;
      // to get -> property: url(filepath)

      var processed = text.replace(/url\(["']?((?!.*:\/\/|"|'|\)).+?)["']?\)/ig, function (_u, url) {
        // to get -> filepath from url(filepath), url('filepath') and url('filepath')
        return 'url(' + self._changeRelUrl(url, _path2.default.dirname(cssBasePath)) + ')';
      });
      return processed;
    }
  }, {
    key: 'processScripts',
    value: function processScripts(child) {
      var self = this;
      var importSource = _.find(child.attrs, function (v) {
        return v.name === 'src';
      });
      if (importSource && importSource.value) {
        // script tag contains a source file url
        var importableUrl = self.importableUrl(importSource.value);
        if (!importableUrl) {
          // link is absolute or remote. so do nothing
          return child;
        }
        self.dissected.requires += '\nrequire(\'' + importableUrl + '\');\n';
      } else {
        // script inside the tag is added to main js part
        self.dissected.js += '\n' + _parse2.default.serialize(child) + '\n';
      }
      return null;
    }
  }, {
    key: '_changeRelUrl',
    value: function _changeRelUrl() {
      var inpUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      var basePath = arguments[1];

      // avoids var(--url-variable) and bound properties [[prop]] and {{prop}} and data urls
      var linkIsNotVar = !inpUrl.match(/^data:|var\(.*?\)|({{|\[\[)\s*[\w\.]+\s*(}}|\]\])/ig);
      if (inpUrl && linkIsNotVar) {
        var linkIsRelative = !_path2.default.isAbsolute(inpUrl);
        var p = basePath && linkIsRelative ? _path2.default.join('', basePath, inpUrl) : inpUrl;
        // avoids absolute & remote urls
        var link = this.importableUrl(p);
        if (link) {
          do {
            var ident = randomIdent();
          } while (this.links[ident]);
          this.links[ident] = link;
          return ident;
        }
      }
      return inpUrl;
    }
    // changes relative urls to request format and returns if link is absolute.

  }, {
    key: 'importableUrl',
    value: function importableUrl(link) {
      var root = this.config.root;
      if (!_loaderUtils2.default.isUrlRequest(link, root)) {
        return;
      }
      var uri = _url2.default.parse(link);
      if (uri.hash !== null && uri.hash !== undefined) {
        uri.hash = null;
        link = uri.format();
      }
      return _loaderUtils2.default.urlToRequest(link, root);
    }
  }, {
    key: 'processLinks',
    value: function processLinks(child) {
      var self = this;
      // <link rel='import'...> and <link rel='stylesheet'...>
      var supportedRels = ['import', 'stylesheet'];
      var ifImport = _.find(child.attrs, function (v) {
        return v.name === 'rel' && supportedRels.indexOf(v.value) > -1;
      });
      if (ifImport) {
        var hrefAttr = _.find(child.attrs, function (v) {
          return v.name === 'href';
        });
        if (hrefAttr && hrefAttr.value) {
          var link = self.importableUrl(hrefAttr.value);
          if (!link) {
            return child;
          }
          switch (ifImport.value) {
            case 'import':
              {
                // file is imported using require
                var typeAttr = _.find(child.attrs, function (v) {
                  return v.name === 'type';
                });
                if (typeAttr) {
                  // process type="css" files
                  switch (typeAttr.value) {
                    case 'css':
                      return self.processCssImport(link, child);
                    default:
                      break;
                  }
                }
                var importable = 'require(\'' + link + '\');';
                self.dissected.requires += '\n' + importable + '\n';
              }
              break;
            // Processing <link rel='stylesheet' href='filename.css'>
            case 'stylesheet':
              // absolute file path
              return self.processCssImport(link, child);
            default:
              break;
          }
        } else {
          return child;
        }
      } else {
        return child;
      }
      return null;
    }
  }, {
    key: 'processCssImport',
    value: function processCssImport(link, child) {
      var absPath = _path2.default.resolve(_path2.default.dirname(this.path), link);
      this.otherDeps.push(absPath);
      // checks if file exists
      if (_fs2.default.existsSync(absPath)) {
        var contents = _fs2.default.readFileSync(absPath, 'utf8');
        // css is inlined
        var minified = this.processStyle(contents, link);
        if (minified) {
          // link tag is replaced with style tag
          return _.extend(child, {
            nodeName: 'style',
            tagName: 'style',
            attrs: [],
            childNodes: [{
              nodeName: '#text',
              value: minified,
              parentNode: child
            }]
          });
        }
      }
      return child;
    }
  }]);

  return DissectHtml;
}();

function getLoaderConfig(context) {
  var options = _loaderUtils2.default.getOptions(context) || {};
  (0, _schemaUtils2.default)(schema, options, 'HTML Loader');
  return options;
}
function convertPlaceholder(html, links, config) {
  var callback = this.async();
  var publicPath = typeof config.publicPath !== 'undefined' ? config.publicPath : this.options.output.publicPath;
  var phs = Object.keys(links); // placeholders
  Promise.all(phs.map(function loadModule(ph) {
    var _this2 = this;

    var resourcePath = links[ph];
    var absPath = _path2.default.resolve(_path2.default.dirname(this.resourcePath), resourcePath);
    this.addDependency(absPath);
    return new Promise(function (resolve, reject) {
      _this2.loadModule(resourcePath, function (err, src) {
        return err ? reject(err) : resolve(src);
      });
    });
  }, this)).then(function (sources) {
    return sources.map(
    // runModule may throw an error, so it's important that our promise is rejected in this case
    function (src, i) {
      return runModule(src, links[phs[i]], publicPath);
    });
  }).then(function (results) {
    return html.replace(/xxxWCLINKxxx[0-9\.]+xxx/g, function (match) {
      var i = phs.indexOf(match);
      if (i === -1) {
        return match;
      }
      return results[i];
    });
  }).then(function (content) {
    return callback(null, content);
  }).catch(callback);
}

function runModule(src, filename) {
  var publicPath = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';

  var script = new _vm2.default.Script(src, {
    filename: filename,
    displayErrors: true
  });
  var sandbox = {
    module: {},
    __webpack_public_path__: publicPath // eslint-disable-line camelcase
  };

  script.runInNewContext(sandbox);
  return sandbox.module.exports.toString();
}
module.exports = function (source) {
  var _this3 = this;

  if (this.cacheable) {
    this.cacheable();
  }
  var config = getLoaderConfig(this);
  var srcFilepath = this.resourcePath;
  var parsed = _parse2.default.parse(source);
  var dissectFn = new DissectHtml(config, this.options);
  dissectFn.dissect(parsed, srcFilepath);
  var links = dissectFn.links;
  var inject = dissectFn.dissected.html + dissectFn.dissected.requires + dissectFn.dissected.js;
  // otherDeps -> css dependencies for hot code reload.
  dissectFn.otherDeps.forEach(function (dep) {
    _this3.addDependency(dep);
  }, this);
  convertPlaceholder.call(this, inject, links, config);
};