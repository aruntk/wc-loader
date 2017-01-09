/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Arun Kumar T K @aruntk
  */
import loaderUtils from 'loader-utils';
import SourceMap from 'source-map';
import parse5 from 'parse5';
import polyclean from 'polyclean';
import fs from 'fs';
import url from 'url';
import path from 'path';
import * as _ from 'lodash';
import * as Babel from 'babel-core';
import assign from 'object-assign';

function randomIdent() {
  return "xxxWCLINKxxx" + Math.random() + Math.random() + "xxx";
}

class DissectHtml {
  constructor(config) {
    this.config = config;
    this.dissected = {
      out: '//*wc*//\n',
      tail: '', // tail is appended last
    };
    this.links = {};
  }
  dissect(ast, sourcePath) {
    this.path = sourcePath;
    const self = this;
    ast.childNodes = this.processChildNodes(ast.childNodes || []);
    let html = parse5.serialize(ast);
    html += `\n<script>${this.dissected.tail}</script>\n`;
    this.dissected.out = `\n${this.exportHtml(html)}`
  }
  exportHtml(html) {
    const config = this.config;
    const root = config.root;
    const links = this.links;
    const htmlStr = JSON.stringify(html);
    let exportsString = "module.exports = ";
    if (config.exportAsDefault) {
      exportsString = "exports.default = ";

    } else if (config.exportAsEs6Default) {
      exportsString = "export default ";
    }

    return exportsString + htmlStr.replace(/xxxWCLINKxxx[0-9\.]+xxx/g, function(match) {
      if(!links[match]) return match;
      return '" + require(' + JSON.stringify(loaderUtils.urlToRequest(links[match], root)) + ') + "';
    }) + ";";
  }
  processChildNodes(childNodes) {
    const self = this;
    let pushNodes = [];
    const processedNodes = _.compact(_.map(childNodes, (child) => {
      switch (child.nodeName) {
        case 'template': {
          const template = child;
          const tmContent = template.content;
          const isWalkable = tmContent && tmContent.nodeName === '#document-fragment' && tmContent.childNodes;
          if (isWalkable) {
            tmContent.childNodes = self.processChildNodes(tmContent.childNodes);
          }
          template.content = tmContent;
          return template;
        }
        case 'link': {
          const processedLinkChild = self.processLinks(child);
          if (processedLinkChild) {
            return processedLinkChild;
          }
        }
          break;
        case 'script': {
          const result = self.processScripts(child);
          if (result) {
            return result;
          }
        }
          break;
        case 'style': {
          if (child.childNodes && child.childNodes.length) {
            const childNode = child.childNodes[0];
            const css = childNode.value;
            const result = self.processStyle(css);
            if (result) {
              childNode.value = result;
            }
          }
          return child;
        }
        case 'dom-module': {
          const domModule = child;
          if (domModule.childNodes) {
            domModule.childNodes = self.processChildNodes(domModule.childNodes);
          }
          return domModule;
        }
        case 'div': {
          const divChild = child;
          const attrs = _.filter(divChild.attrs, o => (o.name === 'hidden' || o.name === 'by-vulcanize'));
          if (attrs.length >= 2) {
            const _childNodes = self.processChildNodes(divChild.childNodes);
            pushNodes = pushNodes.concat(_childNodes);
          } else {
            if (divChild.childNodes) {
              divChild.childNodes = self.processChildNodes(divChild.childNodes);
            }
            return divChild;
          }
        }
          break;
        case '#comment':
        case '#documentType':
          break;
        default: {
          const defChild = child;
          const attrs = _.map(defChild.attrs, (o) => {
            // all src values without [[*]] and {{*}}
            if (o.name === 'src' || o.name === 'src$') {
              o.value = self._changeRelUrl(o.value);
            }
            return o;
          });
          defChild.attrs = attrs;
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
  processStyle(css, cssBasePath) {
    return this._changeCssUrls(polyclean.stripCss(css), cssBasePath);
  }
  processScripts(child) {
    const importSource = this.changeLinks(child, 'src');
    if (importSource && importSource.value) {
      return child;
    }
    this.dissected.tail += `\n${this.babelJs(parse5.serialize(child))}\n`;
    return null;
  }
  changeLinks(child, attr) {
    const self = this;
    return _.find(child.attrs, (v, i) => {
      if(v.name === attr) {
        const link = self._changeRelUrl(v.value);
        if(link) {
          child.attrs[i].value = link;
        }
        return true;
      }
    });
  }
  babelJs(js) {
    // const prod = process.env.NODE_ENV ==='production';
    return Babel.transform(js).code;
  }

  importableUrl(link) {
    const root = this.config.root;
    if(!loaderUtils.isUrlRequest(link, root)) return;
    const uri = url.parse(link);
    if (uri.hash !== null && uri.hash !== undefined) {
      uri.hash = null;
      link = uri.format();
    }
    do {
      var ident = randomIdent();
    } while(this.links[ident]);
    this.links[ident] = link;
    return ident;
  }
  processLinks(child) {
    const self = this;
    // <link rel='import'...> and <link rel='stylesheet'...>
    const hrefAttr = this.changeLinks(child, 'href');
    return child;
  }
  _changeRelUrl(inpUrl, basePath) {

    // avoids var(--url-variable) and bound properties [[prop]] and {{prop}};
    if (inpUrl && !inpUrl.match(/var\(.*?\)|({{|\[\[)\s*[\w\.]+\s*(}}|\]\])/ig)) {
      // avoids absolute & remote urls
      const link = this.importableUrl(inpUrl);
      if (link) {
        return link;
      }
    }
    return inpUrl;
  }
  _changeCssUrls(text, cssBasePath) {
    const self = this;
    // to get -> property: url(filepath)

    const processed = text.replace(/url\(['|"]?([^)]+?)['|"]?\)/ig, function(_u, link) {
      // to get -> filepath from url(filepath), url('filepath') and url("filepath")
      return `url(${self._changeRelUrl(link, cssBasePath)})`;
    });
    return processed;
  }
}


function getLoaderConfig(context) {
  const query = loaderUtils.parseQuery(context.query);
  const configKey = query.config || 'wcLoader';
  const config = context.options && context.options.hasOwnProperty(configKey) ? context.options[configKey] : {};

  delete query.config;

  return assign(query, config);
}
module.exports = function (source, sourceMap) {
  // const query = loaderUtils.parseQuery(this.query);

  if (this.cacheable) {
    this.cacheable();
  }
  const config = getLoaderConfig(this);
  let attributes = ['img:src'];
  if(config.attrs !== undefined) {
    if(typeof config.attrs === 'string')
      attributes = config.attrs.split(' ');
    else if(Array.isArray(config.attrs))
      attributes = config.attrs;
    else if(config.attrs === false)
      attributes = [];
    else
      throw new Error('Invalid value to config parameter attrs');
  }
  const root = config.root;
  // /foo/bar/file.js
  const srcFilepath = this.resourcePath;
  // /foo/bar/file.js -> file
  // const srcFilename = path.basename(srcFilepath, path.extname(srcFilepath));
  // /foo/bar/file.js -> /foo/bar
  // const srcDirpath  = path.dirname(srcFilepath);
  // /foo/bar -> bar
  // const srcDirname  = srcDirpath.split(path.sep).pop();
  const parsed = parse5.parse(source);
  const dissectFn = new DissectHtml(config);
  dissectFn.dissect(parsed, srcFilepath);
  const inject = dissectFn.dissected.out;
  if (sourceMap) {
    const currentRequest = loaderUtils.getCurrentRequest(this);
    const SourceNode = SourceMap.SourceNode;
    const SourceMapConsumer = SourceMap.SourceMapConsumer;
    const sourceMapConsumer = new SourceMapConsumer(sourceMap);
    const node = SourceNode.fromStringWithSourceMap(source, sourceMapConsumer);

    node.prepend(inject);

    const result = node.toStringWithSourceMap({
      file: currentRequest,
    });

    this.callback(null, result.code, result.map.toJSON());

    return;
  }

  // prepend collected inject at the top of file
  return inject;
};
