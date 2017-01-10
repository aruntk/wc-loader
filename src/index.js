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
import extract from 'extract-loader';
import assign from 'object-assign';
import Synthesizer from './synthesis-gen.js';

function randomIdent() {
  return "xxxWCLINKxxx" + Math.random() + Math.random() + "xxx";
}

class DissectHtml {
  constructor(config, options) {
    this.dissected = {
      head: '<!--__wc__loader -->\n',
      body: '<!--__wc__loader -->\n',
      js: '', // js is appened last
    };
    this.config = config;
    this.links = {};
    this.options = options;
    this.publicPath = typeof config.publicPath !== "undefined" ? config.publicPath : options.output.publicPath;
  }
  dissect(contents, sourcePath) {
    this.path = sourcePath;
    const self = this;
    const children = contents.childNodes || [];
    this.processChildNodes(children);
    // this.dissected.js += `\n${this.dissected.js}\n`;
  }
  processChildNodes(childNodes) {
    const self = this;
    let pushNodes = [];
    const processedNodes = _.compact(_.map(childNodes, (child) => {
      switch (child.nodeName) {
        case 'head':
        case 'body': {
          const _child = child;
          _child.childNodes = self.processChildNodes(_child.childNodes);
          const _childContents = parse5.serialize(_child);
          this.dissected[_child.nodeName] = _childContents;
          // const where = _child.nodeName === 'head';
          // self.dissected.js += `\n${Synthesizer.generateJS(_childContents, where)}\n`;
        }
          break;

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
  processStyle(css) {
    return polyclean.stripCss(css);
  }
  processScripts(child) {
    const self = this;
    const importSource = _.find(child.attrs, v => (v.name === 'src'));
    if (importSource && importSource.value) {
      const importableUrl = self.importableUrl(importSource.value);
      if (!importableUrl) {
        return child;
      }
      self.dissected.js += `\nrequire('${importableUrl}');\n`;
    } else {
      self.dissected.js += `\n${self.babelJs(parse5.serialize(child))}\n`;
    }
    return null;
  }
  babelJs(js) {
    // const prod = process.env.NODE_ENV ==='production';
    try {
      return Babel.transform(js).code;; 
    }
    catch (err) {
      console.error(`Error in ${this.path}`);
      console.error(err);
    }
  }
  _changeRelUrl(inpUrl, basePath) {
    // avoids var(--url-variable) and bound properties [[prop]] and {{prop}};
    if (inpUrl && !inpUrl.match(/var\(.*?\)|({{|\[\[)\s*[\w\.]+\s*(}}|\]\])/ig)) {
      // avoids absolute & remote urls
      const link = this.parseUrl(inpUrl);
      if (link) {
        do {
          var ident = randomIdent();
        } while(this.links[ident]);
        this.links[ident] = link;
        return ident;
      }
    }
    return inpUrl;
  }
  parseUrl(link) {
    const root = this.config.root;
    if(!loaderUtils.isUrlRequest(link, root)) return;
    const uri = url.parse(link);
    if (uri.hash !== null && uri.hash !== undefined) {
      uri.hash = null;
      link = uri.format();
    }
    return link;
  }
  importableUrl(link) {
    const parsedLink = this.parseUrl(link);
    return parsedLink? loaderUtils.urlToRequest(parsedLink, this.config.root): link;
  }
  processLinks(child) {
    const self = this;
    // <link rel='import'...> and <link rel='stylesheet'...>
    const supportedRels = ['import', 'stylesheet'];
    const ifImport = _.find(child.attrs, v => (v.name === 'rel' && supportedRels.indexOf(v.value) > -1));
    if (ifImport) {
      const hrefAttr = _.find(child.attrs, v => v.name === 'href');
      if (hrefAttr) {
        if (hrefAttr.value) {
          switch (ifImport.value) {
            case 'import': {
              // file is imported using require
              const link = self.importableUrl(hrefAttr.value);
              if (!link) {
                return child;
              }
              const typeAttr = _.find(child.attrs, v => (v.name === 'type'));
              if (typeAttr) {
                switch (typeAttr.value) {
                  case 'css':
                    return self.processCssImport(hrefAttr, child);
                  default:
                    break;
                }
              }
              const importable = `require('${link}');`;
              self.dissected.js += `\n${importable}\n`;
            }
              break;
              // Processing <link rel='stylesheet' href='filename.css'>
            case 'stylesheet':
              // absolute file path
              return self.processCssImport(hrefAttr, child);
            default:
              break;
          }
        }
      } else {
        return child;
      }
    } else {
      return child;
    }
    return null;
  }
  processCssImport(hrefAttr, child) {
    const link = path.resolve(this.path, '../', hrefAttr.value);
    // checks if file exists
    if (fs.existsSync(link)) {
      const contents = fs.readFileSync(link, 'utf8');
      // css is inlined
      const minified = this.processStyle(contents);
      if (minified) {
        // link tag is replaced with style tag
        return _.extend(child, {
          nodeName: 'style',
          tagName: 'style',
          attrs: [],
          childNodes: [
            {
              nodeName: '#text',
              value: minified,
            },
          ],
        });
      }
    }
    return child;
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
  if (this.cacheable) {
    this.cacheable();
  }
  const config = getLoaderConfig(this);
  const root = config.root;
  const srcFilepath = this.resourcePath;
  const parsed = parse5.parse(source);
  const dissectFn = new DissectHtml(config, this.options);
  dissectFn.dissect(parsed, srcFilepath);
  const head = dissectFn.dissected.head;
  const body = dissectFn.dissected.body;
  const inject = dissectFn.dissected.js;
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
